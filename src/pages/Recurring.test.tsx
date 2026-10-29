// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RecurringPage } from './Recurring'

const mock = vi.hoisted(() => ({ save: vi.fn(), rules: vi.fn() }))
vi.mock('@/hooks/queries', () => ({
  useRecurringRules: mock.rules,
  useSettings: () => ({ data: { currency: 'CZK' } }),
  useUpcomingRecurringOverrides: () => ({ data: [] }),
  useUpsertRule: () => ({ mutateAsync: mock.save, mutate: vi.fn(), isPending: false }),
  useDeleteRule: () => ({ mutate: vi.fn() }),
  useCategories: () => ({ data: [] }),
}))

const rule = { id: 'subscription', name: 'Subscription', amount: 600, kind: 'expense',
  frequency: 'monthly', day_of_month: 15, starts_on: '2026-01-01', ends_on: null, active: true, is_shared: false }
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })
  mock.rules.mockReturnValue({ data: [rule] })
  mock.save.mockReset().mockResolvedValue({})
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
async function open() {
  await act(async () => root.render(<RecurringPage />))
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Edit Subscription"]')!.click())
}
async function endDate(value: string) {
  const input = document.querySelectorAll<HTMLInputElement>('input[type="date"]')[1]
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function submit() {
  await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

it('ends a rule without disabling it or changing its past start date and price', async () => {
  await open()
  await endDate('2026-10-31')
  await submit()
  expect(mock.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    id: 'subscription', starts_on: '2026-01-01', ends_on: '2026-10-31', amount: 600, active: true,
  }))
})

it('loads an existing end date and explicitly clears it to null when removed', async () => {
  mock.rules.mockReturnValue({ data: [{ ...rule, ends_on: '2026-10-31' }] })
  await open()
  expect(document.querySelectorAll<HTMLInputElement>('input[type="date"]')[1].value).toBe('2026-10-31')
  await endDate('')
  await submit()
  expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ ends_on: null }))
})

it('rejects an end date before the start date', async () => {
  await open()
  await endDate('2025-12-31')
  expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
  await submit()
  expect(mock.save).not.toHaveBeenCalled()
})

it('keeps the date and shows a useful error if saving fails', async () => {
  mock.save.mockRejectedValueOnce(new Error('offline'))
  await open()
  await endDate('2026-10-31')
  await submit()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not save')
  expect(document.querySelectorAll<HTMLInputElement>('input[type="date"]')[1].value).toBe('2026-10-31')
})
