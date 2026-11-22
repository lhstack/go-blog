import { useEffect, useRef, useState } from 'react'
import { useAudio, useChime } from '../context/AudioContext'

interface Splash {
  id: number
  x: number
  y: number
  size: number
  petals: { angle: number; distance: number; scale: number }[]
}

let nextId = 1

/**
 * ClickInk 负责鼠标点击时的“落墨”动画：
 * 点击处扩散一枚墨环，并甩出若干墨点花瓣，页面任意位置都可触发。
 * 指针为触摸或系统要求减少动效时不渲染，避免打扰阅读。
 */
export function ClickInk() {
  const [splashes, setSplashes] = useState<Splash[]>([])
  const enabled = useRef(true)
  const { playing } = useAudio()
  const chime = useChime()
  const playingRef = useRef(playing)
  playingRef.current = playing

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarse = window.matchMedia('(pointer: coarse)')
    const sync = () => {
      enabled.current = !reduced.matches && !coarse.matches
    }
    sync()
    reduced.addEventListener('change', sync)
    coarse.addEventListener('change', sync)
    return () => {
      reduced.removeEventListener('change', sync)
      coarse.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!enabled.current || event.button !== 0) {
        return
      }
      const petals = Array.from({ length: 7 }, (_, index) => ({
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.5,
        distance: 18 + Math.random() * 26,
        scale: 0.5 + Math.random() * 0.9,
      }))
      const splash: Splash = {
        id: nextId++,
        x: event.clientX,
        y: event.clientY,
        size: 26 + Math.random() * 16,
        petals,
      }
      setSplashes((current) => [...current.slice(-5), splash])
      if (playingRef.current) {
        chime()
      }
      // 动画结束后回收节点，避免无限堆积。
      window.setTimeout(() => {
        setSplashes((current) => current.filter((item) => item.id !== splash.id))
      }, 900)
    }

    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [chime])

  return (
    <div className="click-ink" aria-hidden="true">
      {splashes.map((splash) => (
        <div key={splash.id} className="click-ink__splash" style={{ left: splash.x, top: splash.y }}>
          <span className="click-ink__ring" style={{ width: splash.size, height: splash.size }} />
          <span className="click-ink__core" style={{ width: splash.size * 0.34, height: splash.size * 0.34 }} />
          {splash.petals.map((petal, index) => (
            <span
              key={index}
              className="click-ink__petal"
              style={
                {
                  '--petal-x': `${Math.cos(petal.angle) * petal.distance}px`,
                  '--petal-y': `${Math.sin(petal.angle) * petal.distance}px`,
                  '--petal-scale': petal.scale,
                  width: 3 + petal.scale * 4,
                  height: 3 + petal.scale * 4,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}
