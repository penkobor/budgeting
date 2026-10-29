import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'system' | 'light' | 'dark'

const THEME_COLORS = { light: '#f2f2f7', dark: '#18181b' } as const
const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function isDark(t: Theme) {
  return t === 'dark' || (t === 'system' && !!darkQuery?.matches)
}

function applyTheme(t: Theme) {
  const dark = isDark(t)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light)
  })
}

interface UiState {
  theme: Theme
  paletteOpen: boolean
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setPaletteOpen: (open: boolean) => void
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      paletteOpen: false,
      setTheme: (t) => {
        applyTheme(t)
        set({ theme: t })
      },
      toggleTheme: () => get().setTheme(isDark(get().theme) ? 'light' : 'dark'),
      setPaletteOpen: (open) => set({ paletteOpen: open }),
    }),
    {
      name: 'budgeting-ui',
      version: 1,
      // v0 defaulted to a hard 'dark'; v1 follows the OS appearance.
      migrate: (state) => ({ ...(state as UiState), theme: 'system' }),
    }
  )
)

export function useIsDark() {
  return isDark(useUi((s) => s.theme))
}

// Apply theme on first load and follow OS changes while in 'system' mode.
if (typeof window !== 'undefined') {
  applyTheme(useUi.getState().theme)
  darkQuery?.addEventListener('change', () => {
    if (useUi.getState().theme === 'system') applyTheme('system')
  })
}
