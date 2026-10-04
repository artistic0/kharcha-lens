import { create } from 'zustand'
import type { Filter } from './engine/aggregate'
import { emptyRules, type CategoryId, type ParseResult, type UserRules } from './engine/types'
import { ingestFile } from './ingest'
import { sampleResults } from './sample/sampleResults'

export type View = 'overview' | 'compare' | 'transactions' | 'recurring' | 'ignored' | 'files' | 'privacy'

export interface Job {
  id: string
  name: string
  status: 'reading' | 'password' | 'done' | 'error'
  passwordWrong?: boolean
  message?: string
  anonymizedLayout?: string
}

const RULES_KEY = 'kharchalens.rules.v1'

/** The only thing ever written to this device, and only when the user switches it on. */
function loadRules(): { rules: UserRules; remember: boolean } {
  try {
    const raw = localStorage.getItem(RULES_KEY)
    if (raw) return { rules: { ...emptyRules(), ...(JSON.parse(raw) as UserRules) }, remember: true }
  } catch {
    // Storage blocked (private window): fall through to defaults.
  }
  return { rules: emptyRules(), remember: false }
}

function persist(rules: UserRules, remember: boolean) {
  try {
    if (remember) localStorage.setItem(RULES_KEY, JSON.stringify(rules))
    else localStorage.removeItem(RULES_KEY)
  } catch {
    // Ignore: rules still work for this session.
  }
}

/** Files waiting for a password stay in memory only until they are read or removed. */
const pendingFiles = new Map<string, File>()

interface State {
  jobs: Job[]
  results: ParseResult[]
  duplicatesNote: string | null
  rules: UserRules
  rememberRules: boolean
  view: View
  filter: Filter
  categoryFocus: CategoryId | null
  addOpen: boolean
  setAddOpen: (open: boolean) => void
  addFiles: (files: File[]) => Promise<void>
  submitPassword: (jobId: string, password: string) => Promise<void>
  dismissJob: (jobId: string) => void
  removeStatement: (statementId: string) => void
  loadSample: () => void
  wipe: () => void
  setView: (v: View) => void
  setFilter: (f: Partial<Filter>) => void
  focusCategory: (c: CategoryId | null) => void
  setPayeeCategory: (payeeKey: string, category: CategoryId | null) => void
  setSelf: (payeeKey: string, isSelf: boolean | null) => void
  setOwnAccounts: (accounts: string[]) => void
  setRemember: (on: boolean) => void
}

const initial = loadRules()

export const useStore = create<State>((set, get) => {
  const updateRules = (fn: (r: UserRules) => UserRules) => {
    const rules = fn(get().rules)
    persist(rules, get().rememberRules)
    set({ rules })
  }

  async function run(jobId: string, file: File, password?: string) {
    const outcome = await ingestFile(file, jobId, password)
    if (outcome.ok) {
      pendingFiles.delete(jobId)
      set((s) => ({
        results: [...s.results.filter((r) => r.statement.id !== jobId), outcome.result],
        jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: 'done', message: undefined } : j)),
      }))
      return
    }
    if (outcome.code === 'PASSWORD') {
      pendingFiles.set(jobId, file)
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: 'password', passwordWrong: 'incorrect' in outcome && outcome.incorrect } : j)),
      }))
      return
    }
    pendingFiles.delete(jobId)
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? { ...j, status: 'error', message: outcome.message, anonymizedLayout: 'anonymizedLayout' in outcome ? outcome.anonymizedLayout : undefined }
          : j,
      ),
    }))
  }

  return {
    jobs: [],
    results: [],
    duplicatesNote: null,
    rules: initial.rules,
    rememberRules: initial.remember,
    view: 'overview',
    filter: { accounts: null },
    categoryFocus: null,
    addOpen: false,
    setAddOpen: (addOpen) => set({ addOpen }),

    async addFiles(files) {
      const jobs: Job[] = files.map((f) => ({ id: crypto.randomUUID().slice(0, 8), name: f.name, status: 'reading' }))
      set((s) => ({ jobs: [...s.jobs, ...jobs] }))
      await Promise.all(jobs.map((j, i) => run(j.id, files[i]).catch((e) => {
        set((s) => ({ jobs: s.jobs.map((x) => (x.id === j.id ? { ...x, status: 'error', message: String(e) } : x)) }))
      })))
    },
    async submitPassword(jobId, password) {
      const file = pendingFiles.get(jobId)
      if (!file) return
      set((s) => ({ jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: 'reading' } : j)) }))
      await run(jobId, file, password)
    },
    dismissJob(jobId) {
      pendingFiles.delete(jobId)
      set((s) => ({ jobs: s.jobs.filter((j) => j.id !== jobId) }))
    },
    removeStatement(statementId) {
      set((s) => ({
        results: s.results.filter((r) => r.statement.id !== statementId),
        jobs: s.jobs.filter((j) => j.id !== statementId),
      }))
    },
    loadSample() {
      set({ results: sampleResults(), jobs: [], view: 'overview', filter: { accounts: null } })
    },
    wipe() {
      pendingFiles.clear()
      persist(emptyRules(), false)
      set({ jobs: [], results: [], rules: emptyRules(), rememberRules: false, filter: { accounts: null }, categoryFocus: null, view: 'overview', addOpen: false })
    },
    setView: (view) => set({ view }),
    setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
    focusCategory: (categoryFocus) => set({ categoryFocus }),
    setPayeeCategory(payeeKey, category) {
      updateRules((r) => {
        const payeeCategory = { ...r.payeeCategory }
        if (category) payeeCategory[payeeKey] = category
        else delete payeeCategory[payeeKey]
        return { ...r, payeeCategory }
      })
    },
    setSelf(payeeKey, isSelf) {
      updateRules((r) => ({
        ...r,
        selfPayees: isSelf === true ? [...new Set([...r.selfPayees, payeeKey])] : r.selfPayees.filter((k) => k !== payeeKey),
        notSelfPayees: isSelf === false ? [...new Set([...r.notSelfPayees, payeeKey])] : r.notSelfPayees.filter((k) => k !== payeeKey),
      }))
    },
    setOwnAccounts(accounts) {
      updateRules((r) => ({ ...r, ownAccounts: accounts }))
    },
    setRemember(on) {
      persist(get().rules, on)
      set({ rememberRules: on })
    },
  }
})
