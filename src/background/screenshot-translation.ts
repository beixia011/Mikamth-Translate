import {
  getLlmConfig,
  type LlmConfig,
  type ScreenshotTranslateMode,
  type TranslationTargetLanguage,
} from '../shared/config'
import type { ChromeApi } from '../shared/chrome-api'
import type { LocalOcrLanguage, RunLocalOcrMessage, RunLocalOcrResponse } from '../shared/messages'
import { translateImageByLlm, translatePageImageByLlm, translateTextByLlm } from './llm-client'
import { extractTextByOffscreenTesseract } from './offscreen-ocr'

type ImageTranslationSource = 'screenshot' | 'page_image'

type ImageTranslationResult = {
  translation: string
  usedMode: ScreenshotTranslateMode
}

type ScreenshotTranslationContext = {
  tabId?: number
}

const MODE_LABELS: Record<ScreenshotTranslateMode, string> = {
  vision_direct: '视觉直译',
  ocr_local: '本地 OCR',
}

const SCREENSHOT_FALLBACK_ORDER: ScreenshotTranslateMode[] = ['vision_direct', 'ocr_local']

const LOCAL_OCR_LANGUAGE_LABELS: Record<LocalOcrLanguage, string> = {
  eng: 'eng',
  chi_sim: 'chi_sim',
}

const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome

function normalizeOcrText(rawText: string): string {
  // NOTE: 先做基础清洗，降低 OCR 结果中的空行噪音。
  return rawText
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function ensureOcrText(rawText: string, mode: ScreenshotTranslateMode): string {
  const text = normalizeOcrText(rawText)

  if (!text) {
    throw new Error(`${MODE_LABELS[mode]}未识别到可翻译文本`)
  }

  return text.slice(0, 12000)
}

function buildModePlan(mode: ScreenshotTranslateMode, enableFallback: boolean): ScreenshotTranslateMode[] {
  if (!enableFallback) {
    return [mode]
  }

  // NOTE: 降级策略保留统一编排结构，后续新增截图模式时只需扩展顺序数组。
  return [mode, ...SCREENSHOT_FALLBACK_ORDER.filter((candidateMode) => candidateMode !== mode)]
}

async function runVisionDirectMode(config: LlmConfig, imageDataUrl: string, source: ImageTranslationSource): Promise<string> {
  if (source === 'page_image') {
    return translatePageImageByLlm(imageDataUrl, config)
  }

  return translateImageByLlm(imageDataUrl, config)
}

async function extractTextByPageTextDetector(tabId: number, imageDataUrl: string): Promise<string> {
  const message: RunLocalOcrMessage = {
    type: 'RUN_LOCAL_OCR',
    payload: {
      imageDataUrl,
    },
  }

  let response: RunLocalOcrResponse | undefined

  try {
    // NOTE: 页面 OCR 由内容脚本中的 TextDetector 执行，后台只负责调度与结果收集。
    response = await chromeApi.tabs.sendMessage(tabId, message) as RunLocalOcrResponse | undefined
  } catch (error) {
    const messageText = error instanceof Error ? error.message : '未知错误'
    throw new Error(`页面 OCR 请求发送失败：${messageText}`)
  }

  if (!response?.ok || !response.text) {
    throw new Error(response?.error ?? '当前页面未返回本地 OCR 结果')
  }

  return response.text
}

function normalizeDetectedPageLanguage(rawLanguage: string): string | null {
  const normalizedLanguage = rawLanguage.trim().toLowerCase()

  if (!normalizedLanguage || normalizedLanguage === 'und') {
    return null
  }

  return normalizedLanguage
}

async function detectPageLanguage(tabId: number | undefined): Promise<string | null> {
  if (typeof tabId !== 'number' || typeof chromeApi?.tabs?.detectLanguage !== 'function') {
    return null
  }

  try {
    return await new Promise((resolve) => {
      chromeApi.tabs.detectLanguage(tabId, (detectedLanguage: string | undefined) => {
        const runtimeError = chromeApi?.runtime?.lastError

        if (runtimeError) {
          resolve(null)
          return
        }

        resolve(normalizeDetectedPageLanguage(String(detectedLanguage ?? '')))
      })
    })
  } catch {
    return null
  }
}

function mapPageLanguageToLocalOcrLanguage(pageLanguage: string | null): LocalOcrLanguage | null {
  if (!pageLanguage) {
    return null
  }

  if (pageLanguage.startsWith('zh')) {
    return 'chi_sim'
  }

  if (pageLanguage.startsWith('en')) {
    return 'eng'
  }

  return null
}

function mapTargetLanguageToLocalOcrLanguage(targetLanguage: TranslationTargetLanguage): LocalOcrLanguage {
  // NOTE: 拿不到页面语言时，用”目标语言的反向常见来源”作为 OCR 首选语言。
  if (targetLanguage === 'english') {
    return 'chi_sim'
  }

  return 'eng'
}

function buildLocalOcrLanguagePlan(
  pageLanguage: string | null,
  targetLanguage: TranslationTargetLanguage,
): LocalOcrLanguage[][] {
  // NOTE: 优先采用页面语言；若页面语言无法判断，再按目标语言推断首选 OCR 语言。
  const primaryLanguage = mapPageLanguageToLocalOcrLanguage(pageLanguage) ?? mapTargetLanguageToLocalOcrLanguage(targetLanguage)
  const secondaryLanguage: LocalOcrLanguage = primaryLanguage === 'eng' ? 'chi_sim' : 'eng'
  const mixedLanguagePlan: LocalOcrLanguage[] = [primaryLanguage, secondaryLanguage]

  return [[primaryLanguage], mixedLanguagePlan, [secondaryLanguage]]
}

async function extractTextByLocalOcr(config: LlmConfig, tabId: number | undefined, imageDataUrl: string): Promise<string> {
  const errors: string[] = []

  if (typeof tabId === 'number') {
    try {
      return await extractTextByPageTextDetector(tabId, imageDataUrl)
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '未知错误'
      errors.push(`TextDetector 失败：${messageText}`)
    }
  } else {
    errors.push('TextDetector 失败：当前标签页不可用，无法执行页面 OCR')
  }

  const pageLanguage = await detectPageLanguage(tabId)
  const languagePlan = buildLocalOcrLanguagePlan(pageLanguage, config.targetLanguage)

  for (const languages of languagePlan) {
    try {
      // NOTE: 离屏 Tesseract.js 按语言计划顺序尝试，尽量避免无意义加载全部语言包。
      return await extractTextByOffscreenTesseract(imageDataUrl, languages)
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '未知错误'
      const languageText = languages.map((language) => LOCAL_OCR_LANGUAGE_LABELS[language]).join('+')
      errors.push(`Offscreen Tesseract.js 失败（${languageText}）：${messageText}`)
    }
  }

  throw new Error(errors.join('\n'))
}

async function runLocalOcrMode(config: LlmConfig, imageDataUrl: string, tabId?: number): Promise<string> {
  const text = ensureOcrText(await extractTextByLocalOcr(config, tabId, imageDataUrl), 'ocr_local')
  return translateTextByLlm(text, config)
}

async function translateWithMode(
  config: LlmConfig,
  mode: ScreenshotTranslateMode,
  imageDataUrl: string,
  source: ImageTranslationSource,
  context: ScreenshotTranslationContext,
): Promise<string> {
  if (mode === 'vision_direct') {
    return runVisionDirectMode(config, imageDataUrl, source)
  }

  if (mode === 'ocr_local') {
    return runLocalOcrMode(config, imageDataUrl, context.tabId)
  }

  const unreachableMode: never = mode
  throw new Error(`未实现的截图翻译模式：${String(unreachableMode)}`)
}

export async function translateScreenshotByConfiguredMode(
  imageDataUrl: string,
  context: ScreenshotTranslationContext = {},
): Promise<ImageTranslationResult> {
  const config = await getLlmConfig()
  const source: ImageTranslationSource = 'screenshot'
  const modePlan = buildModePlan(config.screenshotTranslateMode, config.screenshotEnableFallback)
  const errors: string[] = []

  for (const mode of modePlan) {
    try {
      const translation = await translateWithMode(config, mode, imageDataUrl, source, context)

      return {
        translation,
        usedMode: mode,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      errors.push(`[${MODE_LABELS[mode]}] ${message}`)
    }
  }

  throw new Error(errors.join('\n'))
}

// NOTE: 页面图片翻译编排层，读取图片翻译专属配置（模式/降级/提示词/超时），复用截图翻译的 OCR 与降级链路。
export async function translatePageImageByConfiguredMode(
  imageDataUrl: string,
  context: ScreenshotTranslationContext = {},
): Promise<ImageTranslationResult> {
  const config = await getLlmConfig()
  const source: ImageTranslationSource = 'page_image'
  const modePlan = buildModePlan(config.imageTranslateMode, config.imageEnableFallback)
  const errors: string[] = []

  for (const mode of modePlan) {
    try {
      const translation = await translateWithMode(config, mode, imageDataUrl, source, context)

      return {
        translation,
        usedMode: mode,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      errors.push(`[${MODE_LABELS[mode]}] ${message}`)
    }
  }

  throw new Error(errors.join('\n'))
}
