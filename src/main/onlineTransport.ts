import { BrowserWindow, session, type Session } from 'electron'
import { onlineUrl } from '../shared/online'
import { decodeTextBuffer } from './text'
import type { OnlineFetch } from './online'

let isolated: Session | undefined
function onlineSession(): Session {
  if (isolated) return isolated
  isolated = session.fromPartition('persist:readex-online')
  isolated.setUserAgent(isolated.getUserAgent().replace(/\s(?:Readex|Electron)\/[^ ]+/gi, ''))
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  isolated.setPermissionCheckHandler(() => false)
  isolated.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    try { onlineUrl(details.url); callback({ cancel: false }) } catch { callback({ cancel: true }) }
  })
  return isolated
}

/** Runs in a separate Chromium session, preserving system proxy and Chinese encoding support. */
export const fetchOnlineHtml: OnlineFetch = async (input, options = {}) => {
  let url = onlineUrl(input).href
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)
  try {
    for (let i = 0; i < 6; i++) {
      const response = await onlineSession().fetch(url, {
        method: options.body ? 'POST' : 'GET',
        body: options.body,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } : {}),
          ...(options.referer ? { Referer: onlineUrl(options.referer).href } : {})
        }
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error('网站重定向地址为空')
        url = onlineUrl(location, url).href
        continue
      }
      if (!response.ok) throw new Error(`网站返回 HTTP ${response.status}，请稍后重试`)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('网站返回空内容')
      const chunks: Buffer[] = []
      let size = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('网页内容过大，暂时无法加载') }
        chunks.push(Buffer.from(part.value))
      }
      const bytes = Buffer.concat(chunks)
      const charset = /charset=["']?([a-z0-9_-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]
        ?? /charset=["']?([a-z0-9_-]+)/i.exec(bytes.subarray(0, 2048).toString('ascii'))?.[1]
      let html: string
      try { html = charset ? new TextDecoder(charset).decode(bytes) : decodeTextBuffer(bytes) }
      catch { html = decodeTextBuffer(bytes) }
      if (!options.body && /<title>Loading\.\.\.<\/title>/i.test(html)) return await renderCookieCheck(url)
      return html
    }
    throw new Error('网站重定向次数过多')
  } catch (error) {
    if (controller.signal.aborted) throw new Error('网站连接超时，请检查网络后重试')
    throw error
  } finally { clearTimeout(timeout) }
}

async function renderCookieCheck(url: string): Promise<string> {
  // The provider's own cookie check executes in a sandbox without the app preload or IPC bridge.
  const window = new BrowserWindow({ show: false, webPreferences: { session: onlineSession(), sandbox: true, contextIsolation: true, nodeIntegration: false } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, target) => {
    try { onlineUrl(target) } catch { event.preventDefault() }
  })
  window.webContents.on('will-redirect', (event, target) => {
    try { onlineUrl(target) } catch { event.preventDefault() }
  })
  const timer = setTimeout(() => { if (!window.isDestroyed()) window.destroy() }, 20000)
  try {
    await window.loadURL(url)
    for (let i = 0; i < 12; i++) {
      const html = await window.webContents.executeJavaScript('document.documentElement.outerHTML') as string
      if (!/<title>Loading\.\.\.<\/title>/i.test(html)) return html
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    throw new Error('网站检查尚未完成，请稍后重试或打开原站')
  } finally { clearTimeout(timer); if (!window.isDestroyed()) window.destroy() }
}
