// NOTE: 手写 Chrome Extension API 类型声明，禁止在项目其他位置使用 (globalThis as any).chrome。

export interface ChromeTab {
  id?: number
  windowId?: number
}

export interface MessageSender {
  tab?: ChromeTab
}

export interface ContextMenuInfo {
  menuItemId: string
  selectionText?: string
}

// NOTE: Chrome 扩展事件统一接口。
export interface ChromeEvent<T extends (...args: never[]) => void> {
  addListener(callback: T): void
}

// NOTE: runtime API 子集，仅包含项目实际使用的方法。
export interface ChromeRuntime {
  sendMessage(message: unknown): Promise<unknown>
  getURL(path: string): string
  openOptionsPage(): void
  getContexts(filter: {
    contextTypes: string[]
    documentUrls?: string[]
  }): Promise<{ url?: string }[]>
  readonly lastError: { message?: string } | undefined
  readonly onInstalled: ChromeEvent<() => void>
  readonly onStartup: ChromeEvent<() => void>
  readonly onMessage: ChromeEvent<
    (
      message: unknown,
      sender: MessageSender,
      sendResponse: (response: unknown) => void,
    ) => boolean | undefined
  >
}

// NOTE: tabs API 子集，回调形式与 MV3 Promise 形式均支持。
export interface ChromeTabs {
  sendMessage(tabId: number, message: unknown): Promise<unknown>
  captureVisibleTab(
    windowId: number | undefined,
    options: { format?: string },
    callback: (dataUrl: string | undefined) => void,
  ): void
  detectLanguage(
    tabId: number,
    callback: (language: string | undefined) => void,
  ): void
}

// NOTE: storage.sync API。
export interface ChromeStorageSync {
  get(
    keys?: string | string[] | Record<string, unknown>,
  ): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

export interface ChromeStorage {
  readonly sync: ChromeStorageSync
}

// NOTE: contextMenus API 子集。
export interface ChromeContextMenus {
  create(properties: Record<string, unknown>, callback?: () => void): void
  removeAll(callback?: () => void): void
  readonly onClicked: ChromeEvent<
    (info: ContextMenuInfo, tab?: ChromeTab) => void
  >
}

// NOTE: offscreen API 子集。
export interface ChromeOffscreen {
  createDocument(params: {
    url: string
    reasons: string[]
    justification: string
  }): Promise<void>
}

// NOTE: Service Worker clients API 子集，仅用于检测 offscreen document 是否存在。
export interface ServiceWorkerClients {
  matchAll(): Promise<{ url?: string }[]>
}

// NOTE: globalThis.chrome 的完整类型，项目其他地方通过此类型访问 Chrome API。
export interface ChromeApi {
  runtime: ChromeRuntime
  tabs: ChromeTabs
  storage: ChromeStorage
  contextMenus: ChromeContextMenus
  offscreen: ChromeOffscreen
}
