import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './App'
import { AudioProvider } from './context/AudioContext'
import { AuthProvider } from './context/AuthContext'
import { SiteProvider } from './context/SiteContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { SiteTitle } from './components/SiteTitle'
import { InkBackground } from './components/InkBackground'
import { ClickInk } from './components/ClickInk'
import { MouseComet } from './components/MouseComet'
import { buildAntdTheme } from './theme/antd'
import './index.css'

// ThemedApp 需要读取主题上下文，因此必须位于 ThemeProvider 内部。
// 音效由 AudioProvider 提供，点击落墨会复用它的播放状态，所以也包在外层。
function ThemedApp() {
  const { mode } = useTheme()

  return (
    <ConfigProvider locale={zhCN} theme={buildAntdTheme(mode)}>
      <AntdApp>
        <InkBackground />
        <ClickInk />
        <MouseComet />
        <BrowserRouter>
          <SiteProvider>
            <AuthProvider>
              <SiteTitle />
              <AppRoutes />
            </AuthProvider>
          </SiteProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AudioProvider>
        <ThemedApp />
      </AudioProvider>
    </ThemeProvider>
  </StrictMode>,
)
