import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  ContextMenuTranslateMessage,
  StartImageTranslateMessage,
  StartScreenshotTranslateMessage,
  TranslatePageImageMessage,
} from '../shared/messages'
import type { ChromeApi, ChromeTab, ContextMenuInfo } from '../shared/chrome-api'
import { getLlmConfig } from '../shared/config'
import { translateTextByLlm } from './llm-client'
import { translatePageImageByConfiguredMode, translateScreenshotByConfiguredMode } from './screenshot-translation'

const ROOT_CONTEXT_MENU_ID = 'my-translate-root'
const TRANSLATE_CONTEXT_MENU_ID = 'translate-selected-text'
const SCREENSHOT_CONTEXT_MENU_ID = 'translate-screenshot'
const IMAGE_TRANSLATE_CONTEXT_MENU_ID = 'translate-page-image'

const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome

function isNoReceivingEndError(error: unknown): boolean {
  const messageText = error instanceof Error ? error.message : String(error ?? '')
  return /Receiving end does not exist|Could not establish connection/u.test(messageText)
}

async function safeSendMessageToTab(tabId: number, message: BackgroundToContentMessage): Promise<boolean> {
  try {
    // NOTE: 部分页面或未刷新的标签页没有接收端，这里统一兜底避免未捕获异常。
    await chromeApi.tabs.sendMessage(tabId, message)
    return true
  } catch (error) {
    if (isNoReceivingEndError(error)) {
      return false
    }

    console.warn('发送标签页消息失败，可能无可用接收端：', error)
    return false
  }
}

function ensureContextMenu(): void {
  // NOTE: 每次初始化都重建右键菜单，保证父子结构和文案一致。
  chromeApi.contextMenus.removeAll(() => {
    chromeApi.contextMenus.create({
      id: ROOT_CONTEXT_MENU_ID,
      title: 'Mikamth Translate',
      contexts: ['all'],
    })

    chromeApi.contextMenus.create({
      id: TRANSLATE_CONTEXT_MENU_ID,
      parentId: ROOT_CONTEXT_MENU_ID,
      title: '翻译选中文本',
      contexts: ['selection'],
    })

    chromeApi.contextMenus.create({
      id: SCREENSHOT_CONTEXT_MENU_ID,
      parentId: ROOT_CONTEXT_MENU_ID,
      title: '截图翻译',
      contexts: ['all'],
    })

    chromeApi.contextMenus.create({
      id: IMAGE_TRANSLATE_CONTEXT_MENU_ID,
      parentId: ROOT_CONTEXT_MENU_ID,
      title: '翻译页面图片',
      contexts: ['image'],
    })
  })
}

async function captureVisibleTab(windowId?: number): Promise<string> {
  if (!chromeApi?.tabs?.captureVisibleTab) {
    throw new Error('当前环境不支持 captureVisibleTab，请检查 manifest 权限配置')
  }

  return new Promise((resolve, reject) => {
    chromeApi.tabs.captureVisibleTab(
      windowId,
      {
        format: 'png',
      },
      (dataUrl: string | undefined) => {
        const runtimeError = chromeApi?.runtime?.lastError

        if (runtimeError) {
          reject(new Error(runtimeError.message || '截图失败'))
          return
        }

        if (!dataUrl) {
          reject(new Error('截图失败：未获取到图像数据'))
          return
        }

        resolve(dataUrl)
      },
    )
  })
}

function handleTranslateTextMessage(message: ContentToBackgroundMessage, sendResponse: (response: unknown) => void): boolean {
  if (message.type !== 'TRANSLATE_TEXT') {
    return false
  }

  const text = String(message?.payload?.text ?? '').trim()

  if (!text) {
    sendResponse({ ok: false, error: '未检测到可翻译文本' })
    return false
  }

  // NOTE: 异步返回翻译结果，必须返回 true 保持消息通道。
  void translateTextByLlm(text)
    .then((translation) => {
      sendResponse({ ok: true, translation })
    })
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : '翻译失败'
      sendResponse({ ok: false, error: messageText })
    })

  return true
}

function handleCaptureVisibleTabMessage(
  message: ContentToBackgroundMessage,
  sender: any,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message.type !== 'CAPTURE_VISIBLE_TAB') {
    return false
  }

  const windowId = typeof sender?.tab?.windowId === 'number' ? sender.tab.windowId : undefined

  void captureVisibleTab(windowId)
    .then((imageDataUrl) => {
      sendResponse({ ok: true, imageDataUrl })
    })
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : '截图失败'
      sendResponse({ ok: false, error: messageText })
    })

  return true
}

// NOTE: 在后台 Service Worker 中通过 OffscreenCanvas 将远程图片转为 dataUrl，绕过 CORS。
// referer 用于构造 Referer 请求头，绕过图片服务器的防盗链检查。
async function fetchImageAsDataUrl(imageUrl: string, referer?: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl
  }

  const config = await getLlmConfig()
  const headers: Record<string, string> = {}
  if (referer) {
    headers['Referer'] = referer
  }
  const response = await fetch(imageUrl, { headers })

  if (!response.ok) {
    throw new Error(`图片获取失败：${response.status}`)
  }

  const blob = await response.blob()
  const imageBitmap = await createImageBitmap(blob)

  const maxSide = config.screenshotMaxImageSide
  const quality = config.screenshotImageQuality
  const resizeRatio = Math.min(1, maxSide / Math.max(imageBitmap.width, imageBitmap.height))
  const targetWidth = Math.max(1, Math.round(imageBitmap.width * resizeRatio))
  const targetHeight = Math.max(1, Math.round(imageBitmap.height * resizeRatio))

  const canvas = new OffscreenCanvas(targetWidth, targetHeight)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('图片处理失败：无法创建离屏 Canvas')
  }

  context.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight)
  imageBitmap.close()

  const processedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality })

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片转换失败'))
    reader.readAsDataURL(processedBlob)
  })
}

function handleTranslateScreenshotMessage(
  message: ContentToBackgroundMessage,
  sender: any,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message.type !== 'TRANSLATE_SCREENSHOT_IMAGE') {
    return false
  }

  const imageDataUrl = String(message?.payload?.imageDataUrl ?? '')
  const tabId = typeof sender?.tab?.id === 'number' ? sender.tab.id : undefined

  if (!imageDataUrl.startsWith('data:image/')) {
    sendResponse({ ok: false, error: '无效的截图数据' })
    return false
  }

  void translateScreenshotByConfiguredMode(imageDataUrl, { tabId })
    .then((result) => {
      sendResponse({
        ok: true,
        translation: result.translation,
        usedMode: result.usedMode,
      })
    })
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : '截图翻译失败'
      sendResponse({ ok: false, error: messageText })
    })

  return true
}

function handleTranslatePageImageMessage(
  message: ContentToBackgroundMessage,
  sender: any,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message.type !== 'TRANSLATE_PAGE_IMAGE') {
    return false
  }

  const msg = message as TranslatePageImageMessage
  const imageUrl = String(msg?.payload?.imageUrl ?? '')
  const imageDataUrl = String(msg?.payload?.imageDataUrl ?? '')
  const pageUrl = String(msg?.payload?.pageUrl ?? '')
  const tabId = typeof sender?.tab?.id === 'number' ? sender.tab.id : undefined

  void (async () => {
    try {
      let finalDataUrl: string

      if (imageDataUrl) {
        finalDataUrl = imageDataUrl
      } else if (imageUrl) {
        finalDataUrl = await fetchImageAsDataUrl(imageUrl, pageUrl || undefined)
      } else {
        sendResponse({ ok: false, error: '无效的图片数据' })
        return
      }

      const result = await translatePageImageByConfiguredMode(finalDataUrl, { tabId })

      sendResponse({
        ok: true,
        translation: result.translation,
        usedMode: result.usedMode,
      })
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '图片翻译失败'
      sendResponse({ ok: false, error: messageText })
    }
  })()

  return true
}

// NOTE: 安装插件和浏览器启动后都尝试注册右键菜单。
chromeApi.runtime.onInstalled.addListener(() => {
  ensureContextMenu()
})

chromeApi.runtime.onStartup.addListener(() => {
  ensureContextMenu()
})

ensureContextMenu()

// NOTE: 后台统一处理来自内容脚本的翻译、截图、截图翻译、图片翻译请求。
chromeApi.runtime.onMessage.addListener((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => {
  const msg = message as ContentToBackgroundMessage

  if (handleTranslateTextMessage(msg, sendResponse)) {
    return true
  }

  if (handleCaptureVisibleTabMessage(msg, sender, sendResponse)) {
    return true
  }

  if (handleTranslateScreenshotMessage(msg, sender, sendResponse)) {
    return true
  }

  if (handleTranslatePageImageMessage(msg, sender, sendResponse)) {
    return true
  }

  return false
})

// NOTE: 处理网页右键菜单事件，分别触发文本翻译、截图翻译或页面图片翻译。
chromeApi.contextMenus.onClicked.addListener((info: ContextMenuInfo, tab?: ChromeTab) => {
  const tabId = typeof tab?.id === 'number' ? tab.id : null

  if (tabId === null) {
    return
  }

  if (info?.menuItemId === TRANSLATE_CONTEXT_MENU_ID) {
    const selectedText = String(info?.selectionText ?? '')

    // NOTE: 右键文本翻译优先由内容脚本重取选区，selectionText 作为兜底。
    const message: ContextMenuTranslateMessage = {
      type: 'CONTEXT_MENU_TRANSLATE',
      payload: {
        text: selectedText,
      },
    }

    void safeSendMessageToTab(tabId, message)
    return
  }

  if (info?.menuItemId === SCREENSHOT_CONTEXT_MENU_ID) {
    const message: StartScreenshotTranslateMessage = {
      type: 'START_SCREENSHOT_TRANSLATE',
    }

    void safeSendMessageToTab(tabId, message)
    return
  }

  if (info?.menuItemId === IMAGE_TRANSLATE_CONTEXT_MENU_ID) {
    const message: StartImageTranslateMessage = {
      type: 'START_IMAGE_TRANSLATE',
    }

    void safeSendMessageToTab(tabId, message)
  }
})
