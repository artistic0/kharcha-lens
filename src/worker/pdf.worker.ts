// pdf.js worker, with network APIs removed first (see lockdown.ts).
import './lockdown'
import 'pdfjs-dist/build/pdf.worker.min.mjs'
