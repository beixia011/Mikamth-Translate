import type { ScreenshotTranslateMode } from './config'

// NOTE: 定义当前本地 OCR 支持的离线语言包标识。
export type LocalOcrLanguage = 'eng' | 'chi_sim'

// NOTE: 定义内容脚本 -> 后台脚本的文本翻译请求消息。
export type TranslateTextRequestMessage = {
  type: 'TRANSLATE_TEXT'
  payload: {
    text: string
  }
}

// NOTE: 定义内容脚本 -> 后台脚本的可视区截图请求消息。
export type CaptureVisibleTabRequestMessage = {
  type: 'CAPTURE_VISIBLE_TAB'
}

// NOTE: 定义内容脚本 -> 后台脚本的截图翻译请求消息。
export type TranslateScreenshotImageRequestMessage = {
  type: 'TRANSLATE_SCREENSHOT_IMAGE'
  payload: {
    imageDataUrl: string
  }
}

// NOTE: 定义后台脚本 -> 内容脚本的右键文本翻译触发消息。
export type ContextMenuTranslateMessage = {
  type: 'CONTEXT_MENU_TRANSLATE'
  payload: {
    text: string
  }
}

// NOTE: 定义后台脚本 -> 内容脚本的截图翻译触发消息。
export type StartScreenshotTranslateMessage = {
  type: 'START_SCREENSHOT_TRANSLATE'
}

// NOTE: 定义后台脚本 -> 内容脚本的页面图片翻译触发消息。
export type StartImageTranslateMessage = {
  type: 'START_IMAGE_TRANSLATE'
}

// NOTE: 定义后台脚本 -> 内容脚本的本地 OCR 请求消息。
export type RunLocalOcrMessage = {
  type: 'RUN_LOCAL_OCR'
  payload: {
    imageDataUrl: string
  }
}

// NOTE: 定义后台脚本 -> offscreen 文档的 Tesseract OCR 请求消息。
export type RunOffscreenTesseractOcrMessage = {
  target: 'offscreen'
  type: 'RUN_OFFSCREEN_TESSERACT_OCR'
  payload: {
    imageDataUrl: string
    languages: LocalOcrLanguage[]
  }
}

// NOTE: 定义内容脚本 -> 后台脚本的页面图片翻译请求消息。
// 优先使用 imageDataUrl（内容脚本 canvas 提取成功）；若跨域失败则传递 imageUrl 由后台 fetch。
// pageUrl 用于后台 fetch 时构造 Referer 头，绕过图片服务器的防盗链检查。
export type TranslatePageImageMessage = {
  type: 'TRANSLATE_PAGE_IMAGE'
  payload: {
    imageDataUrl?: string
    imageUrl?: string
    pageUrl?: string
  }
}

// NOTE: 统一内容脚本向后台发送的消息类型集合。
export type ContentToBackgroundMessage =
  | TranslateTextRequestMessage
  | CaptureVisibleTabRequestMessage
  | TranslateScreenshotImageRequestMessage
  | TranslatePageImageMessage

// NOTE: 统一后台脚本向内容脚本发送的消息类型集合。
export type BackgroundToContentMessage = ContextMenuTranslateMessage | StartScreenshotTranslateMessage | StartImageTranslateMessage | RunLocalOcrMessage

// NOTE: 定义文本翻译响应结构。
export type TranslateTextResponse = {
  ok: boolean
  translation?: string
  error?: string
}

// NOTE: 定义可视区截图响应结构。
export type CaptureVisibleTabResponse = {
  ok: boolean
  imageDataUrl?: string
  error?: string
}

// NOTE: 定义截图翻译响应结构，包含最终采用模式用于回显。
export type TranslateScreenshotImageResponse = {
  ok: boolean
  translation?: string
  usedMode?: ScreenshotTranslateMode
  error?: string
}

// NOTE: 定义内容脚本执行本地 OCR 后返回后台脚本的响应结构。
export type RunLocalOcrResponse = {
  ok: boolean
  text?: string
  error?: string
}

// NOTE: 定义页面图片翻译响应结构。
export type TranslatePageImageResponse = {
  ok: boolean
  translation?: string
  usedMode?: ScreenshotTranslateMode
  error?: string
}

// NOTE: 定义 offscreen 文档执行 Tesseract OCR 后返回后台脚本的响应结构。
export type RunOffscreenTesseractOcrResponse = {
  ok: boolean
  text?: string
  error?: string
}
