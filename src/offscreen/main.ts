import type { ChromeApi } from '../shared/chrome-api'
import type { LocalOcrLanguage, RunOffscreenTesseractOcrMessage } from '../shared/messages'
import { extractTextByTesseractInOffscreen } from './tesseract-ocr'

const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome

function sanitizeRequestedLanguages(rawLanguages: unknown): LocalOcrLanguage[] {
  const validLanguageSet = new Set<LocalOcrLanguage>()

  if (Array.isArray(rawLanguages)) {
    rawLanguages.forEach((item) => {
      if (item === 'eng' || item === 'chi_sim') {
        validLanguageSet.add(item)
      }
    })
  }

  return Array.from(validLanguageSet)
}

// NOTE: 离屏文档只处理后台转发来的 Tesseract OCR 请求，避免误消费其他扩展消息。
chromeApi.runtime.onMessage.addListener(
  (message: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
    const msg = message as RunOffscreenTesseractOcrMessage

    if (msg?.target !== 'offscreen' || msg?.type !== 'RUN_OFFSCREEN_TESSERACT_OCR') {
      return false
    }

    const imageDataUrl = String(msg?.payload?.imageDataUrl ?? '')
    const languages = sanitizeRequestedLanguages(msg?.payload?.languages)

    if (!imageDataUrl.startsWith('data:image/')) {
      sendResponse({ ok: false, error: '无效的离屏 OCR 图像数据' })
      return false
    }

    if (languages.length === 0) {
      sendResponse({ ok: false, error: '离屏 OCR 未收到有效的语言包配置' })
      return false
    }

    void extractTextByTesseractInOffscreen(imageDataUrl, languages)
      .then((text) => {
        sendResponse({ ok: true, text })
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : '离屏 Tesseract OCR 执行失败'
        sendResponse({ ok: false, error: errorMessage })
      })

    return true
  },
)
