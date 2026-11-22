import { useEffect, useRef } from 'react'

/**
 * MouseComet 是跟随鼠标的“墨气”光标：
 * 一枚带延迟的柔和光点始终追随指针，遇到链接、按钮、卡片时收束变大，
 * 形成浏览时的呼吸感。触摸设备与减少动效设置下自动停用。
 */
export function MouseComet() {
  const dotRef = useRef<HTMLDivElement | null>(null)
  const haloRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!fine.matches || reduced.matches) {
      return
    }

    const dot = dotRef.current
    const halo = haloRef.current
    if (!dot || !halo) {
      return
    }

    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let dotX = targetX
    let dotY = targetY
    let haloX = targetX
    let haloY = targetY
    let visible = false
    let hovering = false
    let raf = 0

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX
      targetY = event.clientY
      if (!visible) {
        visible = true
        dotX = targetX
        dotY = targetY
        haloX = targetX
        haloY = targetY
        dot.style.opacity = '1'
        halo.style.opacity = '1'
      }
      const element = event.target as Element | null
      const interactive = Boolean(
        element?.closest('a, button, input, textarea, select, [role="button"], .post-card, .side-card'),
      )
      if (interactive !== hovering) {
        hovering = interactive
        dot.classList.toggle('mouse-comet__dot--hover', hovering)
        halo.classList.toggle('mouse-comet__halo--hover', hovering)
      }
    }

    const onLeave = () => {
      visible = false
      dot.style.opacity = '0'
      halo.style.opacity = '0'
    }

    const onDown = () => {
      halo.classList.add('mouse-comet__halo--press')
      window.setTimeout(() => halo.classList.remove('mouse-comet__halo--press'), 220)
    }

    const loop = () => {
      dotX += (targetX - dotX) * 0.35
      dotY += (targetY - dotY) * 0.35
      haloX += (targetX - haloX) * 0.12
      haloY += (targetY - haloY) * 0.12
      dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%)`
      halo.style.transform = `translate3d(${haloX}px, ${haloY}px, 0) translate(-50%, -50%)`
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className="mouse-comet" aria-hidden="true">
      <div ref={haloRef} className="mouse-comet__halo" />
      <div ref={dotRef} className="mouse-comet__dot" />
    </div>
  )
}
