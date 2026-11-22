import { useEffect, useRef } from 'react'
import { InkScene } from '../effects/inkScene'
import { useTheme } from '../context/ThemeContext'

/**
 * InkBackground 挂载全屏水墨背景。画布固定在视口底层，
 * 页面内容滚动时云山几乎不动，形成“人在画外看画”的层次。
 */
export function InkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<InkScene | null>(null)
  const { mode } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const scene = new InkScene(canvas)
    sceneRef.current = scene
    scene.setMood(mode)
    scene.start()
    return () => {
      scene.stop()
      sceneRef.current = null
    }
    // 场景只创建一次；主题变化由下面的 effect 同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    sceneRef.current?.setMood(mode)
  }, [mode])

  return (
    <div className="ink-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="ink-canvas" />
      <div className="ink-backdrop__wash" />
      <div className="ink-backdrop__vignette" />
    </div>
  )
}
