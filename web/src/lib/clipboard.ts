/**
 * copyText 把文本写入剪贴板，并用返回值如实报告结果。
 *
 * 浏览器只在安全上下文（HTTPS 或 localhost）暴露 navigator.clipboard，
 * 局域网里用 http 访问时会直接失败。此时退回 textarea + execCommand，
 * 它虽已废弃但仍是该场景下唯一可行的路径；两条路都失败就返回 false，
 * 由调用方给出“复制失败”的明确提示，而不是假装成功。
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return legacyCopy(text)
    }
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}
