import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'day' | 'night'
/** ThemePreference 记录用户意图：跟随系统，或明确指定昼 / 夜。 */
export type ThemePreference = 'system' | ThemeMode

const STORAGE_KEY = 'goblog.theme'

interface ThemeContextValue {
  mode: ThemeMode
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'day',
  preference: 'system',
  setPreference: () => undefined,
  toggle: () => undefined,
})

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'night' || stored === 'day' || stored === 'system') {
    return stored
  }
  // 没有存过偏好时跟随系统，首次访问就与访客的明暗习惯一致。
  return 'system'
}

function resolveMode(preference: ThemePreference): ThemeMode {
  if (preference === 'system') {
    return darkQuery().matches ? 'night' : 'day'
  }
  return preference
}

// ThemeProvider 维护“逍遥昼 / 混沌夜”两套主题，并把状态写到 html[data-theme]。
// 偏好设为 system 时会实时跟随系统配色，用户手动切换后则固定下来。
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [mode, setModeState] = useState<ThemeMode>(() => resolveMode(readStoredPreference()))

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = mode
    root.style.colorScheme = mode === 'night' ? 'dark' : 'light'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', mode === 'night' ? '#0b1016' : '#f5efe3')
    }
    localStorage.setItem(STORAGE_KEY, preference)
  }, [mode, preference])

  // 跟随系统时监听系统配色变化，只在 system 偏好下生效。
  useEffect(() => {
    if (preference !== 'system') {
      return
    }
    const query = darkQuery()
    const onChange = () => setModeState(query.matches ? 'night' : 'day')
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    setModeState(resolveMode(next))
  }, [])

  // toggle 是“手动选择”的入口：一旦按下就不再跟随系统。
  const toggle = useCallback(() => {
    setPreferenceState((current) => {
      const next: ThemeMode = resolveMode(current) === 'day' ? 'night' : 'day'
      setModeState(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ mode, preference, setPreference, toggle }),
    [mode, preference, setPreference, toggle],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
