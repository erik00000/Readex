import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  screen,
  session,
  shell
} from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
  Annotation,
  AppSettings,
  FloatingReaderSync,
  ImportBatchResult,
  ReadingLocator,
  SearchResult
} from '../shared/types'
import { upgradeLegacyThemeColors } from '../shared/types'
import { createTitleBarTheme, TITLE_BAR_HEIGHT } from '../shared/theme'
import type { TtsSynthesisRequest } from '../shared/speech'
import { AnnotationIndex } from './annotationIndex'
import { registerBookProtocol, registerBookScheme } from './bookProtocol'
import { SpeechSynthesisService } from './speech'
import { ReadexStorage } from './storage'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const storage = new ReadexStorage()
const annotationIndex = new AnnotationIndex(storage)
const speechSynthesis = new SpeechSynthesisService(storage)
let mainWindow: BrowserWindow | null = null
let floatingWindow: BrowserWindow | null = null
let floatingBookId: string | null = null
let restoreMainAfterFloatingCloses = true
let quitting = false
let floatingDrag: { webContentsId: number; offsetX: number; offsetY: number } | null = null
const rendererRecoveryAttempts = new WeakMap<BrowserWindow, number>()
const rendererRecoveryTimers = new WeakMap<BrowserWindow, NodeJS.Timeout>()
const rendererTargets = new WeakMap<BrowserWindow, string>()

registerBookScheme()

const MAX_RENDERER_RECOVERY_ATTEMPTS = 2

function loadRenderer(window: BrowserWindow, query?: Record<string, string>): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
    const target = url.toString()
    rendererTargets.set(window, target)
    void window.loadURL(target)
  } else {
    const rendererPath = path.join(currentDirectory, '../renderer/index.html')
    void window.loadFile(rendererPath, { query })
    const target = pathToFileURL(rendererPath)
    for (const [key, value] of Object.entries(query ?? {})) target.searchParams.set(key, value)
    rendererTargets.set(window, target.toString())
  }
}

function secureWindow(window: BrowserWindow): void {
  const contents = window.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (isAllowedRendererNavigation(contents.getURL(), url)) return
    event.preventDefault()
  })
  contents.on('render-process-gone', (_event, details) => {
    if (quitting || details.reason === 'clean-exit') return
    recoverRenderer(window)
  })
  contents.on('did-finish-load', () => {
    if (contents.getURL().startsWith('data:text/html')) return
    const timer = rendererRecoveryTimers.get(window)
    if (timer) clearTimeout(timer)
    rendererRecoveryTimers.set(
      window,
      setTimeout(() => rendererRecoveryAttempts.delete(window), 15_000)
    )
  })
}

function isAllowedRendererNavigation(currentUrl: string, nextUrl: string): boolean {
  if (nextUrl.startsWith('devtools:')) return true
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl && nextUrl.startsWith(rendererUrl)) return true
  if (!currentUrl) return false

  try {
    const current = new URL(currentUrl)
    const next = new URL(nextUrl)
    if (current.protocol === 'file:' && next.protocol === 'file:') {
      return current.pathname === next.pathname
    }
    return current.origin === next.origin && current.pathname === next.pathname
  } catch {
    return false
  }
}

function recoverRenderer(window: BrowserWindow): void {
  if (window.isDestroyed()) return

  const attempt = (rendererRecoveryAttempts.get(window) ?? 0) + 1
  rendererRecoveryAttempts.set(window, attempt)
  const target = rendererTargets.get(window)
  if (!target) {
    void loadRendererErrorPage(window, '阅读界面意外退出，且没有可恢复的页面地址。')
    return
  }

  if (attempt > MAX_RENDERER_RECOVERY_ATTEMPTS) {
    void loadRendererErrorPage(
      window,
      `阅读界面连续恢复 ${MAX_RENDERER_RECOVERY_ATTEMPTS} 次失败。请关闭 Readex 后重新打开。`
    )
    return
  }

  void loadRendererErrorPage(window, `阅读界面意外退出，正在第 ${attempt} 次自动恢复…`)
  const timer = rendererRecoveryTimers.get(window)
  if (timer) clearTimeout(timer)
  rendererRecoveryTimers.set(
    window,
    setTimeout(() => {
      if (!window.isDestroyed()) void window.loadURL(target)
    }, 1_500)
  )
}

async function loadRendererErrorPage(window: BrowserWindow, message: string): Promise<void> {
  if (window.isDestroyed()) return
  const html = `<!doctype html>
<html lang="zh-CN">
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Readex</title>
  <style>
    :root { color-scheme: dark; font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #171717; color: #e8e8e8; }
    main { width: min(560px, calc(100vw - 64px)); }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0; color: #a8a8a4; line-height: 1.7; }
  </style>
  <body><main><h1>Readex 阅读界面已重新启动</h1><p>${escapeHtml(message)}</p></main></body>
</html>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function createWindow(): Promise<void> {
  // Paint the window and its native controls with the saved theme colors from the
  // first frame, so a light theme never flashes the dark fallback.
  const reader = upgradeLegacyThemeColors((await storage.getSettings()).reader)
  const titleBarTheme = createTitleBarTheme(reader)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 660,
    show: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: titleBarTheme.color,
      symbolColor: titleBarTheme.symbolColor,
      height: TITLE_BAR_HEIGHT
    },
    resizable: true,
    maximizable: true,
    minimizable: true,
    thickFrame: true,
    hasShadow: true,
    icon: app.isPackaged ? undefined : path.join(process.cwd(), 'build/readex.png'),
    backgroundColor: reader.backgroundColor,
    title: 'Readex',
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  secureWindow(mainWindow)

  mainWindow.on('maximize', () => sendWindowState())
  mainWindow.on('unmaximize', () => sendWindowState())
  mainWindow.on('enter-full-screen', () => sendWindowState())
  mainWindow.on('leave-full-screen', () => sendWindowState())
  mainWindow.on('closed', () => {
    const timer = rendererRecoveryTimers.get(mainWindow as BrowserWindow)
    if (timer) clearTimeout(timer)
    mainWindow = null
    if (floatingWindow) disposeFloatingReader()
  })

  loadRenderer(mainWindow)
}

async function openFloatingReader(
  bookId: string,
  requestedWidth: number,
  requestedHeight: number,
  locator: ReadingLocator | null
): Promise<boolean> {
  if (!mainWindow || mainWindow.isDestroyed()) return false

  const stored = await storage.getSettings()
  const settings: AppSettings = {
    ...stored,
    reader: upgradeLegacyThemeColors(stored.reader)
  }
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    if (floatingBookId === bookId) {
      const sync: FloatingReaderSync = { settings, locator }
      floatingWindow.webContents.send('window:floating-reader-sync', sync)
      mainWindow.hide()
      floatingWindow.show()
      floatingWindow.focus()
      return true
    }
    disposeFloatingReader()
  }

  const ownerBounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(ownerBounds).workArea
  const width = Math.max(360, Math.min(requestedWidth, workArea.width - 24))
  const height = Math.max(120, Math.min(requestedHeight, workArea.height - 24))
  const x = Math.round(workArea.x + (workArea.width - width) / 2)
  const y = Math.round(workArea.y + (workArea.height - height) / 2)

  floatingWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 360,
    minHeight: 120,
    show: false,
    frame: false,
    thickFrame: true,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    backgroundColor: settings.reader.backgroundColor,
    title: 'Readex 浮框阅读',
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  secureWindow(floatingWindow)
  floatingBookId = bookId
  restoreMainAfterFloatingCloses = true
  floatingWindow.on('closed', () => {
    const timer = rendererRecoveryTimers.get(floatingWindow as BrowserWindow)
    if (timer) clearTimeout(timer)
    const shouldRestore = restoreMainAfterFloatingCloses
    floatingWindow = null
    floatingBookId = null
    floatingDrag = null
    if (shouldRestore) restoreMainWindow()
  })
  loadRenderer(floatingWindow, { floatingReader: '1', bookId })
  floatingWindow.once('ready-to-show', () => {
    if (!floatingWindow) return
    mainWindow?.hide()
    floatingWindow.show()
    floatingWindow.focus()
  })
  return true
}

function disposeFloatingReader(): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) return
  restoreMainAfterFloatingCloses = false
  floatingWindow.destroy()
  floatingDrag = null
  floatingWindow = null
  floatingBookId = null
}

function hideFloatingReader(): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) return
  floatingWindow.hide()
  floatingDrag = null
  restoreMainWindow()
}

function sendWindowState(): void {
  if (!mainWindow) return
  mainWindow.webContents.send('window:state', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen()
  })
}

function restoreMainWindow(): void {
  if (quitting) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    mainWindow?.once('ready-to-show', () => {
      mainWindow?.webContents.send('window:floating-reader-restored')
    })
    return
  }
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('window:floating-reader-restored')
}

function registerIpc(): void {
  ipcMain.handle('library:list', () => storage.getLibrary())
  ipcMain.handle('library:choose-import', async (): Promise<ImportBatchResult | null> => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入图书',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '电子书',
          extensions: ['epub', 'mobi', 'pdf', 'txt']
        },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importWithProgress(result.filePaths)
  })
  ipcMain.handle('library:import-paths', (_, paths: string[]) => importWithProgress(paths))
  ipcMain.handle('library:remove', async (_, bookId: string, deleteSource: boolean) => {
    await storage.removeBook(bookId, deleteSource)
    annotationIndex.invalidate()
  })
  ipcMain.handle('library:reveal', async (_, bookId: string) => {
    const book = await storage.getBookRecord(bookId)
    if (!book) return
    shell.showItemInFolder(storage.getBookSourcePath(book))
  })

  ipcMain.handle('book:get-content', async (_, bookId: string) => {
    const book = await storage.getBookRecord(bookId)
    if (!book) return null
    const { getBookContent } = await import('./content')
    return getBookContent(storage, book)
  })
  ipcMain.handle('book:get-record', (_, bookId: string) => storage.getBookRecord(bookId))

  ipcMain.handle('speech:synthesize', (event, input: TtsSynthesisRequest) => {
    if (!isTrustedRendererUrl(event.senderFrame?.url ?? '')) {
      throw new Error('拒绝来自未知页面的听书请求')
    }
    return speechSynthesis.synthesize(input)
  })

  ipcMain.handle('annotations:list', (_, bookId: string) => storage.getAnnotations(bookId))
  ipcMain.handle('annotations:list-all', () => storage.getAllAnnotations())
  ipcMain.handle('annotations:save', async (_, annotation: Annotation) => {
    const saved = await storage.saveAnnotation(annotation)
    const book = await storage.getBookRecord(annotation.bookId)
    annotationIndex.updateBook(annotation.bookId, book?.title ?? '未知书籍', saved)
    return saved
  })
  ipcMain.handle('annotations:remove', async (_, bookId: string, annotationId: string) => {
    const saved = await storage.removeAnnotation(bookId, annotationId)
    const book = await storage.getBookRecord(bookId)
    annotationIndex.updateBook(bookId, book?.title ?? '未知书籍', saved)
    return saved
  })
  ipcMain.handle(
    'annotations:export-markdown',
    async (_, bookId: string, markdown: string): Promise<boolean> => {
      if (!mainWindow) return false
      const book = await storage.getBookRecord(bookId)
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出 Markdown 笔记',
        defaultPath: `${sanitizeFileName(book?.title ?? 'Readex-notes')}-notes.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (result.canceled || !result.filePath) return false
      await fs.writeFile(result.filePath, markdown, 'utf8')
      return true
    }
  )

  ipcMain.handle('settings:get', () => storage.getSettings())
  ipcMain.handle('settings:update', (_, settings: AppSettings) => storage.saveSettings(settings))
  ipcMain.handle('reading:get-state', (_, bookId: string) => storage.getReadingState(bookId))
  ipcMain.handle(
    'reading:save-state',
    (_, bookId: string, locator: ReadingLocator, progress: number) =>
      storage.saveReadingState(bookId, locator, progress)
  )

  ipcMain.handle('search:global', async (_, query: string): Promise<SearchResult[]> => {
    return annotationIndex.search(query)
  })
  ipcMain.handle(
    'search:in-book',
    async (_, bookId: string, query: string): Promise<SearchResult[]> => {
      const book = await storage.getBookRecord(bookId)
      if (!book) return []
      const { searchBookContent } = await import('./content')
      return searchBookContent(storage, book, query)
    }
  )

  ipcMain.handle('profile:info', () => storage.getProfileInfo())
  ipcMain.handle('profile:backup', () => backupProfile())
  ipcMain.handle('profile:clear', async () => {
    await storage.resetPersonalData()
    annotationIndex.invalidate()
    return { cleared: true }
  })
  ipcMain.handle('profile:open', () => shell.openPath(storage.getPaths().personal))
  ipcMain.handle('profile:copy-path', () => {
    clipboard.writeText(storage.getPaths().personal)
    return storage.getPaths().personal
  })

  ipcMain.handle('system:version', () => app.getVersion())
  ipcMain.handle('system:open-external', (_, url: string) => {
    if (/^https:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:quit', () => {
    quitting = true
    app.quit()
  })
  ipcMain.handle(
    'window:open-floating-reader',
    (_, bookId: string, width: number, height: number, locator: ReadingLocator | null) =>
      openFloatingReader(bookId, width, height, locator)
  )
  ipcMain.handle('window:minimize-floating-reader', () => floatingWindow?.minimize())
  ipcMain.handle('window:close-floating-reader', () => hideFloatingReader())
  ipcMain.handle('window:begin-floating-drag', (event, screenX: number, screenY: number) => {
    if (!floatingWindow || floatingWindow.isDestroyed()) return false
    if (event.sender.id !== floatingWindow.webContents.id) return false
    if (!isFiniteScreenPoint(screenX, screenY)) return false
    const bounds = floatingWindow.getBounds()
    floatingDrag = {
      webContentsId: event.sender.id,
      offsetX: screenX - bounds.x,
      offsetY: screenY - bounds.y
    }
    return true
  })
  ipcMain.on('window:move-floating-drag', (event, screenX: number, screenY: number) => {
    if (!floatingWindow || floatingWindow.isDestroyed() || !floatingDrag) return
    if (event.sender.id !== floatingDrag.webContentsId || !isFiniteScreenPoint(screenX, screenY)) {
      return
    }
    const bounds = floatingWindow.getBounds()
    const workArea = screen.getDisplayNearestPoint({ x: screenX, y: screenY }).workArea
    const x = clampWindowPosition(
      Math.round(screenX - floatingDrag.offsetX),
      workArea.x - bounds.width + 80,
      workArea.x + workArea.width - 80
    )
    const y = clampWindowPosition(
      Math.round(screenY - floatingDrag.offsetY),
      workArea.y,
      workArea.y + workArea.height - 40
    )
    floatingWindow.setBounds({ x, y, width: bounds.width, height: bounds.height })
  })
  ipcMain.handle('window:end-floating-drag', (event) => {
    if (floatingDrag?.webContentsId === event.sender.id) floatingDrag = null
  })
  ipcMain.handle('window:state', () => ({
    maximized: mainWindow?.isMaximized() ?? false,
    fullscreen: mainWindow?.isFullScreen() ?? false
  }))
  ipcMain.handle('window:set-fullscreen', (_, value: boolean) => {
    mainWindow?.setFullScreen(value)
  })
  ipcMain.handle(
    'window:set-titlebar-theme',
    (_, color: string, symbolColor: string) => {
      if (process.platform !== 'win32' || !mainWindow) return
      mainWindow.setTitleBarOverlay({
        color,
        symbolColor,
        height: 54
      })
    }
  )
}

function isTrustedRendererUrl(value: string): boolean {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl && value.startsWith(rendererUrl)) return true
  if (value.startsWith('file:')) return true
  return false
}

function isFiniteScreenPoint(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y)
}

function clampWindowPosition(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

async function importWithProgress(
  filePaths: string[]
): Promise<ImportBatchResult> {
  const { importBookPaths } = await import('./importer')
  const result = await importBookPaths(storage, filePaths, {
    onProgress: (event) => mainWindow?.webContents.send('import:progress', event)
  })
  annotationIndex.invalidate()
  return result
}

async function backupProfile(): Promise<{ canceled: boolean; filePath?: string }> {
  if (!mainWindow) return { canceled: true }
  const paths = storage.getPaths()
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '备份个人资料',
    defaultPath: `Readex-personal-${date}.zip`,
    filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  const { default: archiver } = await import('archiver')
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(result.filePath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(paths.personal, 'personal')
    void archive.finalize()
  })

  return { canceled: false, filePath: result.filePath }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80).trim() || 'Readex'
}

app.whenReady().then(async () => {
  await storage.initialize()
  registerBookProtocol(storage)
  registerIpc()

  if (app.isPackaged) {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true })
    )
    const allowedPrefixes = ['file:', 'devtools:', 'blob:', 'data:']
    app.on('web-contents-created', (_, contents) => {
      contents.setWindowOpenHandler(() => ({ action: 'deny' }))
      contents.on('will-navigate', (event, url) => {
        if (!allowedPrefixes.some((prefix) => url.startsWith(prefix))) event.preventDefault()
      })
    })
  }

  await createWindow()
  setTimeout(() => {
    void annotationIndex.warm().catch(() => {
      // The index rebuilds lazily if a background warm-up fails.
    })
  }, 2_000)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !floatingWindow && !mainWindow) app.quit()
})
