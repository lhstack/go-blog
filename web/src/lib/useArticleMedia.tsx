import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { copyText } from './clipboard'

interface LightboxState {
  src: string
  alt: string
}

/**
 * useArticleMedia 为正文补上两类阅读便利：
 * 1. 代码块右上角出现“复制”按钮，点击写入剪贴板并短暂回馈；
 * 2. 点击正文图片打开灯箱，再点一次或按 Esc 关闭。
 * 返回的节点由调用方渲染在正文容器之后。
 */
export function useArticleMedia(html: string) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)

  // 复制按钮在 HTML 插入 DOM 之后挂载，因此依赖 html 变化重新绑定。
  useEffect(() => {
    const root = document.querySelector('.markdown-body')
    if (!root) {
      return
    }
    const blocks = root.querySelectorAll('pre')
    const cleanups: (() => void)[] = []

    for (const block of blocks) {
      if (block.querySelector('.code-copy')) {
        continue
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'code-copy'
      button.textContent = '复制'
      button.setAttribute('aria-label', '复制代码')

      const onClick = async () => {
        const code = block.querySelector('code')?.textContent ?? ''
        const ok = await copyText(code)
        if (ok) {
          button.textContent = '已复制'
          button.dataset.done = 'true'
        } else {
          // 非安全上下文下剪贴板不可用，明确告知而不是假装成功。
          button.textContent = '复制失败'
          button.dataset.done = 'false'
        }
        window.setTimeout(() => {
          button.textContent = '复制'
          button.dataset.done = 'false'
        }, 1600)
      }

      button.addEventListener('click', onClick)
      block.appendChild(button)
      cleanups.push(() => {
        button.removeEventListener('click', onClick)
        button.remove()
      })
    }

    const images = root.querySelectorAll('img')
    const imageCleanups: (() => void)[] = []
    for (const image of images) {
      const onClick = () => setLightbox({ src: image.src, alt: image.alt })
      image.addEventListener('click', onClick)
      image.classList.add('markdown-body__zoomable')
      imageCleanups.push(() => image.removeEventListener('click', onClick))
    }

    return () => {
      for (const cleanup of [...cleanups, ...imageCleanups]) {
        cleanup()
      }
    }
  }, [html])

  // 灯箱打开时锁定滚动，Esc 关闭。
  useEffect(() => {
    if (!lightbox) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightbox(null)
      }
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [lightbox])

  // 灯箱必须挂到 body：祖先 .app-main 的入场动画会残留 transform，
  // 那会让 position: fixed 相对它定位，灯箱就会跑到视口外面去。
  const node = lightbox
    ? createPortal(
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt || '图片预览'}
          onClick={() => setLightbox(null)}
        >
          <figure className="image-lightbox__frame">
            <img src={lightbox.src} alt={lightbox.alt} />
            {lightbox.alt && <figcaption>{lightbox.alt}</figcaption>}
          </figure>
        </div>,
        document.body,
      )
    : null

  return { lightboxNode: node }
}
