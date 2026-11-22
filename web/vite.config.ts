import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发时把 API 与上传文件代理到 Go 服务，生产环境由 Go 直接托管构建产物。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../internal/webassets/dist',
    emptyOutDir: true,
    sourcemap: false,
    // antd 体积较大且被前台共用，单块 361KB(gzip) 属于预期范围。
    chunkSizeWarningLimit: 1200,
    // React 与 antd 体积固定且很少变动，单独分包利于浏览器长期缓存。
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          markdown: ['markdown-it', 'dompurify'],
          // highlight.js 全量语言包（约 313KB gzip）单独命名，便于按需懒加载与观察体积。
          highlight: ['highlight.js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/rss.xml': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
})
