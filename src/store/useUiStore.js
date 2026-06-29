import { create } from 'zustand'

const STORAGE_KEY = 'nf-theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export const useUiStore = create((set, get) => ({
  theme: getInitialTheme(),
  mobileNavOpen: false,
  aiSearchOpen: false,

  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  setMobileNav: (open) => set({ mobileNavOpen: open }),
  setAiSearch: (open) => set({ aiSearchOpen: open }),
  toggleAiSearch: () => set((s) => ({ aiSearchOpen: !s.aiSearchOpen })),
}))
