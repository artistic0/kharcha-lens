import type { CategoryId } from './types'

export type CategoryKind = 'spend' | 'saving' | 'excluded' | 'income'

export interface CategoryMeta {
  id: CategoryId
  label: string
  kind: CategoryKind
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'food', label: 'Food & dining', kind: 'spend' },
  { id: 'groceries', label: 'Groceries', kind: 'spend' },
  { id: 'rent', label: 'Rent & housing', kind: 'spend' },
  { id: 'bills', label: 'Bills & utilities', kind: 'spend' },
  { id: 'shopping', label: 'Shopping', kind: 'spend' },
  { id: 'travel', label: 'Travel & fuel', kind: 'spend' },
  { id: 'subscriptions', label: 'Subscriptions', kind: 'spend' },
  { id: 'health', label: 'Health & fitness', kind: 'spend' },
  { id: 'education', label: 'Education', kind: 'spend' },
  { id: 'emi', label: 'EMI & loans', kind: 'spend' },
  { id: 'insurance', label: 'Insurance', kind: 'spend' },
  { id: 'cardbill', label: 'Credit card bills', kind: 'spend' },
  { id: 'cash', label: 'Cash (ATM)', kind: 'spend' },
  { id: 'transfers', label: 'Transfers to people', kind: 'spend' },
  { id: 'fees', label: 'Fees & charges', kind: 'spend' },
  { id: 'misc', label: 'Misc', kind: 'spend' },
  { id: 'investments', label: 'Investments & savings', kind: 'saving' },
  { id: 'self', label: 'Self-transfer', kind: 'excluded' },
  { id: 'salary', label: 'Salary', kind: 'income' },
  { id: 'refunds', label: 'Refunds', kind: 'income' },
  { id: 'interest', label: 'Interest', kind: 'income' },
  { id: 'income_other', label: 'Other income', kind: 'income' },
]

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, CategoryMeta>

export const SPEND_CATEGORIES = CATEGORIES.filter((c) => c.kind === 'spend').map((c) => c.id)

export const categoryLabel = (id: CategoryId) => CATEGORY_BY_ID[id]?.label ?? id

export const isSpend = (id: CategoryId) => CATEGORY_BY_ID[id]?.kind === 'spend'
