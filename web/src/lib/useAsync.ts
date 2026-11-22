import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string
}

/**
 * useAsync 统一处理带取消语义的 GET 请求：组件卸载或依赖变化时中止上一次请求，
 * 避免竞态导致的旧数据覆盖与新数据。
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: '' })
  const [version, setVersion] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reload = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setState((prev) => ({ data: prev.data, loading: true, error: '' }))
    loaderRef
      .current(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) {
          return
        }
        setState({ data, loading: false, error: '' })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setState({ data: null, loading: false, error: err instanceof Error ? err.message : '加载失败' })
      })
    return () => controller.abort()
    // deps 由调用方声明，此处显式忽略 lint 提示以保持 API 简洁。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  return { ...state, reload }
}
