import { theme as antdTheme } from 'antd'
import type { ThemeConfig } from 'antd'
import type { ThemeMode } from '../context/ThemeContext'

const SERIF =
  "'Songti SC', 'STSong', 'Noto Serif SC', 'Noto Serif CJK SC', 'Source Han Serif SC', KaiTi, 'Kaiti SC', STKaiti, serif"
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', Roboto, sans-serif"

// buildAntdTheme 把水墨配色映射到 antd token，昼夜切换只换一套变量。
export function buildAntdTheme(mode: ThemeMode): ThemeConfig {
  const night = mode === 'night'
  return {
    algorithm: night ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: night ? '#b04a34' : '#a8402f',
      colorInfo: night ? '#d4755f' : '#a8402f',
      colorLink: night ? '#d4755f' : '#a8402f',
      colorBgBase: night ? '#0b1016' : '#f5efe3',
      colorBgContainer: night ? 'rgba(20, 28, 37, 0.97)' : 'rgba(255, 253, 247, 0.985)',
      colorBgElevated: night ? '#151d26' : '#fffdf7',
      colorBorder: night ? 'rgba(233, 228, 217, 0.18)' : 'rgba(43, 40, 35, 0.14)',
      colorBorderSecondary: night ? 'rgba(233, 228, 217, 0.12)' : 'rgba(43, 40, 35, 0.09)',
      colorText: night ? '#e8e2d6' : '#2b2823',
      colorTextSecondary: night ? '#9aa3ab' : '#79726a',
      colorTextTertiary: night ? '#78828c' : '#948c81',
      borderRadius: 10,
      borderRadiusLG: 14,
      fontFamily: SANS,
      fontSize: 14,
      controlHeight: 36,
      wireframe: false,
    },
    components: {
      Card: {
        borderRadiusLG: 14,
        /* 后台卡片承载表格与表单，用接近不透明的宣纸底，避免山脊透上来干扰阅读 */
        colorBgContainer: night ? 'rgba(20, 28, 37, 0.97)' : 'rgba(255, 253, 247, 0.985)',
      },
      Button: { controlHeight: 36, fontWeight: 500, primaryShadow: 'none' },
      Menu: { itemBorderRadius: 8, itemHeight: 40 },
      Input: { activeShadow: 'none' },
      Tag: { defaultBg: night ? 'rgba(233, 228, 217, 0.08)' : 'rgba(43, 40, 35, 0.05)' },
      Typography: { titleMarginBottom: 0.5 },
      Divider: { colorSplit: night ? 'rgba(233, 228, 217, 0.12)' : 'rgba(43, 40, 35, 0.1)' },
    },
  }
}

export const serifFont = SERIF
