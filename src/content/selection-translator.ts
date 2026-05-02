import type { ChromeApi } from '../shared/chrome-api'
import { getLlmConfig, type ScreenshotTranslateMode } from '../shared/config'
import type {
  CaptureVisibleTabResponse,
<<<<<<< HEAD
  TranslateScreenshotImageResponse,
  TranslateTextResponse,
  BackgroundToContentMessage,
=======
  TranslatePageImageResponse,
  TranslateScreenshotImageResponse,
  TranslateTextResponse,
  BackgroundToContentMessage,
  TranslatePageImageMessage,
>>>>>>> develop
} from '../shared/messages'
import { extractTextByLocalOcrInPage } from './local-ocr'

// NOTE: 内容脚本同时负责划词翻译与截图翻译的页面交互和结果展示。
const PANEL_ID = 'my-translate-selection-panel'
const SCREENSHOT_OVERLAY_ID = 'my-translate-screenshot-overlay'
const SCREENSHOT_BOX_ID = 'my-translate-screenshot-box'
const SCREENSHOT_HINT_ID = 'my-translate-screenshot-hint'
const MAX_TRANSLATE_TEXT_LENGTH = 1200
const MIN_SCREENSHOT_EDGE = 12
const SCREENSHOT_ERROR_PREFIX = '截图翻译失败：'

const SCREENSHOT_MODE_LABELS: Record<ScreenshotTranslateMode, string> = {
  vision_direct: '视觉直译',
  ocr_local: '本地 OCR + 文本翻译',
}

let latestTranslateTaskId = 0
let leaveScreenshotMode: (() => void) | null = null
<<<<<<< HEAD
=======
let pendingImageElement: HTMLImageElement | null = null

// NOTE: 翻译面板拖拽状态，避免拖拽移动面板时误触发关闭。
let isDraggingPanel = false
let panelDragOffsetX = 0
let panelDragOffsetY = 0
const PANEL_DRAG_THRESHOLD = 3
// NOTE: 保存用户拖拽后面板的最终位置，用于文案更新时恢复位置。
let panelDragPosition: { left: string; top: string } | null = null
>>>>>>> develop

type AnchorPoint = {
  x: number
  y: number
}

type SelectionValidationResult =
  | {
      ok: true
      text: string
      rect: DOMRect
    }
  | {
      ok: false
      error: string
    }

type DragRect = {
  left: number
  top: number
  width: number
  height: number
}

function normalizeTranslateText(rawText: string): string {
  // NOTE: 去除零宽字符，减少”看起来很短但实际包含隐藏字符”的情况。
  return rawText.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
}

function validateTranslateText(rawText: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = normalizeTranslateText(rawText)

  if (!text) {
    return { ok: false, error: '未检测到可翻译文本' }
  }

  if (text.length > MAX_TRANSLATE_TEXT_LENGTH) {
    return { ok: false, error: `选中文本过长，最多支持 ${MAX_TRANSLATE_TEXT_LENGTH} 个字符` }
  }

  return { ok: true, text }
}

function getDefaultAnchor(): AnchorPoint {
  return {
    x: window.innerWidth - 420,
    y: 20,
  }
}

function getAnchorFromRect(rect: DOMRect): AnchorPoint {
  return {
    x: rect.right,
    y: rect.bottom,
  }
}

function getAnchorFromDragRect(rect: DragRect): AnchorPoint {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function removePanel(): void {
  document.getElementById(PANEL_ID)?.remove()
}

function positionPanel(panel: HTMLDivElement, anchor: AnchorPoint): void {
  // NOTE: 根据浮层实际尺寸动态定位，优先放在选区下方，不够空间时放上方。
  const panelWidth = panel.offsetWidth
  const panelHeight = panel.offsetHeight
  const viewportPadding = 8
  const gap = 12

  const maxLeft = window.innerWidth - panelWidth - viewportPadding
  const left = Math.max(viewportPadding, Math.min(anchor.x + gap, maxLeft))

  const spaceBelow = window.innerHeight - anchor.y - gap - viewportPadding
  const spaceAbove = anchor.y - gap - viewportPadding

  let top = anchor.y + gap
  if (spaceBelow < panelHeight && spaceAbove > spaceBelow) {
    top = anchor.y - panelHeight - gap
  }

  const maxTop = window.innerHeight - panelHeight - viewportPadding
  top = Math.max(viewportPadding, Math.min(top, maxTop))

  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
}

function createPanel(anchor: AnchorPoint, text: string): HTMLDivElement {
  removePanel()

  const panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.style.position = 'fixed'
  panel.style.zIndex = '2147483647'
  panel.style.maxWidth = '360px'
  panel.style.minWidth = '220px'
  panel.style.maxHeight = '60vh'
  panel.style.overflowY = 'auto'
  panel.style.padding = '10px 12px'
  panel.style.borderRadius = '10px'
  panel.style.background = '#1f2937'
  panel.style.color = '#f9fafb'
  panel.style.fontSize = '13px'
  panel.style.lineHeight = '1.5'
  panel.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.25)'
  panel.style.wordBreak = 'break-word'
  panel.style.visibility = 'hidden'

  // 顶部拖拽手柄条，按住拖拽可移动面板
  const handle = document.createElement('div')
  handle.style.height = '6px'
  handle.style.background = 'rgba(255, 255, 255, 0.2)'
  handle.style.borderRadius = '3px'
  handle.style.marginBottom = '8px'
  handle.style.cursor = 'grab'
  panel.appendChild(handle)

  // 文本内容容器
  const content = document.createElement('div')
  content.style.whiteSpace = 'pre-wrap'
  content.textContent = text
  panel.appendChild(content)

  // NOTE: 仅手柄条可拖拽，文字区域保留正常的选中/复制行为。
  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return
    }

    isDraggingPanel = false
    panelDragOffsetX = event.clientX - panel.offsetLeft
    panelDragOffsetY = event.clientY - panel.offsetTop
    handle.style.cursor = 'grabbing'
    panel.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - event.clientX
      const dy = moveEvent.clientY - event.clientY

      if (Math.abs(dx) > PANEL_DRAG_THRESHOLD || Math.abs(dy) > PANEL_DRAG_THRESHOLD) {
        isDraggingPanel = true
      }

      const newLeft = moveEvent.clientX - panelDragOffsetX
      const newTop = moveEvent.clientY - panelDragOffsetY

      const maxLeft = window.innerWidth - panel.offsetWidth - 8
      const maxTop = window.innerHeight - panel.offsetHeight - 8

      panel.style.left = `${Math.max(8, Math.min(newLeft, maxLeft))}px`
      panel.style.top = `${Math.max(8, Math.min(newTop, maxTop))}px`
    }

    const onMouseUp = () => {
      handle.style.cursor = 'grab'
      panel.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      if (isDraggingPanel) {
        panelDragPosition = {
          left: panel.style.left,
          top: panel.style.top,
        }
        setTimeout(() => {
          isDraggingPanel = false
        }, 0)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  document.body.appendChild(panel)
  positionPanel(panel, anchor)

  // NOTE: 若用户曾拖拽过面板，恢复拖拽后的位置，避免文案更新时跳回初始锚点。
  if (panelDragPosition) {
    panel.style.left = panelDragPosition.left
    panel.style.top = panelDragPosition.top
  }

  panel.style.visibility = 'visible'

  return panel
}

function showTranslationResult(resultText: string, preferredAnchor?: AnchorPoint): void {
  const selected = getValidatedSelectionText()

  if (selected.ok) {
    createPanel(getAnchorFromRect(selected.rect), resultText)
    return
  }

  createPanel(preferredAnchor ?? getDefaultAnchor(), resultText)
}

function getValidatedSelectionText(): SelectionValidationResult {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return { ok: false, error: '未检测到可翻译文本' }
  }

  const textValidation = validateTranslateText(selection.toString())

  if (!textValidation.ok) {
    return textValidation
  }

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return { ok: false, error: '未检测到可翻译文本' }
  }

  return { ok: true, text: textValidation.text, rect }
}

async function requestTranslation(text: string): Promise<TranslateTextResponse> {
<<<<<<< HEAD
  const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome
=======
  const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome
>>>>>>> develop

  return chromeApi.runtime.sendMessage({
    type: 'TRANSLATE_TEXT',
    payload: { text },
  }) as Promise<TranslateTextResponse>
}

async function requestCaptureVisibleTab(): Promise<CaptureVisibleTabResponse> {
  const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome

  return chromeApi.runtime.sendMessage({
    type: 'CAPTURE_VISIBLE_TAB',
  }) as Promise<CaptureVisibleTabResponse>
}

async function requestScreenshotTranslation(imageDataUrl: string): Promise<TranslateScreenshotImageResponse> {
  const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome

  return chromeApi.runtime.sendMessage({
    type: 'TRANSLATE_SCREENSHOT_IMAGE',
    payload: { imageDataUrl },
  }) as Promise<TranslateScreenshotImageResponse>
}

async function requestPageImageTranslation(payload: TranslatePageImageMessage['payload']): Promise<TranslatePageImageResponse> {
  const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome

  return chromeApi.runtime.sendMessage({
    type: 'TRANSLATE_PAGE_IMAGE',
    payload,
  }) as Promise<TranslatePageImageResponse>
}

function buildScreenshotProgressText(): string {
  // NOTE: 截图处理完成后仅展示简洁的翻译中状态文案。
  return '正在翻译中...'
}

function formatScreenshotFailureText(rawError: string): string {
  const normalizedError = rawError
    .trim()
    .replace(/^(?:截图翻译失败[:：]\s*)+/u, '')

  if (!normalizedError) {
    return `${SCREENSHOT_ERROR_PREFIX}未知错误`
  }

  if (normalizedError.includes('\n')) {
    return `${SCREENSHOT_ERROR_PREFIX}\n${normalizedError}`
  }

  return `${SCREENSHOT_ERROR_PREFIX}${normalizedError}`
}

async function requestCaptureVisibleTab(): Promise<CaptureVisibleTabResponse> {
  const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome

  return chromeApi.runtime.sendMessage({
    type: 'CAPTURE_VISIBLE_TAB',
  })
}

async function requestScreenshotTranslation(imageDataUrl: string): Promise<TranslateScreenshotImageResponse> {
  const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome

  return chromeApi.runtime.sendMessage({
    type: 'TRANSLATE_SCREENSHOT_IMAGE',
    payload: { imageDataUrl },
  })
}

function buildScreenshotProgressText(): string {
  // NOTE: 截图处理完成后仅展示简洁的翻译中状态文案。
  return '正在翻译中...'
}

function formatScreenshotFailureText(rawError: string): string {
  const normalizedError = rawError
    .trim()
    .replace(/^(?:截图翻译失败[:：]\s*)+/u, '')

  if (!normalizedError) {
    return `${SCREENSHOT_ERROR_PREFIX}未知错误`
  }

  if (normalizedError.includes('\n')) {
    return `${SCREENSHOT_ERROR_PREFIX}\n${normalizedError}`
  }

  return `${SCREENSHOT_ERROR_PREFIX}${normalizedError}`
}

async function translateAndRender(text: string, anchor: AnchorPoint): Promise<void> {
  const textValidation = validateTranslateText(text)

  if (!textValidation.ok) {
    showTranslationResult(`翻译失败：${textValidation.error}`, anchor)
    return
  }

  const taskId = ++latestTranslateTaskId
  createPanel(anchor, '翻译中...')

  try {
    const response = await requestTranslation(textValidation.text)

    // NOTE: 仅允许最新任务更新界面，避免旧请求晚返回覆盖新结果。
    if (taskId !== latestTranslateTaskId) {
      return
    }

    if (!response?.ok) {
      createPanel(anchor, `翻译失败：${response?.error ?? '未知错误'}`)
      return
    }

    createPanel(anchor, response.translation ?? '翻译结果为空')
  } catch (error) {
    if (taskId !== latestTranslateTaskId) {
      return
    }

    const errorMessage = error instanceof Error ? error.message : '未知错误'
    createPanel(anchor, `翻译失败：${errorMessage}`)
  }
}

async function handleContextMenuTranslate(fallbackRawText: string): Promise<void> {
  const selected = getValidatedSelectionText()

  if (selected.ok) {
    await translateAndRender(selected.text, getAnchorFromRect(selected.rect))
    return
  }

  // NOTE: 右键后若页面选区丢失，使用后台传回的 selectionText 作为兜底。
  const fallbackValidation = validateTranslateText(fallbackRawText)

  if (!fallbackValidation.ok) {
    showTranslationResult(`翻译失败：${fallbackValidation.error}`, getDefaultAnchor())
    return
  }

  await translateAndRender(fallbackValidation.text, getDefaultAnchor())
}

function removeScreenshotOverlay(): void {
  document.getElementById(SCREENSHOT_OVERLAY_ID)?.remove()
}

function getDragRect(startX: number, startY: number, endX: number, endY: number): DragRect {
  const left = Math.min(startX, endX)
  const top = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)

  return { left, top, width, height }
}

function createScreenshotOverlayElements(): {
  overlay: HTMLDivElement
  box: HTMLDivElement
  hint: HTMLDivElement
} {
  removeScreenshotOverlay()

  const overlay = document.createElement('div')
  overlay.id = SCREENSHOT_OVERLAY_ID
  overlay.style.position = 'fixed'
  overlay.style.left = '0'
  overlay.style.top = '0'
  overlay.style.width = '100vw'
  overlay.style.height = '100vh'
  overlay.style.zIndex = '2147483646'
  overlay.style.cursor = 'crosshair'
  overlay.style.background = 'rgba(15, 23, 42, 0.22)'
  overlay.style.userSelect = 'none'

  const box = document.createElement('div')
  box.id = SCREENSHOT_BOX_ID
  box.style.position = 'absolute'
  box.style.border = '2px solid #22d3ee'
  box.style.background = 'rgba(34, 211, 238, 0.15)'
  box.style.display = 'none'
  box.style.pointerEvents = 'none'

  const hint = document.createElement('div')
  hint.id = SCREENSHOT_HINT_ID
  hint.style.position = 'fixed'
  hint.style.left = '12px'
  hint.style.top = '12px'
  hint.style.padding = '8px 10px'
  hint.style.borderRadius = '8px'
  hint.style.background = 'rgba(17, 24, 39, 0.88)'
  hint.style.color = '#f8fafc'
  hint.style.fontSize = '12px'
  hint.style.lineHeight = '1.4'
  hint.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)'
  hint.textContent = '拖拽框选需要翻译的区域，按 ESC 取消'

  overlay.appendChild(box)
  overlay.appendChild(hint)
  document.body.appendChild(overlay)

  return { overlay, box, hint }
}

function clampRectToViewport(rect: DragRect): DragRect {
  const left = Math.max(0, Math.min(rect.left, window.innerWidth - 1))
  const top = Math.max(0, Math.min(rect.top, window.innerHeight - 1))
  const right = Math.max(left + 1, Math.min(rect.left + rect.width, window.innerWidth))
  const bottom = Math.max(top + 1, Math.min(rect.top + rect.height, window.innerHeight))

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function drawDragRect(box: HTMLDivElement, rect: DragRect): void {
  box.style.display = 'block'
  box.style.left = `${rect.left}px`
  box.style.top = `${rect.top}px`
  box.style.width = `${rect.width}px`
  box.style.height = `${rect.height}px`
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('加载截图数据失败'))
    image.src = dataUrl
  })
}

async function cropAndCompressImage(
  imageDataUrl: string,
  viewportRect: DragRect,
  maxSide: number,
  imageQuality: number,
): Promise<string> {
  const image = await loadImage(imageDataUrl)

  // NOTE: 按照截图真实像素与页面视口像素比例进行映射，避免 DPR 下裁剪错位。
  const scaleX = image.naturalWidth / Math.max(1, window.innerWidth)
  const scaleY = image.naturalHeight / Math.max(1, window.innerHeight)
  const sourceRect = clampRectToViewport(viewportRect)

  const sourceX = Math.max(0, Math.floor(sourceRect.left * scaleX))
  const sourceY = Math.max(0, Math.floor(sourceRect.top * scaleY))
  const rawSourceWidth = Math.ceil(sourceRect.width * scaleX)
  const rawSourceHeight = Math.ceil(sourceRect.height * scaleY)
  const sourceWidth = Math.min(rawSourceWidth, image.naturalWidth - sourceX)
  const sourceHeight = Math.min(rawSourceHeight, image.naturalHeight - sourceY)

  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new Error('截图区域无效，请重试')
  }

  const resizeRatio = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
  const targetWidth = Math.max(1, Math.round(sourceWidth * resizeRatio))
  const targetHeight = Math.max(1, Math.round(sourceHeight * resizeRatio))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('截图处理失败：无法创建 Canvas 上下文')
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight)

  return canvas.toDataURL('image/jpeg', imageQuality)
}

async function translateScreenshotRect(rect: DragRect): Promise<void> {
  const anchor = getAnchorFromDragRect(rect)
  const taskId = ++latestTranslateTaskId

  try {
    const config = await getLlmConfig()
    const captureResponse = await requestCaptureVisibleTab()

    if (taskId !== latestTranslateTaskId) {
      return
    }

    if (!captureResponse?.ok || !captureResponse?.imageDataUrl) {
      createPanel(anchor, `截图失败：${captureResponse?.error ?? '未知错误'}`)
      return
    }

    const processedImageDataUrl = await cropAndCompressImage(
      captureResponse.imageDataUrl,
      rect,
      config.screenshotMaxImageSide,
      config.screenshotImageQuality,
    )

    if (taskId !== latestTranslateTaskId) {
      return
    }

    // NOTE: 先完成截图与裁剪，再展示进度面板，避免状态文案被误拍进截图。
    createPanel(anchor, buildScreenshotProgressText())

    const translationResponse = await requestScreenshotTranslation(processedImageDataUrl)

    if (taskId !== latestTranslateTaskId) {
      return
    }

    if (!translationResponse?.ok) {
      createPanel(anchor, formatScreenshotFailureText(translationResponse?.error ?? '未知错误'))
      return
    }

    const modeLabel = translationResponse?.usedMode ? SCREENSHOT_MODE_LABELS[translationResponse.usedMode] : '截图翻译'
    const resultText = translationResponse?.translation ?? '翻译结果为空'
    createPanel(anchor, `模式：${modeLabel}\n\n${resultText}`)
  } catch (error) {
    if (taskId !== latestTranslateTaskId) {
      return
    }

    const errorMessage = error instanceof Error ? error.message : '未知错误'
    createPanel(anchor, formatScreenshotFailureText(errorMessage))
  }
}

<<<<<<< HEAD
=======
async function extractImageDataUrl(img: HTMLImageElement): Promise<string> {
  // NOTE: 先尝试从 DOM 中已渲染的 <img> 直接绘入 canvas（同源图片可行）。
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('无法创建 Canvas 上下文')
    }

    context.drawImage(img, 0, 0)
    // HACK: 跨域图片会导致 canvas 被污染，toDataURL 会抛出 SecurityError。
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    // 跨域图片走 CORS 重载路径。
  }

  // NOTE: 通过 crossOrigin 重新加载图片，尝试绕过 canvas 污染问题。
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight

        const context = canvas.getContext('2d')

        if (!context) {
          reject(new Error('无法创建 Canvas 上下文'))
          return
        }

        context.drawImage(image, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch (canvasError) {
        reject(canvasError)
      }
    }

    image.onerror = () => reject(new Error('CANVAS_FALLBACK'))
    image.src = img.currentSrc || img.src
  })
}

// NOTE: 内容脚本侧 fetch 获取图片，可携带页面 cookie/认证信息，
// 解决背景 Service Worker fetch 因缺少登录态而失败的问题。
async function extractImageViaFetch(img: HTMLImageElement): Promise<string> {
  const src = img.currentSrc || img.src

  if (!src || src.startsWith('blob:') || src.startsWith('data:')) {
    throw new Error('无法通过 fetch 获取该图片')
  }

  const response = await fetch(src)

  if (!response.ok) {
    throw new Error(`图片请求失败：${response.status}`)
  }

  const blob = await response.blob()

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片数据读取失败'))
    reader.readAsDataURL(blob)
  })
}

// NOTE: 通过 captureVisibleTab 截取页面上已渲染的图片区域，完全绕过 CORS 和防盗链限制。
// 这是最后的回退方案——图片数据已存在于浏览器渲染结果中，直接"截图"获取。
async function captureAndCropImage(img: HTMLImageElement): Promise<string> {
  // 先滚动确保图片可见
  img.scrollIntoView({ block: 'nearest', behavior: 'instant' })

  // 临时隐藏翻译面板，避免被截入图片
  const panel = document.getElementById(PANEL_ID)
  const prevDisplay = panel ? panel.style.display : undefined
  if (panel) panel.style.display = 'none'

  try {
    const config = await getLlmConfig()
    const captureResponse = await requestCaptureVisibleTab()

    if (!captureResponse?.ok || !captureResponse?.imageDataUrl) {
      throw new Error('可视区截图失败')
    }

    const rect = img.getBoundingClientRect()
    const imgRect: DragRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }

    return await cropAndCompressImage(
      captureResponse.imageDataUrl,
      imgRect,
      config.screenshotMaxImageSide,
      config.screenshotImageQuality,
    )
  } finally {
    if (panel) panel.style.display = prevDisplay || ''
  }
}

async function handleImageTranslate(): Promise<void> {
  if (!pendingImageElement) {
    showTranslationResult('翻译失败：未检测到目标图片，请右键点击图片重试', getDefaultAnchor())
    return
  }

  const img = pendingImageElement
  const rect = img.getBoundingClientRect()
  const anchor: AnchorPoint = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }

  const taskId = ++latestTranslateTaskId

  try {
    createPanel(anchor, '正在提取图片...')

    let imagePayload: TranslatePageImageMessage['payload']

    try {
      const dataUrl = await extractImageDataUrl(img)
      imagePayload = { imageDataUrl: dataUrl, pageUrl: window.location.href }
    } catch (_extractError) {
      // NOTE: canvas 提取失败时，依次尝试：内容脚本 fetch → 可视区截图裁剪 → 后台 fetch。
      const src = img.currentSrc || img.src

      if (!src || src.startsWith('blob:')) {
        throw new Error('无法获取该图片数据，请尝试截图翻译')
      }

      // PREF: 先尝试内容脚本侧 fetch（带页面上下文、Referer、cookie）。
      try {
        const dataUrl = await extractImageViaFetch(img)
        imagePayload = { imageDataUrl: dataUrl, pageUrl: window.location.href }
      } catch {
        // PREF: fetch 也失败时，直接截取页面已渲染的图片区域，彻底绕过 CORS 与防盗链。
        try {
          const croppedDataUrl = await captureAndCropImage(img)
          imagePayload = { imageDataUrl: croppedDataUrl, pageUrl: window.location.href }
        } catch {
          // PREF: 最后回退到 URL 方式，由后台 fetch（带 Referer 头）尝试获取。
          imagePayload = { imageUrl: src, pageUrl: window.location.href }
        }
      }
    }

    if (taskId !== latestTranslateTaskId) {
      return
    }

    createPanel(anchor, '正在翻译中...')

    const response = await requestPageImageTranslation(imagePayload)

    if (taskId !== latestTranslateTaskId) {
      return
    }

    if (!response?.ok) {
      createPanel(anchor, `图片翻译失败：${response?.error ?? '未知错误'}`)
      return
    }

    const modeLabel = response?.usedMode ? SCREENSHOT_MODE_LABELS[response.usedMode] : '图片翻译'
    const resultText = response?.translation ?? '翻译结果为空'
    createPanel(anchor, `模式：${modeLabel}\n\n${resultText}`)
  } catch (error) {
    if (taskId !== latestTranslateTaskId) {
      return
    }

    const errorMessage = error instanceof Error ? error.message : '未知错误'
    createPanel(anchor, `图片翻译失败：${errorMessage}`)
  }
}

>>>>>>> develop
function startScreenshotMode(): void {
  // NOTE: 进入截图模式前清理旧面板和旧任务，避免旧状态干扰框选。
  latestTranslateTaskId += 1
  removePanel()

  if (leaveScreenshotMode) {
    leaveScreenshotMode()
    leaveScreenshotMode = null
  }

  const { overlay, box, hint } = createScreenshotOverlayElements()
  let selecting = false
  let startX = 0
  let startY = 0

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    selecting = true
    startX = event.clientX
    startY = event.clientY
    drawDragRect(box, {
      left: startX,
      top: startY,
      width: 0,
      height: 0,
    })
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!selecting) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const rect = clampRectToViewport(getDragRect(startX, startY, event.clientX, event.clientY))
    drawDragRect(box, rect)
  }

  const onMouseUp = (event: MouseEvent) => {
    if (!selecting) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    selecting = false
    const rect = clampRectToViewport(getDragRect(startX, startY, event.clientX, event.clientY))

    if (rect.width < MIN_SCREENSHOT_EDGE || rect.height < MIN_SCREENSHOT_EDGE) {
      hint.textContent = `框选区域过小，请至少拖拽 ${MIN_SCREENSHOT_EDGE}px，或按 ESC 取消`
      box.style.display = 'none'
      return
    }

    leaveScreenshotMode?.()
    leaveScreenshotMode = null
    void translateScreenshotRect(rect)
  }

  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return
    }

    event.stopPropagation()
    leaveScreenshotMode?.()
    leaveScreenshotMode = null
  }

  overlay.addEventListener('mousedown', onMouseDown, true)
  overlay.addEventListener('mousemove', onMouseMove, true)
  overlay.addEventListener('mouseup', onMouseUp, true)
  document.addEventListener('keydown', onEscape, true)

  leaveScreenshotMode = () => {
    overlay.removeEventListener('mousedown', onMouseDown, true)
    overlay.removeEventListener('mousemove', onMouseMove, true)
    overlay.removeEventListener('mouseup', onMouseUp, true)
    document.removeEventListener('keydown', onEscape, true)
    removeScreenshotOverlay()
  }
}

async function shouldAutoTranslate(): Promise<boolean> {
  const config = await getLlmConfig()
  return config.translationTriggerMode === 'auto_selection'
}

<<<<<<< HEAD
=======
// NOTE: 记录右键点击的图片元素，供图片翻译功能使用。
document.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null

  if (target?.tagName === 'IMG') {
    pendingImageElement = target as HTMLImageElement
  } else {
    pendingImageElement = null
  }
})

>>>>>>> develop
// NOTE: 在鼠标抬起后按配置触发自动划词翻译，减少与页面选择行为冲突。
document.addEventListener('mouseup', () => {
  window.setTimeout(async () => {
    const autoTranslateEnabled = await shouldAutoTranslate()

    if (!autoTranslateEnabled) {
      return
    }

    const selected = getValidatedSelectionText()

    if (!selected.ok) {
      return
    }

    await translateAndRender(selected.text, getAnchorFromRect(selected.rect))
  }, 20)
})

<<<<<<< HEAD
const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome

// NOTE: 接收后台右键指令与本地 OCR 调用，统一在页面上下文中处理。
chromeApi.runtime.onMessage.addListener((message: BackgroundToContentMessage, _sender: unknown, sendResponse: (response: unknown) => void) => {
  if (message?.type === 'CONTEXT_MENU_TRANSLATE') {
    const fallbackText = String(message?.payload?.text ?? '')
=======
const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome

// NOTE: 接收后台右键指令与本地 OCR 调用，统一在页面上下文中处理。
chromeApi.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
  const msg = message as BackgroundToContentMessage

  if (msg?.type === 'CONTEXT_MENU_TRANSLATE') {
    const fallbackText = String(msg?.payload?.text ?? '')
>>>>>>> develop
    void handleContextMenuTranslate(fallbackText)
    return
  }

<<<<<<< HEAD
  if (message?.type === 'START_SCREENSHOT_TRANSLATE') {
=======
  if (msg?.type === 'START_SCREENSHOT_TRANSLATE') {
>>>>>>> develop
    startScreenshotMode()
    return
  }

<<<<<<< HEAD
  if (message?.type === 'RUN_LOCAL_OCR') {
    const imageDataUrl = String(message?.payload?.imageDataUrl ?? '')
=======
  if (msg?.type === 'START_IMAGE_TRANSLATE') {
    void handleImageTranslate()
    return
  }

  if (msg?.type === 'RUN_LOCAL_OCR') {
    const imageDataUrl = String(msg?.payload?.imageDataUrl ?? '')
>>>>>>> develop

    if (!imageDataUrl.startsWith('data:image/')) {
      sendResponse({ ok: false, error: '无效的本地 OCR 图像数据' })
      return false
    }

    void extractTextByLocalOcrInPage(imageDataUrl)
      .then((text) => {
        sendResponse({ ok: true, text })
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : '本地 OCR 执行失败'
        sendResponse({ ok: false, error: errorMessage })
      })

    return true
  }
})

// NOTE: 点击面板外部时关闭浮层，并取消当前未完成任务的界面回写。
<<<<<<< HEAD
=======
// 拖拽面板时不触发关闭，避免移动面板后误关。
>>>>>>> develop
document.addEventListener('mousedown', (event) => {
  if (isDraggingPanel) {
    return
  }

  const panel = document.getElementById(PANEL_ID)

  if (!panel) {
    return
  }

  if (!panel.contains(event.target as Node)) {
    panelDragPosition = null
    latestTranslateTaskId += 1
    removePanel()
  }
})

// NOTE: 按下 Esc 时同时关闭浮层并退出截图模式。
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    panelDragPosition = null
    latestTranslateTaskId += 1
    removePanel()

    if (leaveScreenshotMode) {
      leaveScreenshotMode()
      leaveScreenshotMode = null
    }
  }
})
