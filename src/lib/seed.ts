import { supabase } from './supabase'
import type { CategoryInsert, RecurringRuleInsert, TransactionInsert } from './db.types'

/**
 * Seed data captured from the user's Numbers spreadsheet — April 2026.
 * Idempotent-ish: uses unique category names; will skip if categories exist.
 */
export async function seedAprilFromNumbers() {
  const { data: existing, error: e1 } = await supabase.from('categories').select('id').limit(1)
  if (e1) throw e1
  if ((existing?.length ?? 0) > 0) {
    throw new Error('Data already exists. Clear it first or skip seeding.')
  }

  // ---- Categories ----
  const cats: CategoryInsert[] = [
    { name: 'Income',        kind: 'income',  color: '#10b981', sort_order: 0 },
    { name: 'Subscriptions', kind: 'expense', color: '#8b5cf6', sort_order: 10 },
    { name: 'Rent',          kind: 'expense', color: '#f59e0b', sort_order: 20 },
    { name: 'Loan',          kind: 'expense', color: '#ef4444', sort_order: 30 },
    { name: 'Education',     kind: 'expense', color: '#06b6d4', sort_order: 40 },
    { name: 'Family',        kind: 'expense', color: '#ec4899', sort_order: 50 },
    { name: 'Food',          kind: 'expense', color: '#22c55e', sort_order: 60 },
    { name: 'Going out',     kind: 'expense', color: '#f97316', sort_order: 70 },
    { name: 'Other',         kind: 'expense', color: '#94a3b8', sort_order: 99 },
  ]
  const { data: inserted, error: e2 } = await supabase.from('categories').insert(cats).select()
  if (e2) throw e2
  const byName = Object.fromEntries((inserted ?? []).map((c) => [c.name, c.id]))

  // ---- Recurring rules (Fixed Payments table) ----
  const rules: RecurringRuleInsert[] = [
    { name: 'Бабушка',       amount: 5000,  kind: 'expense', category_id: byName['Family'],        frequency: 'monthly', day_of_month: 6,  starts_on: '2026-01-01' },
    { name: 'YT Premium',    amount: 84,    kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 13, starts_on: '2026-01-01' },
    { name: 'Xbox',          amount: 239,   kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 21, starts_on: '2026-01-01' },
    { name: 'Apple Music',   amount: 165,   kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 1,  starts_on: '2026-01-01' },
    { name: 'Autoškola',     amount: 10000, kind: 'expense', category_id: byName['Education'],     frequency: 'monthly', day_of_month: 12, starts_on: '2026-01-01' },
    { name: 'Alza Neo',      amount: 352,   kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 3,  starts_on: '2026-01-01' },
    { name: 'Litačka',       amount: 550,   kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 18, starts_on: '2026-01-01' },
    { name: 'Vodafone',      amount: 1000,  kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 20, starts_on: '2026-01-01' },
    { name: 'Routinery',     amount: 109,   kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 28, starts_on: '2026-01-01' },
    { name: 'Netflix',       amount: 100,   kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 27, starts_on: '2026-01-01' },
    { name: 'Apple iCloud',  amount: 79,    kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 14, starts_on: '2026-01-01' },
    { name: 'Loan',          amount: 2600,  kind: 'expense', category_id: byName['Loan'],          frequency: 'monthly', day_of_month: 21, starts_on: '2026-01-01' },
    { name: 'Adobe Firefly', amount: 550,   kind: 'expense', category_id: byName['Subscriptions'], frequency: 'monthly', day_of_month: 23, starts_on: '2026-01-01' },
    { name: 'Rent',          amount: 22000, kind: 'expense', category_id: byName['Rent'],          frequency: 'monthly', day_of_month: 24, starts_on: '2026-01-01' },
    // "Going out" 4×/month and Food daily are tracked as transactions, not rules.
  ]
  const { error: e3 } = await supabase.from('recurring_rules').insert(rules)
  if (e3) throw e3

  // ---- April 2026 daily transactions (planned/actual budget) ----
  const food = byName['Food']
  const goingOut = byName['Going out']
  const income = byName['Income']

  // Going out planned days: 4, 11, 19, 26 — 3500–4000 CZK each
  const goingOutDays: Array<[number, number]> = [
    [4, 4000],
    [11, 3500],
    [19, 3500],
    [26, 3500],
  ]

  // Salary income
  const incomes: Array<[string, number]> = [
    ['2026-04-16', 3010],   // shown as -3010 in 'income' column = refund
    ['2026-04-20', 75300],  // main salary
  ]

  const txs: TransactionInsert[] = []

  // Food: 323 CZK every day in April
  for (let d = 1; d <= 30; d++) {
    txs.push({
      occurred_on: `2026-04-${String(d).padStart(2, '0')}`,
      amount: -323,
      description: 'Food',
      category_id: food,
      planned: true,
    })
  }

  for (const [day, amt] of goingOutDays) {
    txs.push({
      occurred_on: `2026-04-${String(day).padStart(2, '0')}`,
      amount: -amt,
      description: 'Going out',
      category_id: goingOut,
      planned: true,
    })
  }

  for (const [date, amt] of incomes) {
    txs.push({
      occurred_on: date,
      amount: amt,
      description: amt > 0 ? 'Salary / income' : 'Refund',
      category_id: income,
      planned: true,
    })
  }

  // Insert in chunks
  const chunk = 500
  for (let i = 0; i < txs.length; i += chunk) {
    const { error } = await supabase.from('transactions').insert(txs.slice(i, i + chunk))
    if (error) throw error
  }

  // ---- Opening balance ----
  // From the Numbers sheet: April starts at 125000 CZK on day -1 (== March 31 carry-over)
  await supabase.from('monthly_openings').upsert(
    { month: '2026-04-01', opening_balance: 125000 },
    { onConflict: 'user_id,month' }
  )
}
