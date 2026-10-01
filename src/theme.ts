// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Light / dark theme.
 *
 * The page theme is one attribute, <html data-theme="light|dark">. A small
 * inline script in index.html sets it before first paint (so there is no
 * flash of the wrong theme) from the visitor's saved choice, falling back to
 * the system setting, and keeps following the system while no choice is
 * saved. This module is the React side: read and change that choice.
 *
 * Keep STORAGE_KEY and the resolution rules in step with the script in
 * index.html.
 */
import { useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const STORAGE_KEY = 'pc-theme'

/** Browser chrome color (mobile address bar) per theme: the paper color. */
const THEME_COLOR: Record<Theme, string> = { light: '#faf9f5', dark: '#3a3a3a' }

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The saved choice, or 'system' when nothing is saved or storage is blocked. */
export function readThemeChoice(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(choice: ThemeChoice): Theme {
  return choice === 'system' ? systemTheme() : choice
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

/** Saves the choice (or clears it for 'system') and applies it now. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Storage blocked (private mode, site data off): the choice lasts for this page view.
  }
  applyTheme(resolveTheme(choice))
}

/** The current choice plus a setter, for the Appearance control. */
export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice())

  // Another tab changed it: follow along.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const next = readThemeChoice()
      setChoice(next)
      applyTheme(resolveTheme(next))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function update(next: ThemeChoice) {
    setThemeChoice(next)
    setChoice(next)
  }

  return [choice, update]
}
