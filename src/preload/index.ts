import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { getBookResourceUrl } from '../shared/bookResource'
import type { TtsSynthesisRequest } from '../shared/speech'
import type {
  BookFormat,
  FloatingReaderSync,
  ImportProgressEvent,
  ReadingLocator,
  WindowState
} from '../shared/types'

const api = {
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    chooseAndImport: () => ipcRenderer.invoke('library:choose-import'),
    importPaths: (paths: string[]) => ipcRenderer.invoke('library:import-paths', paths),
    remove: (bookId: string, deleteSource: boolean) =>
      ipcRenderer.invoke('library:remove', bookId, deleteSource),
    reveal: (bookId: string) => ipcRenderer.invoke('library:reveal', bookId)
  },
  book: {
    getResourceUrl: (bookId: string, format: BookFormat) =>
      getBookResourceUrl(bookId, format),
    getContent: (bookId: string) => ipcRenderer.invoke('book:get-content', bookId),
    getRecord: (bookId: string) => ipcRenderer.invoke('book:get-record', bookId)
  },
  annotations: {
    list: (bookId: string) => ipcRenderer.invoke('annotations:list', bookId),
    listAll: () => ipcRenderer.invoke('annotations:list-all'),
    save: (annotation: unknown) => ipcRenderer.invoke('annotations:save', annotation),
    remove: (bookId: string, annotationId: string) =>
      ipcRenderer.invoke('annotations:remove', bookId, annotationId),
    exportMarkdown: (bookId: string, markdown: string) =>
      ipcRenderer.invoke('annotations:export-markdown', bookId, markdown)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: unknown) => ipcRenderer.invoke('settings:update', settings)
  },
  search: {
    global: (query: string) => ipcRenderer.invoke('search:global', query),
    inBook: (bookId: string, query: string) =>
      ipcRenderer.invoke('search:in-book', bookId, query)
  },
  speech: {
    synthesize: (request: TtsSynthesisRequest) =>
      ipcRenderer.invoke('speech:synthesize', request)
  },
  reading: {
    getState: (bookId: string) => ipcRenderer.invoke('reading:get-state', bookId),
    saveState: (bookId: string, locator: unknown, progress: number) =>
      ipcRenderer.invoke('reading:save-state', bookId, locator, progress)
  },
  profile: {
    info: () => ipcRenderer.invoke('profile:info'),
    backup: () => ipcRenderer.invoke('profile:backup'),
    clear: () => ipcRenderer.invoke('profile:clear'),
    open: () => ipcRenderer.invoke('profile:open'),
    copyPath: () => ipcRenderer.invoke('profile:copy-path')
  },
  system: {
    getVersion: () => ipcRenderer.invoke('system:version'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url)
  },
  windowControl: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    quit: () => ipcRenderer.invoke('window:quit'),
    setFullScreen: (value: boolean) => ipcRenderer.invoke('window:set-fullscreen', value),
    setTitleBarTheme: (color: string, symbolColor: string) =>
      ipcRenderer.invoke('window:set-titlebar-theme', color, symbolColor),
    openFloatingReader: (
      bookId: string,
      width: number,
      height: number,
      locator: ReadingLocator | null
    ) => ipcRenderer.invoke('window:open-floating-reader', bookId, width, height, locator),
    minimizeFloatingReader: () => ipcRenderer.invoke('window:minimize-floating-reader'),
    closeFloatingReader: () => ipcRenderer.invoke('window:close-floating-reader'),
    beginFloatingDrag: (screenX: number, screenY: number) =>
      ipcRenderer.invoke('window:begin-floating-drag', screenX, screenY),
    moveFloatingDrag: (screenX: number, screenY: number) =>
      ipcRenderer.send('window:move-floating-drag', screenX, screenY),
    endFloatingDrag: () => ipcRenderer.invoke('window:end-floating-drag'),
    state: () => ipcRenderer.invoke('window:state'),
    onStateChange: (callback: (state: WindowState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: WindowState): void => callback(state)
      ipcRenderer.on('window:state', listener)
      return () => ipcRenderer.removeListener('window:state', listener)
    },
    onFloatingReaderRestored: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('window:floating-reader-restored', listener)
      return () => ipcRenderer.removeListener('window:floating-reader-restored', listener)
    },
    onFloatingReaderSync: (callback: (value: FloatingReaderSync) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: FloatingReaderSync): void =>
        callback(value)
      ipcRenderer.on('window:floating-reader-sync', listener)
      return () => ipcRenderer.removeListener('window:floating-reader-sync', listener)
    }
  },
  import: {
    onProgress: (callback: (event: ImportProgressEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: ImportProgressEvent): void =>
        callback(value)
      ipcRenderer.on('import:progress', listener)
      return () => ipcRenderer.removeListener('import:progress', listener)
    }
  }
}

contextBridge.exposeInMainWorld('readex', api)
