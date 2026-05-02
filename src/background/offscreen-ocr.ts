import type { ChromeApi, ServiceWorkerClients } from '../shared/chrome-api'
import type { LocalOcrLanguage, RunOffscreenTesseractOcrMessage, RunOffscreenTesseractOcrResponse } from '../shared/messages'

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html'

const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome

let creatingOffscreenDocumentPromise: Promise<void> | null = null

async function hasOffscreenDocument(): Promise<boolean> {
  const runtimeApi = chromeApi?.runtime
  const offscreenDocumentUrl = runtimeApi?.getURL?.(OFFSCREEN_DOCUMENT_PATH)

  if (!runtimeApi || !offscreenDocumentUrl) {
    return false
  }

  if (typeof runtimeApi.getContexts === 'function') {
    const contexts = await runtimeApi.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenDocumentUrl],
    })

    return Array.isArray(contexts) && contexts.length > 0
  }

  const clientsApi = (globalThis as { clients?: ServiceWorkerClients }).clients

  if (typeof clientsApi?.matchAll === 'function') {
    const matchedClients = await clientsApi.matchAll()
    return matchedClients.some((client: { url?: string }) => client?.url === offscreenDocumentUrl)
  }

  return false
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return
  }

  if (creatingOffscreenDocumentPromise) {
    await creatingOffscreenDocumentPromise
    return
  }

  creatingOffscreenDocumentPromise = chromeApi.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['WORKERS'],
    justification: '使用离屏文档运行 Tesseract.js Worker 完成本地 OCR',
  })

  try {
    await creatingOffscreenDocumentPromise
  } finally {
    creatingOffscreenDocumentPromise = null
  }
}

export async function extractTextByOffscreenTesseract(
  imageDataUrl: string,
  languages: LocalOcrLanguage[],
): Promise<string> {
  if (!chromeApi?.offscreen?.createDocument) {
    throw new Error('当前浏览器不支持 Offscreen Document，无法执行 Tesseract.js 本地 OCR')
  }

  await ensureOffscreenDocument()

  const message: RunOffscreenTesseractOcrMessage = {
    target: 'offscreen',
    type: 'RUN_OFFSCREEN_TESSERACT_OCR',
    payload: {
      imageDataUrl,
      languages,
    },
  }

  let response: RunOffscreenTesseractOcrResponse | undefined

  try {
    response = await chromeApi.runtime.sendMessage(message)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : '未知错误'
    throw new Error(`离屏 Tesseract OCR 通信失败：${messageText}`)
  }

  if (!response?.ok || !response.text) {
    throw new Error(response?.error ?? '离屏 Tesseract OCR 未返回识别结果')
  }

  return response.text
}
