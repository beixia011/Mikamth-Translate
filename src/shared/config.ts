// NOTE: 定义大模型配置结构，供配置页和后台脚本共享。
import type { ChromeApi } from './chrome-api'

export type TranslationTargetLanguage =
  | 'chinese'
  | 'english'
  | 'japanese'
  | 'korean'
  | 'french'
  | 'german'
  | 'spanish'

<<<<<<< HEAD
// NOTE: 定义截图翻译模式，当前支持视觉直译与本地 OCR。
=======
// NOTE: 定义图片类翻译模式（截图翻译与页面图片翻译共用），当前支持视觉直译与本地 OCR。
>>>>>>> develop
export type ScreenshotTranslateMode = 'vision_direct' | 'ocr_local'

// NOTE: 默认翻译提示词作为统一基线，目标语言仅通过追加短句控制。
export const DEFAULT_TRANSLATION_PROMPT =
  '你是专业翻译助手。请将用户提供的文本翻译为自然、准确、简洁的内容。仅输出翻译结果，不要添加解释。'

// NOTE: 页面图片视觉翻译默认提示词，侧重理解图片语境再翻译。
export const DEFAULT_PAGE_IMAGE_PROMPT =
  '你是专业图片翻译助手。请先理解图片的语境（梗图/信息图/漫画/照片等），然后结合画面上下文翻译其中的文字。保留原图的风格与语气。仅输出翻译结果，不要添加解释。'

export interface LlmConfig {
  textBaseUrl: string
  textApiKey: string
  textSelectedModel: string
  textModelList: string[]
  textAutoRefreshModels: boolean
  useTextConfigForVision: boolean
  visionBaseUrl: string
  visionApiKey: string
  visionSelectedModel: string
  visionModelList: string[]
  visionAutoRefreshModels: boolean
  translationTriggerMode: 'context_menu' | 'auto_selection'
  targetLanguage: TranslationTargetLanguage
  customTranslationPrompt: string
<<<<<<< HEAD
  requestTimeoutMs: number
=======
  /** @deprecated 已拆分为 textRequestTimeoutMs / screenshotRequestTimeoutMs / imageRequestTimeoutMs，读取时自动迁移 */
  requestTimeoutMs?: number
  textRequestTimeoutMs: number
  screenshotRequestTimeoutMs: number
  imageRequestTimeoutMs: number
>>>>>>> develop
  screenshotTranslateMode: ScreenshotTranslateMode
  screenshotEnableFallback: boolean
  screenshotMaxImageSide: number
  screenshotImageQuality: number
<<<<<<< HEAD
=======
  imageTranslateMode: ScreenshotTranslateMode
  imageEnableFallback: boolean
  imageCustomPrompt: string
>>>>>>> develop
}

// NOTE: 统一默认值，避免 storage 中字段缺失时出现 undefined。
export const DEFAULT_LLM_CONFIG: LlmConfig = {
  textBaseUrl: '',
  textApiKey: '',
  textSelectedModel: '',
  textModelList: [],
  textAutoRefreshModels: false,
  useTextConfigForVision: true,
  visionBaseUrl: '',
  visionApiKey: '',
  visionSelectedModel: '',
  visionModelList: [],
  visionAutoRefreshModels: false,
  translationTriggerMode: 'context_menu',
  targetLanguage: 'chinese',
  customTranslationPrompt: '',
<<<<<<< HEAD
  requestTimeoutMs: 180000,
=======
  requestTimeoutMs: undefined,
  textRequestTimeoutMs: 180000,
  screenshotRequestTimeoutMs: 180000,
  imageRequestTimeoutMs: 180000,
>>>>>>> develop
  screenshotTranslateMode: 'vision_direct',
  screenshotEnableFallback: true,
  screenshotMaxImageSide: 1800,
  screenshotImageQuality: 0.85,
<<<<<<< HEAD
=======
  imageTranslateMode: 'vision_direct',
  imageEnableFallback: true,
  imageCustomPrompt: '',
>>>>>>> develop
}

const STORAGE_DEFAULTS_WITH_LEGACY_FIELDS = {
  ...DEFAULT_LLM_CONFIG,
  // HACK: 兼容历史字段，读取时自动迁移到 text/vision 新结构。
  baseUrl: '',
  apiKey: '',
  selectedModel: '',
  modelList: [],
  autoRefreshModels: false,
  screenshotVisionModel: '',
<<<<<<< HEAD
=======
  // HACK: 旧字段 requestTimeoutMs 已废弃，通过 getLlmConfig 迁移为 textRequestTimeoutMs。
>>>>>>> develop
}

const REMOVED_SCREENSHOT_CONFIG_KEYS = ['cloudOcrEndpoint', 'cloudOcrApiKey', 'cloudOcrTimeoutMs'] as const

function sanitizeSimpleText(rawValue: unknown, maxLength: number): string {
  return String(rawValue ?? '').trim().slice(0, maxLength)
}

function sanitizeModelName(rawModel: unknown): string {
  return sanitizeSimpleText(rawModel, 200)
}

function sanitizeModelList(rawModelList: unknown): string[] {
  if (!Array.isArray(rawModelList)) {
    return []
  }

  // NOTE: 仅保留非空字符串模型名，避免异常数据污染下拉框。
  return rawModelList
    .map((item: unknown) => sanitizeModelName(item))
    .filter((item) => item.length > 0)
}

function sanitizeTranslationTriggerMode(rawMode: unknown): 'context_menu' | 'auto_selection' {
  // NOTE: 仅允许已定义触发模式，异常值统一回退到默认模式。
  if (rawMode === 'auto_selection') {
    return 'auto_selection'
  }

  return 'context_menu'
}

function sanitizeTargetLanguage(rawLanguage: unknown): TranslationTargetLanguage {
  // NOTE: 仅允许预定义语言标识，异常值回退到默认”中文”。
  if (
    rawLanguage === 'english' ||
    rawLanguage === 'japanese' ||
    rawLanguage === 'korean' ||
    rawLanguage === 'french' ||
    rawLanguage === 'german' ||
    rawLanguage === 'spanish'
  ) {
    return rawLanguage
  }

  return 'chinese'
}

function sanitizeCustomTranslationPrompt(rawPrompt: unknown): string {
  const prompt = String(rawPrompt ?? '').trim()

  // NOTE: 限制自定义 prompt 长度，避免误填超长内容导致请求异常。
  return prompt.slice(0, 4000)
}

<<<<<<< HEAD
=======
function sanitizeImageCustomPrompt(rawPrompt: unknown): string {
  const prompt = String(rawPrompt ?? '').trim()

  // NOTE: 图片翻译自定义提示词与文本翻译提示词长度限制保持一致。
  return prompt.slice(0, 4000)
}

>>>>>>> develop
function sanitizeScreenshotTranslateMode(rawMode: unknown): ScreenshotTranslateMode {
  // NOTE: 截图模式仅允许当前启用的固定值，异常值回退到视觉直译。
  if (rawMode === 'ocr_local') {
    return rawMode
  }

  return 'vision_direct'
}

function sanitizeScreenshotMaxImageSide(rawMaxSide: unknown): number {
  const parsed = Number(rawMaxSide)

  // NOTE: 限制截图压缩最长边范围，防止图片过大触发请求失败。
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LLM_CONFIG.screenshotMaxImageSide
  }

  const rounded = Math.round(parsed)
  const minSide = 600
  const maxSide = 4096

  return Math.min(maxSide, Math.max(minSide, rounded))
}

function sanitizeScreenshotImageQuality(rawQuality: unknown): number {
  const parsed = Number(rawQuality)

  // NOTE: 压缩质量限制在 0.4~1.0，平衡清晰度与请求体大小。
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LLM_CONFIG.screenshotImageQuality
  }

  return Math.min(1, Math.max(0.4, parsed))
}

function sanitizeRequestTimeoutMs(rawTimeoutMs: unknown): number {
  const parsed = Number(rawTimeoutMs)

  // NOTE: 限制超时范围，防止异常值导致”立即超时”或超长悬挂。
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LLM_CONFIG.textRequestTimeoutMs
  }

  const rounded = Math.round(parsed)
  const minMs = 5000
  const maxMs = 600000

  return Math.min(maxMs, Math.max(minMs, rounded))
}

// NOTE: 从浏览器存储读取配置，读取失败时回落到默认值，并兼容旧字段。
export async function getLlmConfig(): Promise<LlmConfig> {
<<<<<<< HEAD
  const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome
=======
  const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome
>>>>>>> develop
  if (!chromeApi?.storage?.sync?.get) {
    return DEFAULT_LLM_CONFIG
  }

  const stored = await chromeApi.storage.sync.get(STORAGE_DEFAULTS_WITH_LEGACY_FIELDS)
  if (chromeApi?.storage?.sync?.remove) {
    const removedConfigSnapshot = await chromeApi.storage.sync.get([...REMOVED_SCREENSHOT_CONFIG_KEYS])

    if (Object.keys(removedConfigSnapshot).length > 0) {
      // NOTE: 读取配置时顺手清理已废弃字段，避免旧版本残留继续占用存储。
      await chromeApi.storage.sync.remove([...REMOVED_SCREENSHOT_CONFIG_KEYS])
    }
  }
  const legacyTextBaseUrl = sanitizeSimpleText(stored.baseUrl, 2000)
  const legacyTextApiKey = sanitizeSimpleText(stored.apiKey, 1000)
  const legacyTextSelectedModel = sanitizeModelName(stored.selectedModel)
  const legacyTextModelList = sanitizeModelList(stored.modelList)
  const legacyTextAutoRefreshModels = Boolean(stored.autoRefreshModels)
  const legacyScreenshotVisionModel = sanitizeModelName(stored.screenshotVisionModel)

  const textBaseUrl = sanitizeSimpleText(stored.textBaseUrl ?? legacyTextBaseUrl, 2000)
  const textApiKey = sanitizeSimpleText(stored.textApiKey ?? legacyTextApiKey, 1000)
  const textSelectedModel = sanitizeModelName(stored.textSelectedModel ?? legacyTextSelectedModel)
  const textModelList = sanitizeModelList(stored.textModelList ?? legacyTextModelList)
  const textAutoRefreshModels = Boolean(stored.textAutoRefreshModels ?? legacyTextAutoRefreshModels)
  const useTextConfigForVision = Boolean(stored.useTextConfigForVision ?? DEFAULT_LLM_CONFIG.useTextConfigForVision)

  const visionBaseUrl = sanitizeSimpleText(stored.visionBaseUrl ?? textBaseUrl, 2000)
  const visionApiKey = sanitizeSimpleText(stored.visionApiKey ?? textApiKey, 1000)
  const visionSelectedModel = sanitizeModelName(stored.visionSelectedModel ?? legacyScreenshotVisionModel)
  const visionModelList = sanitizeModelList(stored.visionModelList ?? [])
  const visionAutoRefreshModels = Boolean(stored.visionAutoRefreshModels ?? DEFAULT_LLM_CONFIG.visionAutoRefreshModels)
<<<<<<< HEAD
=======

  // NOTE: 旧字段 requestTimeoutMs 统一迁移为 textRequestTimeoutMs，各翻译类型独立超时字段优先。
  const legacyRequestTimeoutMs = sanitizeRequestTimeoutMs(stored.requestTimeoutMs ?? undefined)
  const textRequestTimeoutMs = sanitizeRequestTimeoutMs(stored.textRequestTimeoutMs ?? legacyRequestTimeoutMs)
  const screenshotRequestTimeoutMs = sanitizeRequestTimeoutMs(stored.screenshotRequestTimeoutMs ?? stored.requestTimeoutMs ?? DEFAULT_LLM_CONFIG.screenshotRequestTimeoutMs)
  const imageRequestTimeoutMs = sanitizeRequestTimeoutMs(stored.imageRequestTimeoutMs ?? stored.requestTimeoutMs ?? DEFAULT_LLM_CONFIG.imageRequestTimeoutMs)
>>>>>>> develop

  return {
    textBaseUrl,
    textApiKey,
    textSelectedModel,
    textModelList,
    textAutoRefreshModels,
    useTextConfigForVision,
    visionBaseUrl,
    visionApiKey,
    visionSelectedModel,
    visionModelList,
    visionAutoRefreshModels,
    translationTriggerMode: sanitizeTranslationTriggerMode(stored.translationTriggerMode),
    targetLanguage: sanitizeTargetLanguage(stored.targetLanguage),
    customTranslationPrompt: sanitizeCustomTranslationPrompt(stored.customTranslationPrompt),
<<<<<<< HEAD
    requestTimeoutMs: sanitizeRequestTimeoutMs(stored.requestTimeoutMs),
=======
    textRequestTimeoutMs,
    screenshotRequestTimeoutMs,
    imageRequestTimeoutMs,
>>>>>>> develop
    screenshotTranslateMode: sanitizeScreenshotTranslateMode(stored.screenshotTranslateMode),
    screenshotEnableFallback: Boolean(stored.screenshotEnableFallback ?? DEFAULT_LLM_CONFIG.screenshotEnableFallback),
    screenshotMaxImageSide: sanitizeScreenshotMaxImageSide(stored.screenshotMaxImageSide),
    screenshotImageQuality: sanitizeScreenshotImageQuality(stored.screenshotImageQuality),
<<<<<<< HEAD
=======
    imageTranslateMode: sanitizeScreenshotTranslateMode(stored.imageTranslateMode),
    imageEnableFallback: Boolean(stored.imageEnableFallback ?? DEFAULT_LLM_CONFIG.imageEnableFallback),
    imageCustomPrompt: sanitizeImageCustomPrompt(stored.imageCustomPrompt),
>>>>>>> develop
  }
}

// NOTE: 保存配置前做基础清洗，保证存储值可直接用于请求。
export async function saveLlmConfig(config: LlmConfig): Promise<void> {
<<<<<<< HEAD
  const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome
=======
  const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome
>>>>>>> develop
  if (!chromeApi?.storage?.sync?.set) {
    return
  }

  const sanitizedTextBaseUrl = sanitizeSimpleText(config.textBaseUrl, 2000)
  const sanitizedTextApiKey = sanitizeSimpleText(config.textApiKey, 1000)
  const sanitizedTextSelectedModel = sanitizeModelName(config.textSelectedModel)
  const sanitizedTextModelList = sanitizeModelList(config.textModelList)
  const sanitizedTextAutoRefreshModels = Boolean(config.textAutoRefreshModels)
  const sanitizedUseTextConfigForVision = Boolean(config.useTextConfigForVision)
  const sanitizedVisionBaseUrl = sanitizeSimpleText(config.visionBaseUrl, 2000)
  const sanitizedVisionApiKey = sanitizeSimpleText(config.visionApiKey, 1000)
  const sanitizedVisionSelectedModel = sanitizeModelName(config.visionSelectedModel)
  const sanitizedVisionModelList = sanitizeModelList(config.visionModelList)
  const sanitizedVisionAutoRefreshModels = Boolean(config.visionAutoRefreshModels)

  await chromeApi.storage.sync.set({
    textBaseUrl: sanitizedTextBaseUrl,
    textApiKey: sanitizedTextApiKey,
    textSelectedModel: sanitizedTextSelectedModel,
    textModelList: sanitizedTextModelList,
    textAutoRefreshModels: sanitizedTextAutoRefreshModels,
    useTextConfigForVision: sanitizedUseTextConfigForVision,
    visionBaseUrl: sanitizedVisionBaseUrl,
    visionApiKey: sanitizedVisionApiKey,
    visionSelectedModel: sanitizedVisionSelectedModel,
    visionModelList: sanitizedVisionModelList,
    visionAutoRefreshModels: sanitizedVisionAutoRefreshModels,
    translationTriggerMode: sanitizeTranslationTriggerMode(config.translationTriggerMode),
    targetLanguage: sanitizeTargetLanguage(config.targetLanguage),
    customTranslationPrompt: sanitizeCustomTranslationPrompt(config.customTranslationPrompt),
<<<<<<< HEAD
    requestTimeoutMs: sanitizeRequestTimeoutMs(config.requestTimeoutMs),
=======
    textRequestTimeoutMs: sanitizeRequestTimeoutMs(config.textRequestTimeoutMs),
    screenshotRequestTimeoutMs: sanitizeRequestTimeoutMs(config.screenshotRequestTimeoutMs),
    imageRequestTimeoutMs: sanitizeRequestTimeoutMs(config.imageRequestTimeoutMs),
>>>>>>> develop
    screenshotTranslateMode: sanitizeScreenshotTranslateMode(config.screenshotTranslateMode),
    screenshotEnableFallback: Boolean(config.screenshotEnableFallback),
    screenshotMaxImageSide: sanitizeScreenshotMaxImageSide(config.screenshotMaxImageSide),
    screenshotImageQuality: sanitizeScreenshotImageQuality(config.screenshotImageQuality),
<<<<<<< HEAD
=======
    imageTranslateMode: sanitizeScreenshotTranslateMode(config.imageTranslateMode),
    imageEnableFallback: Boolean(config.imageEnableFallback),
    imageCustomPrompt: sanitizeImageCustomPrompt(config.imageCustomPrompt),
>>>>>>> develop
    // HACK: 继续写入旧字段，便于平滑兼容历史实现与回滚。
    baseUrl: sanitizedTextBaseUrl,
    apiKey: sanitizedTextApiKey,
    selectedModel: sanitizedTextSelectedModel,
    modelList: sanitizedTextModelList,
    autoRefreshModels: sanitizedTextAutoRefreshModels,
    screenshotVisionModel: sanitizedVisionSelectedModel,
<<<<<<< HEAD
=======
    requestTimeoutMs: sanitizeRequestTimeoutMs(config.textRequestTimeoutMs),
>>>>>>> develop
  })

  // NOTE: 移除已废弃的云端 OCR 配置字段，避免存储中遗留无效数据。
  await chromeApi.storage.sync.remove([...REMOVED_SCREENSHOT_CONFIG_KEYS])
}
