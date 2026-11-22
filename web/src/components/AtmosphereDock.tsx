import { useEffect, useRef, useState } from 'react'
import { Slider } from 'antd'
import {
  CloseOutlined,
  CustomerServiceOutlined,
  MoonOutlined,
  PauseCircleOutlined,
  SettingOutlined,
  SoundOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { useAudio } from '../context/AudioContext'
import { useTheme } from '../context/ThemeContext'

// useCompactDock 判断是否窄屏：窄屏下浮坞收成一枚按钮，避免遮住正文与代码块。
function useCompactDock(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 420px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 420px)')
    const sync = () => setCompact(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return compact
}

/**
 * AtmosphereDock 是右下角的“逍遥浮坞”：控制昼夜、背景音乐与音量。
 * 音乐与控制面板都由纯前端合成，不依赖外部音频文件。
 * 面板打开时点击外部或按 Esc 收起，避免挡住正文；
 * 窄屏下气泡收起为单个按钮，点击后再展开三个开关。
 */
export function AtmosphereDock() {
  const { mode, preference, setPreference } = useTheme()
  const { playing, volume, needsGesture, toggle, setVolume } = useAudio()
  const [panelOpen, setPanelOpen] = useState(false)
  const [stackOpen, setStackOpen] = useState(false)
  const compact = useCompactDock()
  const dockRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!panelOpen) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setPanelOpen(false)
        setStackOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanelOpen(false)
        setStackOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [panelOpen])

  const themeOptions = [
    { value: 'system' as const, label: '随系统' },
    { value: 'day' as const, label: '昼' },
    { value: 'night' as const, label: '夜' },
  ]

  return (
    <div className="atmosphere-dock" ref={dockRef}>
      {panelOpen && (
        <div className="atmosphere-dock__panel">
          <div className="atmosphere-dock__panel-title">
            <span>山水清音</span>
            <button
              type="button"
              className="atmosphere-dock__button atmosphere-dock__button--mini"
              onClick={() => setPanelOpen(false)}
              aria-label="收起设置面板"
            >
              <CloseOutlined />
            </button>
          </div>

          <div className="atmosphere-dock__group-label">纸色</div>
          <div className="atmosphere-dock__segmented" role="group" aria-label="纸色偏好">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`atmosphere-dock__segment${
                  preference === option.value ? ' atmosphere-dock__segment--active' : ''
                }`}
                onClick={() => setPreference(option.value)}
                aria-pressed={preference === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="atmosphere-dock__group-label">清音</div>
          <Slider
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            tooltip={{ formatter: (value) => `${value}%` }}
            onChange={(value) => setVolume(value / 100)}
            aria-label="背景音量"
          />
          <div className="atmosphere-dock__hint">
            {needsGesture
              ? '浏览器拦截了自动播放，点一下页面任意处即可续上。'
              : playing
                ? '五声音阶由浏览器实时合成，切到别的标签页会自动静音。'
                : '点击右侧音符，听一段即兴的清音。'}
          </div>
        </div>
      )}

      <div className="atmosphere-dock__buttons">
        {compact && !stackOpen ? (
          <button
            type="button"
            className="atmosphere-dock__button"
            onClick={() => setStackOpen(true)}
            aria-label="展开山水浮坞"
            aria-expanded={false}
            title="山水浮坞"
          >
            <SettingOutlined />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="atmosphere-dock__button"
              onClick={() => setPanelOpen((open) => !open)}
              aria-label="调整背景音量"
              aria-expanded={panelOpen}
              title="山水清音"
            >
              <SoundOutlined />
            </button>

            <button
              type="button"
              className={`atmosphere-dock__button${playing ? ' atmosphere-dock__button--on' : ''}`}
              onClick={toggle}
              aria-label={playing ? '关闭背景音乐' : '开启背景音乐'}
              title={playing ? '关闭背景音乐' : '开启背景音乐'}
            >
              {playing ? <PauseCircleOutlined /> : <CustomerServiceOutlined />}
            </button>

            <button
              type="button"
              className="atmosphere-dock__button"
              onClick={() => setPreference(mode === 'day' ? 'night' : 'day')}
              aria-label={mode === 'day' ? '切换到夜色' : '切换到昼光'}
              title={mode === 'day' ? '切换到夜色' : '切换到昼光'}
            >
              {mode === 'day' ? <MoonOutlined /> : <SunOutlined />}
            </button>

            {compact && (
              <button
                type="button"
                className="atmosphere-dock__button"
                onClick={() => {
                  setStackOpen(false)
                  setPanelOpen(false)
                }}
                aria-label="收起山水浮坞"
                title="收起"
              >
                <CloseOutlined />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
