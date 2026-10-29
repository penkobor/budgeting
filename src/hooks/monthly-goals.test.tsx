// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { useUpsertMonthlyGoals } from './queries'

const db = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), select: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: db.from } }))

async function mutationFixture() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  db.from.mockReset().mockReturnValue({ upsert: db.upsert })
  db.upsert.mockReset().mockReturnValue({ select: db.select })
  db.select.mockReset()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const keys = [['monthly_goal', '2026-10'], ['monthly_goal', '2026-11'], ['monthly_goals', '2026-10', '2026-11']]
  keys.forEach((key) => client.setQueryData(key, { amount: 200000 }))
  client.setQueryData(['settings'], { currency: 'CZK' })
  let mutation: ReturnType<typeof useUpsertMonthlyGoals>
  function Harness() {
    mutation = useUpsertMonthlyGoals()
    return null
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>))
  return {
    client, keys,
    save: (goals: Parameters<typeof mutation.mutateAsync>[0]) => mutation.mutateAsync(goals),
    cleanup: async () => { await act(async () => root.unmount()); client.clear() },
  }
}

it('writes a goal range with one atomic upsert and invalidates single-month and range views', async () => {
  const fixture = await mutationFixture()
  try {
    const goals = [{ year_month: '2026-10', amount: 150000 }, { year_month: '2026-11', amount: 150000 }]
    db.select.mockResolvedValue({ data: goals, error: null })
    await act(async () => { await fixture.save(goals) })
    expect(db.from).toHaveBeenCalledExactlyOnceWith('monthly_goals')
    expect(db.upsert).toHaveBeenCalledExactlyOnceWith(goals, { onConflict: 'user_id,year_month' })
    fixture.keys.forEach((key) => expect(fixture.client.getQueryState(key)?.isInvalidated).toBe(true))
    expect(fixture.client.getQueryState(['settings'])?.isInvalidated).toBe(false)
  } finally {
    await fixture.cleanup()
  }
})

it('reports a failed batch without updating or invalidating saved goals', async () => {
  const fixture = await mutationFixture()
  try {
    db.select.mockResolvedValue({ data: null, error: new Error('offline') })
    await act(async () => {
      await expect(fixture.save([{ year_month: '2026-10', amount: 150000 }])).rejects.toThrow('offline')
    })
    fixture.keys.forEach((key) => {
      expect(fixture.client.getQueryState(key)?.isInvalidated).toBe(false)
      expect(fixture.client.getQueryData(key)).toEqual({ amount: 200000 })
    })
  } finally {
    await fixture.cleanup()
  }
})
