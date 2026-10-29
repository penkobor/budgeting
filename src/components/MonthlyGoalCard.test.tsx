// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { MonthlyGoalCard } from './MonthlyGoalCard'
import { GoalAlertRibbon } from './GoalAlertRibbon'

const mocks = vi.hoisted(() => ({
  save: vi.fn(), clear: vi.fn(), goal: vi.fn(), range: vi.fn(),
}))
vi.mock('@/hooks/queries', () => ({
  useMonthlyGoal: mocks.goal,
  useMonthlyGoalsInRange: mocks.range,
  useUpsertMonthlyGoals: () => ({ mutateAsync: mocks.save, isPending: false }),
  useDeleteMonthlyGoal: () => ({ mutateAsync: mocks.clear, isPending: false }),
  useSettings: () => ({ data: { currency: 'CZK' } }),
  useMonthlyOpening: () => ({ data: { opening_balance: 160000 } }),
  useTransactionsInRange: () => ({ data: [] }),
  useRecurringRules: () => ({ data: [] }),
  useRecurringOverridesInRange: () => ({ data: [] }),
  useAssets: () => ({ data: [] }),
}))
vi.mock('@/components/ui/Toast', () => ({ pushToast: vi.fn() }))

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })
  mocks.save.mockReset().mockResolvedValue([])
  mocks.clear.mockReset().mockResolvedValue(undefined)
  mocks.goal.mockReset().mockReturnValue({ data: { amount: 200000 }, isLoading: false })
  mocks.range.mockReset().mockReturnValue({ data: [{ year_month: '2026-11', amount: 210000 }], isPending: false })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function open() {
  await act(async () => root.render(<MonthlyGoalCard yearMonth="2026-10" projectedEnd={160000} currency="CZK" />))
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
}
async function fill(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!
  await act(async () => {
    const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function submit() {
  await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

it('defaults to changing just the selected month, accepts a pasted spaced amount', async () => {
  await open()
  expect(document.body.textContent).toContain('Only October 2026 will change')
  await fill('input[type="text"]', '150 000')
  await submit()
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith([{ year_month: '2026-10', amount: 150000 }])
})

it('previews existing goals and saves the entire range in one request', async () => {
  await open()
  await fill('input[type="text"]', '150000')
  await fill('select', '2026-12')
  expect(document.body.textContent).toContain('Existing goals in this range will be replaced')
  expect(document.body.textContent).toContain('210,000')
  await submit()
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith([
    { year_month: '2026-10', amount: 150000 },
    { year_month: '2026-11', amount: 150000 },
    { year_month: '2026-12', amount: 150000 },
  ])
})

it('retains the form and amount after a failed save', async () => {
  mocks.save.mockRejectedValueOnce(new Error('offline'))
  await open()
  await fill('input[type="text"]', '150000')
  await submit()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not save')
  expect(document.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('150000')
})

it('does not save a reversed range or an unavailable overwrite preview', async () => {
  await open()
  await fill('select', '2026-09')
  await submit()
  expect(mocks.save).not.toHaveBeenCalled()
  mocks.range.mockReturnValue({ data: [], isPending: false, isError: true })
  await fill('select', '2026-12')
  await submit()
  expect(mocks.save).not.toHaveBeenCalled()
})

it('clears only the selected month even when a multi-month range is shown', async () => {
  await open()
  await fill('select', '2026-12')
  const clear = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Clear this month')!
  await act(async () => clear.click())
  expect(mocks.clear).toHaveBeenCalledExactlyOnceWith('2026-10')
  expect(mocks.save).not.toHaveBeenCalled()
})

it('looks up the dashboard warning with the same YYYY-MM key as the editor', async () => {
  await act(async () => root.render(<MemoryRouter><GoalAlertRibbon /></MemoryRouter>))
  expect(mocks.goal.mock.calls.at(-1)?.[0]).toMatch(/^\d{4}-\d{2}$/)
  expect(host.textContent).toContain('40,000')
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/?lens=month')
})
