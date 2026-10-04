import {
  ArrowDownLeft,
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Car,
  CreditCard,
  Ellipsis,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Percent,
  Receipt,
  Repeat,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  TrendingUp,
  Users,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CategoryId } from '../engine/types'

export const CATEGORY_ICON: Record<CategoryId, LucideIcon> = {
  food: Utensils,
  groceries: ShoppingBasket,
  rent: House,
  bills: Zap,
  shopping: ShoppingBag,
  travel: Car,
  subscriptions: Repeat,
  health: HeartPulse,
  education: GraduationCap,
  emi: Landmark,
  insurance: ShieldCheck,
  cardbill: CreditCard,
  cash: Banknote,
  transfers: Users,
  fees: Receipt,
  misc: Ellipsis,
  investments: TrendingUp,
  self: ArrowLeftRight,
  salary: Briefcase,
  refunds: RotateCcw,
  interest: Percent,
  income_other: ArrowDownLeft,
}

export const SLOTS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7']

/**
 * Category icon in a tinted circle. The tint is the category's chart color, so the icon,
 * the breakdown bar and the legend always agree on which color means what.
 */
export function CategoryIcon({ id, color, size = 36 }: { id: CategoryId; color: string; size?: number }) {
  const Icon = CATEGORY_ICON[id] ?? Ellipsis
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color: `color-mix(in srgb, ${color} 80%, var(--ink))`,
      }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2} />
    </span>
  )
}

/** Initials avatar for payees without an icon. */
export function Initials({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const letters =
    name
      .replace(/[^A-Za-z ]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '•'
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-2xl text-sm font-semibold"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color: `color-mix(in srgb, ${color} 75%, var(--ink))`,
      }}
    >
      {letters}
    </span>
  )
}
