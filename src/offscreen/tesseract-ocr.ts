import type { ChromeApi } from '../shared/chrome-api'
import { createWorker, OEM, PSM } from 'tesseract.js'
import type { LocalOcrLanguage } from '../shared/messages'

const OCR_WORKER_RESOURCE_PATH = 'ocr/tesseract/worker.min.js'
const OCR_CORE_RESOURCE_PATH = 'ocr/tesseract-core'
const OCR_LANG_RESOURCE_PATH = 'ocr/tessdata'
const OCR_CORE_FILE_LIST = [
  'tesseract-core.wasm.js',
  'tesseract-core.wasm',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
  'tesseract-core-relaxedsimd.wasm.js',
  'tesseract-core-relaxedsimd.wasm',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm',
] as const

type TesseractWorkerInstance = Awaited<ReturnType<typeof createWorker>>

type CachedTesseractWorkerState = {
  languagesKey: string
  workerPromise: Promise<TesseractWorkerInstance>
}

let cachedTesseractWorkerState: CachedTesseractWorkerState | null = null

function getExtensionResourceUrl(resourcePath: string): string {
  const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome

  if (!chromeApi?.runtime?.getURL) {
    throw new Error('当前环境无法解析扩展资源路径，无法启动 Tesseract.js')
  }

  return chromeApi.runtime.getURL(resourcePath)
}

function buildTesseractResourceConfig() {
  return {
    workerPath: getExtensionResourceUrl(OCR_WORKER_RESOURCE_PATH),
    corePath: getExtensionResourceUrl(OCR_CORE_RESOURCE_PATH),
    langPath: getExtensionResourceUrl(OCR_LANG_RESOURCE_PATH),
  }
}

function normalizeRequestedLanguages(languages: LocalOcrLanguage[]): LocalOcrLanguage[] {
  const normalizedLanguageSet = new Set<LocalOcrLanguage>()

  languages.forEach((language) => {
    if (language === 'eng' || language === 'chi_sim') {
      normalizedLanguageSet.add(language)
    }
  })

  const normalizedLanguages = Array.from(normalizedLanguageSet)

  if (normalizedLanguages.length === 0) {
    throw new Error('未提供有效的 Tesseract.js 语言包配置')
  }

  return normalizedLanguages
}

function buildLanguagesKey(languages: LocalOcrLanguage[]): string {
  return normalizeRequestedLanguages(languages).join('+')
}

function buildRequiredResourcePathList(languages: LocalOcrLanguage[]): string[] {
  const normalizedLanguages = normalizeRequestedLanguages(languages)

  return [
    OCR_WORKER_RESOURCE_PATH,
    ...OCR_CORE_FILE_LIST.map((fileName) => `${OCR_CORE_RESOURCE_PATH}/${fileName}`),
    ...normalizedLanguages.map((lang) => `${OCR_LANG_RESOURCE_PATH}/${lang}.traineddata.gz`),
  ]
}

async function canAccessExtensionResource(resourcePath: string): Promise<boolean> {
  const resourceUrl = getExtensionResourceUrl(resourcePath)

  try {
    const headResponse = await fetch(resourceUrl, {
      method: 'HEAD',
      cache: 'no-store',
    })

    if (headResponse.ok) {
      return true
    }
  } catch {
    // NOTE: 部分扩展资源环境不一定支持 HEAD，这里继续降级到 GET 探测。
  }

  try {
    const getResponse = await fetch(resourceUrl, {
      method: 'GET',
      cache: 'no-store',
    })

    if (!getResponse.ok) {
      return false
    }

    await getResponse.body?.cancel?.()
    return true
  } catch {
    return false
  }
}

async function ensureTesseractResourcesReady(languages: LocalOcrLanguage[]): Promise<void> {
  const requiredResourcePathList = buildRequiredResourcePathList(languages)
  const accessibilityResultList = await Promise.all(
    requiredResourcePathList.map(async (resourcePath) => ({
      resourcePath,
      ok: await canAccessExtensionResource(resourcePath),
    })),
  )
  const missingResourcePathList = accessibilityResultList
    .filter((item) => !item.ok)
    .map((item) => item.resourcePath)

  if (missingResourcePathList.length === 0) {
    return
  }

  const missingResourceText = missingResourcePathList
    .map((resourcePath) => `- public/${resourcePath}`)
    .join('\n')

  throw new Error(`未找到以下 Tesseract.js 本地资源，请检查 public/ocr 目录并重新加载扩展：\n${missingResourceText}`)
}

async function createTesseractWorkerInstance(languages: LocalOcrLanguage[]): Promise<TesseractWorkerInstance> {
  const normalizedLanguages = normalizeRequestedLanguages(languages)
  const resourceConfig = buildTesseractResourceConfig()

  try {
    await ensureTesseractResourcesReady(normalizedLanguages)

    const worker = await createWorker([...normalizedLanguages], OEM.DEFAULT, {
      ...resourceConfig,
      cacheMethod: 'none',
      gzip: true,
      workerBlobURL: false,
      errorHandler: () => {},
    })

    // NOTE: 截图场景通常包含多段文本，AUTO 分段模式比默认单块模式更稳妥。
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    })

    return worker
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    throw new Error(
      `Tesseract.js 初始化失败，请检查 public/ocr 下的 worker、core 与 tessdata 资源是否齐全，并在修改后重新加载扩展：${message}`,
    )
  }
}

async function getTesseractWorker(languages: LocalOcrLanguage[]): Promise<TesseractWorkerInstance> {
  const normalizedLanguages = normalizeRequestedLanguages(languages)
  const languagesKey = buildLanguagesKey(normalizedLanguages)

  if (cachedTesseractWorkerState?.languagesKey === languagesKey) {
    return cachedTesseractWorkerState.workerPromise
  }

  // NOTE: 当本次请求的语言包组合变化时，主动切换 worker，避免长期绑定旧语言配置。
  await resetTesseractWorker()

  const workerPromise = createTesseractWorkerInstance(normalizedLanguages).catch((error) => {
    if (cachedTesseractWorkerState?.languagesKey === languagesKey) {
      cachedTesseractWorkerState = null
    }

    throw error
  })

  cachedTesseractWorkerState = {
    languagesKey,
    workerPromise,
  }

  return workerPromise
}

async function resetTesseractWorker(): Promise<void> {
  const currentWorkerState = cachedTesseractWorkerState
  cachedTesseractWorkerState = null

  if (!currentWorkerState) {
    return
  }

  try {
    const worker = await currentWorkerState.workerPromise
    await worker.terminate()
  } catch {}
}

export async function extractTextByTesseractInOffscreen(
  imageDataUrl: string,
  languages: LocalOcrLanguage[],
): Promise<string> {
  const normalizedLanguages = normalizeRequestedLanguages(languages)
  const worker = await getTesseractWorker(normalizedLanguages)

  try {
    const result = await worker.recognize(imageDataUrl)
    return String(result?.data?.text ?? '')
  } catch (error) {
    await resetTesseractWorker()
    const message = error instanceof Error ? error.message : '未知错误'
    throw new Error(`Tesseract.js 识别失败：${message}`)
  }
}

window.addEventListener(
  'pagehide',
  () => {
    void resetTesseractWorker()
  },
  { once: true },
)
