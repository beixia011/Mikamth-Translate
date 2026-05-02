import {
  DEFAULT_PAGE_IMAGE_PROMPT,
  DEFAULT_TRANSLATION_PROMPT,
  getLlmConfig,
  type LlmConfig,
  type TranslationTargetLanguage,
} from '../shared/config'

// NOTE: 目标语言仅追加短提示词，保持基础 prompt 主体稳定。
const TARGET_LANGUAGE_PROMPT_SUFFIX: Record<TranslationTargetLanguage, string> = {
  chinese: '请将译文输出为简体中文。',
  english: '请将译文输出为英语。',
  japanese: '请将译文输出为日语。',
  korean: '请将译文输出为韩语。',
  french: '请将译文输出为法语。',
  german: '请将译文输出为德语。',
  spanish: '请将译文输出为西班牙语。',
}

// NOTE: 截图翻译统一提示词，要求只输出译文并保留结构。
const DEFAULT_SCREENSHOT_PROMPT =
  '请识别图片中的可读文本并翻译，不要遗漏标题、表格或段落层次。仅输出翻译结果，不要添加解释。不要输出任何和图片中文字无关的信息'

type ChatCompletionMessage =
  | {
      role: 'system' | 'user' | 'assistant'
      content: string
    }
  | {
      role: 'user'
      content: Array<
        | {
            type: 'text'
            text: string
          }
        | {
            type: 'image_url'
            image_url: {
              url: string
            }
          }
      >
    }

type LlmEndpointConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  if (trimmedBaseUrl.endsWith('/chat/completions')) {
    return trimmedBaseUrl
  }

  return `${trimmedBaseUrl}/chat/completions`
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    globalThis.clearTimeout(timer)
  }
}

function buildTranslationSystemPrompt(customPrompt: string, targetLanguage: TranslationTargetLanguage): string {
  const basePrompt = customPrompt.trim() || DEFAULT_TRANSLATION_PROMPT
  const languageSuffixPrompt = TARGET_LANGUAGE_PROMPT_SUFFIX[targetLanguage]

  return `${basePrompt}\n${languageSuffixPrompt}`
}

function buildScreenshotSystemPrompt(targetLanguage: TranslationTargetLanguage): string {
  const languageSuffixPrompt = TARGET_LANGUAGE_PROMPT_SUFFIX[targetLanguage]
  return `${DEFAULT_SCREENSHOT_PROMPT}\n${languageSuffixPrompt}`
}

function buildPageImageSystemPrompt(customPrompt: string, targetLanguage: TranslationTargetLanguage): string {
  const basePrompt = customPrompt.trim() || DEFAULT_PAGE_IMAGE_PROMPT
  const languageSuffixPrompt = TARGET_LANGUAGE_PROMPT_SUFFIX[targetLanguage]
  return `${basePrompt}\n${languageSuffixPrompt}`
}

function resolveTextEndpointConfig(config: LlmConfig): LlmEndpointConfig {
  if (!config.textBaseUrl) {
    throw new Error('请先在配置页面填写文本模型 baseUrl')
  }

  if (!config.textApiKey) {
    throw new Error('请先在配置页面填写文本模型 apiKey')
  }

  if (!config.textSelectedModel) {
    throw new Error('请先在配置页面刷新并选择文本模型')
  }

  return {
    baseUrl: config.textBaseUrl,
    apiKey: config.textApiKey,
    model: config.textSelectedModel,
  }
}

function resolveVisionEndpointConfig(config: LlmConfig): LlmEndpointConfig {
  // NOTE: 视觉模型来源于模型服务页，可选择复用文本配置或独立配置。
  if (config.useTextConfigForVision) {
    const textConfig = resolveTextEndpointConfig(config)

    return {
      ...textConfig,
      model: textConfig.model,
    }
  }

  if (!config.visionBaseUrl) {
    throw new Error('请先在配置页面填写视觉模型 baseUrl')
  }

  if (!config.visionApiKey) {
    throw new Error('请先在配置页面填写视觉模型 apiKey')
  }

  if (!config.visionSelectedModel) {
    throw new Error('请先在配置页面刷新并选择视觉模型')
  }

  return {
    baseUrl: config.visionBaseUrl,
    apiKey: config.visionApiKey,
    model: config.visionSelectedModel,
  }
}

async function requestChatCompletion(
  endpointConfig: LlmEndpointConfig,
  messages: ChatCompletionMessage[],
  timeoutMs: number,
): Promise<{ text: string; status: number; rawErrorText?: string }> {
  const endpoint = buildChatCompletionsUrl(endpointConfig.baseUrl)

  let response: Response

  try {
    response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${endpointConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: endpointConfig.model,
          temperature: 0.2,
          messages,
        }),
      },
      timeoutMs,
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`翻译超时（${Math.round(timeoutMs / 1000)} 秒），请重试`)
    }

    throw error
  }

  if (!response.ok) {
    return {
      text: '',
      status: response.status,
      rawErrorText: await response.text(),
    }
  }

  const data = await response.json()
  const result = data?.choices?.[0]?.message?.content

  if (!result || typeof result !== 'string') {
    throw new Error('翻译结果为空，请检查模型服务是否兼容 OpenAI Chat Completions 协议')
  }

  return {
    text: result.trim(),
    status: response.status,
  }
}

function isVisionUnsupportedError(status: number, rawErrorText: string): boolean {
  const merged = `${status} ${rawErrorText}`.toLowerCase()
  const hints = [
    'vision',
    'image_url',
    'image input',
    'multimodal',
    'does not support image',
    'not support image',
    'not support vision',
    'only text',
    'unsupported content type',
  ]

  return hints.some((hint) => merged.includes(hint))
}

export async function translateTextByLlm(text: string, inputConfig?: LlmConfig): Promise<string> {
  const config = inputConfig ?? (await getLlmConfig())
  const endpointConfig = resolveTextEndpointConfig(config)

  const response = await requestChatCompletion(
    endpointConfig,
    [
      {
        role: 'system',
        content: buildTranslationSystemPrompt(config.customTranslationPrompt, config.targetLanguage),
      },
      {
        role: 'user',
        content: text,
      },
    ],
    config.textRequestTimeoutMs,
  )

  if (response.rawErrorText) {
    throw new Error(`翻译请求失败：${response.status} ${response.rawErrorText}`)
  }

  return response.text
}

export async function translateImageByLlm(imageDataUrl: string, inputConfig?: LlmConfig): Promise<string> {
  const config = inputConfig ?? (await getLlmConfig())
  const endpointConfig = resolveVisionEndpointConfig(config)

  const response = await requestChatCompletion(
    endpointConfig,
    [
      {
        role: 'system',
        content: buildScreenshotSystemPrompt(config.targetLanguage),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请翻译这张截图中的文本内容，保持原有段落层次，仅输出译文。',
          },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl,
            },
          },
        ],
      },
    ],
    config.screenshotRequestTimeoutMs,
  )

  if (response.rawErrorText) {
    if (isVisionUnsupportedError(response.status, response.rawErrorText)) {
      throw new Error('当前模型不支持视觉输入，请切换到支持视觉的模型或改用 OCR 模式')
    }

    throw new Error(`截图翻译请求失败：${response.status} ${response.rawErrorText}`)
  }

  return response.text
}

// NOTE: 页面图片视觉翻译，使用图片翻译专用提示词与超时配置。
export async function translatePageImageByLlm(imageDataUrl: string, inputConfig?: LlmConfig): Promise<string> {
  const config = inputConfig ?? (await getLlmConfig())
  const endpointConfig = resolveVisionEndpointConfig(config)

  const response = await requestChatCompletion(
    endpointConfig,
    [
      {
        role: 'system',
        content: buildPageImageSystemPrompt(config.imageCustomPrompt, config.targetLanguage),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请理解这张图片的语境，结合画面上下文翻译其中的文字内容。仅输出翻译结果。',
          },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl,
            },
          },
        ],
      },
    ],
    config.imageRequestTimeoutMs,
  )

  if (response.rawErrorText) {
    if (isVisionUnsupportedError(response.status, response.rawErrorText)) {
      throw new Error('当前模型不支持视觉输入，请切换到支持视觉的模型或改用 OCR 模式')
    }

    throw new Error(`图片翻译请求失败：${response.status} ${response.rawErrorText}`)
  }

  return response.text
}
