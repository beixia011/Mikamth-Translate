// NOTE: 本地 OCR 模块运行在内容脚本侧，当前仅负责 TextDetector 页面 OCR。

type TextDetectorBlockLike = {
  rawValue?: string | null
}

type TextDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<TextDetectorBlockLike[]>
}

type TextDetectorConstructor = new () => TextDetectorLike

type TextDetectorCapabilityResult =
  | {
      ok: true
      constructor: TextDetectorConstructor
    }
  | {
      ok: false
      message: string
    }

let cachedTextDetectorCapabilityPromise: Promise<TextDetectorCapabilityResult> | null = null

function getTextDetectorConstructor(): TextDetectorConstructor | null {
  const detectorConstructor = (globalThis as { TextDetector?: unknown }).TextDetector
  return typeof detectorConstructor === 'function' ? (detectorConstructor as TextDetectorConstructor) : null
}

function normalizeDetectedText(rawText: string): string {
  return rawText
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function dedupeTextBlocks(textBlocks: string[]): string[] {
  const uniqueTextBlocks = new Set<string>()

  textBlocks.forEach((text) => {
    if (text) {
      uniqueTextBlocks.add(text)
    }
  })

  return Array.from(uniqueTextBlocks)
}

function loadImageFromDataUrl(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('本地 OCR 加载截图失败'))
    image.src = imageDataUrl
  })
}

function createOcrCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('本地 OCR 初始化失败：无法创建 Canvas 上下文')
  }

  // NOTE: 先铺白底再绘制截图，减少透明背景对 OCR 识别结果的干扰。
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  return canvas
}

function createCapabilityProbeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('本地 OCR 探测失败：无法创建探测 Canvas 上下文')
  }

  // NOTE: 探测阶段仅验证 TextDetector 是否可实际调用，无需准备真实文本内容。
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  return canvas
}

async function probeTextDetectorCapability(): Promise<TextDetectorCapabilityResult> {
  const TextDetectorCtor = getTextDetectorConstructor()

  if (!TextDetectorCtor) {
    return {
      ok: false,
      message: '当前页面未暴露 TextDetector 接口，无法在内容脚本中执行页面 OCR',
    }
  }

  try {
    const detector = new TextDetectorCtor()
    await detector.detect(createCapabilityProbeCanvas())

    return {
      ok: true,
      constructor: TextDetectorCtor,
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message.trim() : ''
    const detailSuffix = rawMessage ? `：${rawMessage}` : ''

    return {
      ok: false,
      message: `当前页面未完整支持 TextDetector，无法在内容脚本中执行页面 OCR${detailSuffix}`,
    }
  }
}

async function ensureTextDetectorCapability(): Promise<TextDetectorConstructor> {
  cachedTextDetectorCapabilityPromise ??= probeTextDetectorCapability()
  const capability = await cachedTextDetectorCapabilityPromise

  if (!capability.ok) {
    throw new Error(capability.message)
  }

  return capability.constructor
}

function normalizeLocalOcrOutputText(rawText: string): string {
  return normalizeDetectedText(rawText).slice(0, 12000)
}

async function extractTextByTextDetectorInPage(imageDataUrl: string): Promise<string> {
  const TextDetectorCtor = await ensureTextDetectorCapability()
  const image = await loadImageFromDataUrl(imageDataUrl)
  const canvas = createOcrCanvas(image)
  const detector = new TextDetectorCtor()
  const detectedBlocks = await detector.detect(canvas)
  const textBlocks = dedupeTextBlocks(
    detectedBlocks
      .map((block) => normalizeDetectedText(String(block?.rawValue ?? '')))
      .filter(Boolean),
  )
  const text = textBlocks.join('\n')

  if (!text) {
    throw new Error('本地 OCR 未识别到可翻译文本')
  }

  return normalizeLocalOcrOutputText(text)
}

export async function extractTextByLocalOcrInPage(imageDataUrl: string): Promise<string> {
  if (!imageDataUrl.startsWith('data:image/')) {
    throw new Error('本地 OCR 收到的图像数据无效')
  }

  return extractTextByTextDetectorInPage(imageDataUrl)
}
