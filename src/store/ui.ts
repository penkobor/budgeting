import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface UiState {
  theme: Theme
  paletteOpen: boolean
  currentSpaceId: string | null
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setPaletteOpen: (open: boolean) => void
  setCurrentSpaceId: (id: string | null) => void
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      paletteOpen: false,
      currentSpaceId: null,
      setTheme: (t) => {
        document.documentElement.classList.toggle('dark', t === 'dark')
        set({ theme: t })
      },
      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      setCurrentSpaceId: (id) => set({ currentSpaceId: id }),
    }),
    { name: 'budgeting-ui' }
  )
)

// Apply theme class on first load
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem('budgeting-ui')
    const t = raw ? JSON.parse(raw)?.state?.theme : 'dark'
    document.documentElement.classList.toggle('dark', t !== 'light')
  } catch {
    document.documentElement.classList.add('dark')
  }
}
