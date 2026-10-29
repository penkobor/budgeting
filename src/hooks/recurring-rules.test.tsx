// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { useUpsertRule } from './queries'

const db = vi.hoisted(() => ({ upsert: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: db.upsert }) } }))

it('refreshes rolled-forward openings as well as rules after changing a schedule', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const keys = [['recurring_rules'], ['monthly_opening', '2026-11-01'], ['monthly_opening', '2026-12-01']]
  keys.forEach(key => client.setQueryData(key, {}))
  const change = { id: 'old', name: 'Subscription', amount: 600, frequency: 'monthly' as const,
    starts_on: '2026-01-01', ends_on: '2026-10-31' }
  db.upsert.mockReturnValue({ select: () => ({ single: async () => ({ data: change, error: null }) }) })
  let mutation: ReturnType<typeof useUpsertRule>
  function Harness() { mutation = useUpsertRule(); return null }
  const root = createRoot(document.createElement('div'))
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>))
    await act(async () => { await mutation.mutateAsync(change) })
    keys.forEach(key => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
  } finally {
    await act(async () => root.unmount())
    client.clear()
  }
})
