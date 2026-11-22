import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Ambience } from '../lib/ambience'
import { Reverb } from '../lib/reverb'

const PLAYING_KEY = 'goblog.ambience'
const VOLUME_KEY = 'goblog.volume'

interface AudioContextValue {
  playing: boolean
  volume: number
  /** needsGesture 为真时说明浏览器拦截了自动播放，等用户点一下再继续。 */
  needsGesture: boolean
  toggle: () => void
  setVolume: (volume: number) => void
}

const AudioCtx = createContext<AudioContextValue>({
  playing: false,
  volume: 0.5,
  needsGesture: false,
  toggle: () => undefined,
  setVolume: () => undefined,
})

function readVolume(): number {
  const raw = Number.parseFloat(localStorage.getItem(VOLUME_KEY) ?? '')
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) {
    return raw
  }
  return 0.5
}

// AudioProvider 管理背景音乐：偏好持久化，自动播放被拦截时降级为“点击后继续”。
export function AudioProvider({ children }: { children: React.ReactNode }) {
  const ambience = useRef<Ambience | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolumeState] = useState(readVolume)
  const [needsGesture, setNeedsGesture] = useState(() => localStorage.getItem(PLAYING_KEY) === 'on')

  const start = useCallback(
    async (nextVolume: number) => {
      ambience.current ??= new Ambience()
      try {
        await ambience.current.start(nextVolume)
        setPlaying(true)
        setNeedsGesture(false)
        localStorage.setItem(PLAYING_KEY, 'on')
      } catch {
        // 自动播放被拦截：保持需要手势的状态，不假装已播放。
        setPlaying(false)
        setNeedsGesture(true)
      }
    },
    [],
  )

  const stop = useCallback(() => {
    ambience.current?.stop()
    setPlaying(false)
    setNeedsGesture(false)
    localStorage.setItem(PLAYING_KEY, 'off')
  }, [])

  const toggle = useCallback(() => {
    if (playing) {
      stop()
    } else {
      void start(volume)
    }
  }, [playing, start, stop, volume])

  const setVolume = useCallback((next: number) => {
    setVolumeState(next)
    localStorage.setItem(VOLUME_KEY, String(next))
    ambience.current?.setVolume(next)
  }, [])

  // 用户上次开着音乐时，监听第一次交互补上播放（浏览器要求的手势解锁）。
  useEffect(() => {
    if (!needsGesture) {
      return
    }
    const resume = () => void start(volume)
    window.addEventListener('pointerdown', resume, { once: true })
    window.addEventListener('keydown', resume, { once: true })
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [needsGesture, start, volume])

  // 切到其他标签页时暂停合成，避免访客在别处工作时仍在响；回来后自动续上。
  useEffect(() => {
    const onVisibility = () => {
      const instance = ambience.current
      if (!instance) {
        return
      }
      if (document.hidden) {
        instance.suspend()
      } else if (playing) {
        void instance.resume()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [playing])

  useEffect(() => () => ambience.current?.stop(), [])

  const value = useMemo(
    () => ({ playing, volume, needsGesture, toggle, setVolume }),
    [playing, volume, needsGesture, toggle, setVolume],
  )
  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>
}

export function useAudio(): AudioContextValue {
  return useContext(AudioCtx)
}

/**
 * useChime 返回一个点击音效触发器：一声短促的清越铃音，
 * 复用独立的小型 AudioContext，与背景音乐互不影响。
 */
export function useChime(): () => void {
  const contextRef = useRef<AudioContext | null>(null)
  const reverbRef = useRef<Reverb | null>(null)

  return useCallback(() => {
    const context = contextRef.current ?? new AudioContext()
    contextRef.current = context
    if (context.state === 'suspended') {
      void context.resume()
    }
    if (!reverbRef.current) {
      reverbRef.current = new Reverb(context, [0.019, 0.031, 0.047], 0.26)
      reverbRef.current.connect(context.destination)
    }

    const now = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)

    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880 + Math.random() * 260, now)
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.14)

    oscillator.connect(gain)
    gain.connect(context.destination)
    if (reverbRef.current) {
      gain.connect(reverbRef.current.input)
    }
    oscillator.start(now)
    oscillator.stop(now + 0.55)
  }, [])
}
