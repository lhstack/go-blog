import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { SiteInfo } from '../api/types'

interface SiteContextValue {
  site: SiteInfo | null
  loading: boolean
  error: string
  reload: () => void
}

const SiteContext = createContext<SiteContextValue>({
  site: null,
  loading: true,
  error: '',
  reload: () => undefined,
})

// SiteProvider 在应用启动时拉取站点配置，供页头、页脚与关于页共享。
export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [site, setSite] = useState<SiteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const reload = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    api
      .getSite(controller.signal)
      .then((data) => {
        setSite(data)
        setError('')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setError(err instanceof Error ? err.message : '加载站点信息失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [version])

  const value = useMemo(() => ({ site, loading, error, reload }), [site, loading, error, reload])
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite(): SiteContextValue {
  return useContext(SiteContext)
}
