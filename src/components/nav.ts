import {
  Sun, Rows3, Compass, CalendarRange, Share2, Repeat, Tags, Coins, Settings as SettingsIcon,
} from 'lucide-react'

/** Primary destinations — the only things in the tab bar. */
export const PRIMARY_NAV = [
  { to: '/', label: 'Today', icon: Sun, end: true },
  { to: '/ledger', label: 'Ledger', icon: Rows3 },
  { to: '/plan', label: 'Plan', icon: Compass },
] as const

/** Secondary destinations — the "More" list on mobile, a quiet group in the sidebar. */
export const SECONDARY_NAV = [
  { to: '/week', label: 'Week', icon: CalendarRange },
  { to: '/shared', label: 'Shared', icon: Share2 },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/assets', label: 'Assets', icon: Coins },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const
