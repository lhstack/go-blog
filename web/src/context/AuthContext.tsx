import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, ApiError, getToken, setToken } from '../api/client'
import type { Profile } from '../api/types'

interface AuthContextValue {
  profile: Profile | null
  ready: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  ready: false,
  login: async () => undefined,
  logout: () => undefined,
  reload: async () => undefined,
})

// AuthProvider 负责令牌持久化与登录状态恢复。
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)

  const loadProfile = useCallback(async () => {
    if (!getToken()) {
      setProfile(null)
      setReady(true)
      return
    }
    try {
      setProfile(await api.me())
    } catch (err) {
      // 令牌过期或账号失效时清理本地状态，交由路由守卫跳转登录页。
      if (err instanceof ApiError && err.status === 401) {
        setToken('')
      }
      setProfile(null)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const login = useCallback(async (username: string, password: string) => {
    const session = await api.login(username, password)
    setToken(session.token)
    setProfile(await api.me())
    setReady(true)
  }, [])

  const logout = useCallback(() => {
    setToken('')
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({ profile, ready, login, logout, reload: loadProfile }),
    [profile, ready, login, logout, loadProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
