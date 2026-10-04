# KharchaLens

**See where your money goes. Your bank statement never leaves your device.**

Drop in bank statements (PDF, including password-protected ones, CSV or Excel). KharchaLens then:
- sorts every payment into categories such as food, rent, groceries, bills, subscriptions and EMIs
- charts the results
- compares months and accounts
- finds autopays and subscriptions, including price rises and trials that turned into paid plans

Transfers between your own accounts are left out of every total.

## Works with any bank

| Bank | Status |
|---|---|
| HDFC, SBI, ICICI | Built-in profiles, tested on synthetic statements in each bank's layout |
| Axis, Kotak, Bank of Baroda, PNB, Canara, IDFC FIRST | **Beta** profiles, built from their published column titles; marked "beta" in the app |
| Anything else | The generic reader. If it can't tell the columns apart, the **Fix columns** wizard asks you once |

**Fix columns** (`src/components/MapColumns.tsx`) shows the statement as a table and pre-fills its best guess for each column: Date, Description, Money out/in, Amount + Dr/Cr, Balance. Every change is re-checked against the running balance on the spot ("Balances check out (100%)"). Next time, a layout you taught is recognised by its column titles alone and applied automatically. That memory is part of the opt-in rules, and it never contains statement data.

**Inspect** (on each statement) shows:
- which bank profile was used
- how each column was read
- the balance-check score
- the rows that didn't add up

For PDFs with no recognisable column titles, the columns are found from the whitespace between them (`inferBands` in `src/engine/gridView.ts`).

## The privacy promise, and how it's enforced

| Layer | What it does |
|---|---|
| No backend | A static site. There is no server-side code or API, and no database. |
| CSP `connect-src 'none'` | The browser blocks every fetch, XHR, WebSocket and beacon, including requests to our own server. It is sent as an HTTP header (`dist/_headers`) and as a `<meta>` tag in `index.html`. |
| Workers load at startup | All code, including the PDF and engine workers, loads with the page. After that the request counter in the header stays at **0**. |
| Service worker | Precaches the app so it opens offline. It is the only script allowed `connect-src 'self'`, which it needs to read its own static files. |
| Lint rule | `oxlint` fails on `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `WebTransport` in `src/`. |
| Tests | Playwright uploads two statements while offline and asserts that **zero** requests were made. It also checks that an exfiltration attempt is blocked by the CSP, and that the opt-in storage holds no transaction data. |
| Storage | Nothing is stored by default. If you opt in, only your category rules and other account numbers (last 4 digits) are saved, in `localStorage`. Transactions are never stored. |

The CSP text lives in `src/security.ts`. The Privacy page shows that exact text.

## Run it

```bash
npm install
npm run dev        # http://localhost:5180 (no CSP in dev; HMR needs inline scripts)
npm run build      # type-check + production build into dist/
npm run preview    # http://localhost:4180, served with the production headers
```

Try it without a statement: **Try sample data** loads two made-up accounts.

To test with real bank-like files:

```bash
npm run synth      # writes fixtures/synthetic/*.pdf|xlsx|csv (fictional data)
```

Put your own real statements in `fixtures/private/`, which is gitignored. Load them through the UI, then check the **Files** tab:
- "Balances check out (100%)" means every row was read correctly.
- If a layout fails, use **Copy anonymized layout** (letters → A/a, digits → 9) to share its structure without the data.

## Tests

```bash
npm test           # Vitest: parsing (9 bank layouts), column wizard guesses, saved layouts, categories, self-transfers, recurring
npm run e2e        # Playwright against the production build: zero-network, password PDF,
                   # scanned PDF, offline reload, storage, recategorize + undo, dark mode, 375px phone
npm run lint
```

Synthetic statements (`src/sample/synth.ts` + `tools/synth/render.ts`) come with known answers. They are rendered as HDFC-, SBI- and ICICI-style PDFs, an XLSX and a Dr/Cr CSV, then parsed back and checked against those answers.

## How it works

```
File ─► pdf.js (own worker) ─► positioned text ─┐
CSV/XLSX ─────────────────────────────────────┐ │
                                              ▼ ▼
                         Engine worker: bank profile → table layout → rows
                         → amounts (paise) → running-balance check → narration parse
                                              │
                Main thread (pure, re-runs on every rule change):
                merge/dedupe → self-transfers → categories → recurring → aggregates → charts
```

- **Bank profiles.** Each bank is described in JSON in `src/engine/profiles/`: column aliases, date formats, and patterns for the holder name and account number. Adding a bank needs no code.
- **Balance check.** Every row is checked with `previous − debit + credit = balance`. For files with a single amount column, this check also decides whether each amount is a debit or a credit.
- **Self-transfers.** These are detected conservatively. A payment counts as a self-transfer only if one of these is true:
  - it goes to your own account (last 4 digits) or your own UPI ID
  - it matches a debit/credit pair across two of your uploaded accounts
  - the bank marked it as SELF, OWN A/C or FD
  - the payee has your first name and surname, or your initial and surname

  A payee who shares only your first name never counts. Mandates and NACH debits never count.
- **Categories.** Rules are tried in this order, and the first match wins:
  1. your rule for that payee
  2. self-transfer
  3. channel (ATM, charges, interest)
  4. the merchant dictionary (`merchants.json`)
  5. keywords
  6. the rent heuristic
  7. person-to-person transfer
  8. misc

  Every transaction shows why it got its category.

## Deploy (GitHub Pages)

`.github/workflows/deploy-pages.yml` publishes to `https://<user>.github.io/<repo>/` on every push to `main`. Before publishing, it:
- runs the unit tests and lint
- builds with `BASE_PATH=/<repo>/`
- checks that the privacy policy is in the built page

One-time setup: go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

GitHub Pages can't send custom HTTP headers, so the protection works like this:
- **The page.** The CSP `<meta>` tag in `index.html` still blocks every fetch, XHR, WebSocket and form post.
- **The workers.** Workers don't inherit the page's `<meta>` policy. Instead, `src/worker/lockdown.ts` removes `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `importScripts` before any library code runs.
- **Not available here:** `frame-ancestors` and `Permissions-Policy`, which only exist as headers. Use Cloudflare Pages if you want those too.

To prove this setup locally, `npm run e2e:ghpages` serves the build under `/kharcha-lens/` with **no** headers. It then checks for zero network requests during an offline upload, that sending data is blocked, and that the app works offline.

## Deploy (Cloudflare Pages)

1. Push the repo to GitHub, then create a Cloudflare Pages project from it.
2. Set the build command to `npm run build` and the output directory to `dist`.
3. `dist/_headers` is picked up automatically. Check it on the live site:

   ```bash
   curl -sI https://<your-domain>/ | grep -i content-security-policy
   ```

   The output must contain `connect-src 'none'`.

## Limits (today)

- Scanned (image-only) PDFs aren't supported. The app says so instead of guessing.
- Profiles are tuned for HDFC, SBI and ICICI. Other banks go through the generic reader, so check their reconcile % on the Files tab.
- Categories are rule-based. Correct a payee once and every payment to that payee follows.

Not financial advice. Not affiliated with any bank or with NPCI.
