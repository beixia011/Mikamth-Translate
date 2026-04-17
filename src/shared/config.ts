// 中文注释：定义大模型配置结构，供配置页和后台脚本共享。
export type TranslationTargetLanguage =
  | 'chinese'
  | 'english'
  | 'japanese'
  | 'korean'
  | 'french'
  | 'german'
  | 'spanish'

// 中文注释：默认翻译提示词作为统一基线，目标语言仅通过追加短句控制。
export const DEFAULT_TRANSLATION_PROMPT =
  '你是专业翻译助手。请将用户提供的文本翻译为自然、准确、简洁的内容。仅输出翻译结果，不要添加解释。'

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  selectedModel: string
  modelList: string[]
  autoRefreshModels: boolean
  translationTriggerMode: 'context_menu' | 'auto_selection'
  targetLanguage: TranslationTargetLanguage
  customTranslationPrompt: string
  requestTimeoutMs: number
}

// 中文注释：统一默认值，避免 storage 中字段缺失时出现 undefined。
export const DEFAULT_LLM_CONFIG: LlmConfig = {
  baseUrl: '',
  apiKey: '',
  selectedModel: '',
  modelList: [],
  autoRefreshModels: false,
  translationTriggerMode: 'context_menu',
  targetLanguage: 'chinese',
  customTranslationPrompt: '',
  requestTimeoutMs: 180000,
}

function sanitizeModelList(rawModelList: unknown): string[] {
  if (!Array.isArray(rawModelList)) {
    return []
  }

  // 中文注释：仅保留非空字符串模型名，避免异常数据污染下拉框。
  return rawModelList
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
}

function sanitizeTranslationTriggerMode(rawMode: unknown): 'context_menu' | 'auto_selection' {
  // 中文注释：仅允许已定义触发模式，异常值统一回退到默认模式。
  if (rawMode === 'auto_selection') {
    return 'auto_selection'
  }

  return 'context_menu'
}

function sanitizeTargetLanguage(rawLanguage: unknown): TranslationTargetLanguage {
  // 中文注释：仅允许预定义语言标识，异常值回退到默认“中文”。
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

  // 中文注释：限制自定义 prompt 长度，避免误填超长内容导致请求异常。
  return prompt.slice(0, 4000)
}

function sanitizeRequestTimeoutMs(rawTimeoutMs: unknown): number {
  const parsed = Number(rawTimeoutMs)

  // 中文注释：限制超时范围，防止异常值导致“立即超时”或超长悬挂。
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LLM_CONFIG.requestTimeoutMs
  }

  const rounded = Math.round(parsed)
  const minMs = 5000
  const maxMs = 600000

  return Math.min(maxMs, Math.max(minMs, rounded))
}

// 中文注释：从浏览器存储读取配置，读取失败时回落到默认值。
export async function getLlmConfig(): Promise<LlmConfig> {
  const chromeApi = (globalThis as any).chrome

  if (!chromeApi?.storage?.sync?.get) {
    return DEFAULT_LLM_CONFIG
  }

  const stored = await chromeApi.storage.sync.get(DEFAULT_LLM_CONFIG)
  const modelList = sanitizeModelList(stored.modelList)

  return {
    baseUrl: String(stored.baseUrl ?? '').trim(),
    apiKey: String(stored.apiKey ?? '').trim(),
    selectedModel: String(stored.selectedModel ?? '').trim(),
    modelList,
    autoRefreshModels: Boolean(stored.autoRefreshModels),
    translationTriggerMode: sanitizeTranslationTriggerMode(stored.translationTriggerMode),
    targetLanguage: sanitizeTargetLanguage(stored.targetLanguage),
    customTranslationPrompt: sanitizeCustomTranslationPrompt(stored.customTranslationPrompt),
    requestTimeoutMs: sanitizeRequestTimeoutMs(stored.requestTimeoutMs),
  }
}

// 中文注释：保存配置前做基础清洗，保证存储值可直接用于请求。
export async function saveLlmConfig(config: LlmConfig): Promise<void> {
  const chromeApi = (globalThis as any).chrome

  if (!chromeApi?.storage?.sync?.set) {
    return
  }

  await chromeApi.storage.sync.set({
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    selectedModel: config.selectedModel.trim(),
    modelList: sanitizeModelList(config.modelList),
    autoRefreshModels: Boolean(config.autoRefreshModels),
    translationTriggerMode: sanitizeTranslationTriggerMode(config.translationTriggerMode),
    targetLanguage: sanitizeTargetLanguage(config.targetLanguage),
    customTranslationPrompt: sanitizeCustomTranslationPrompt(config.customTranslationPrompt),
    requestTimeoutMs: sanitizeRequestTimeoutMs(config.requestTimeoutMs),
  })
}
