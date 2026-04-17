import { DEFAULT_TRANSLATION_PROMPT, getLlmConfig, type TranslationTargetLanguage } from '../shared/config'

const TRANSLATE_CONTEXT_MENU_ID = 'translate-selected-text'

// 中文注释：目标语言仅通过附加短提示词控制，保证基础 prompt 主体稳定。
const TARGET_LANGUAGE_PROMPT_SUFFIX: Record<TranslationTargetLanguage, string> = {
  chinese: '请将译文输出为简体中文。',
  english: '请将译文输出为英语。',
  japanese: '请将译文输出为日语。',
  korean: '请将译文输出为韩语。',
  french: '请将译文输出为法语。',
  german: '请将译文输出为德语。',
  spanish: '请将译文输出为西班牙语。',
}

// 中文注释：定义消息协议，避免消息字段拼写分散在多个文件。
type TranslateRequestMessage = {
  type: 'TRANSLATE_TEXT'
  payload: {
    text: string
  }
}

type ContextMenuTranslateMessage = {
  type: 'CONTEXT_MENU_TRANSLATE'
  payload: {
    text: string
  }
}

// 中文注释：根据用户输入的 baseUrl 自动补齐 chat/completions 路径。
function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  if (trimmedBaseUrl.endsWith('/chat/completions')) {
    return trimmedBaseUrl
  }

  return `${trimmedBaseUrl}/chat/completions`
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
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

  // 中文注释：目标语言仅追加短提示词，不改动基础 prompt 其它内容。
  return `${basePrompt}\n${languageSuffixPrompt}`
}

// 中文注释：调用大模型完成翻译请求，基础 prompt 可配置且支持目标语言后缀。
async function translateByLlm(text: string): Promise<string> {
  const config = await getLlmConfig()

  if (!config.baseUrl) {
    throw new Error('请先在配置页面填写 baseUrl')
  }

  if (!config.apiKey) {
    throw new Error('请先在配置页面填写 apiKey')
  }

  if (!config.selectedModel) {
    throw new Error('请先在配置页面刷新模型并选择用于翻译的模型')
  }

  const endpoint = buildChatCompletionsUrl(config.baseUrl)
  const timeoutMs = config.requestTimeoutMs
  let response: Response

  try {
    response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.selectedModel,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: buildTranslationSystemPrompt(config.customTranslationPrompt, config.targetLanguage),
            },
            {
              role: 'user',
              content: text,
            },
          ],
        }),
      },
      timeoutMs,
    )
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      throw new Error(`翻译超时（${Math.round(timeoutMs / 1000)} 秒），请重试`)
    }

    throw error
  }

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`翻译请求失败：${response.status} ${responseText}`)
  }

  const data = await response.json()
  const result = data?.choices?.[0]?.message?.content

  if (!result || typeof result !== 'string') {
    throw new Error('翻译结果为空，请检查模型服务是否兼容 OpenAI Chat Completions 协议')
  }

  return result.trim()
}

const chromeApi = (globalThis as any).chrome

async function safeSendMessageToTab(tabId: number, message: unknown): Promise<boolean> {
  try {
    // 中文注释：部分页面或未刷新的标签页没有接收端，这里统一兜底避免未捕获异常。
    await chromeApi.tabs.sendMessage(tabId, message)
    return true
  } catch (error) {
    console.warn('发送标签页消息失败，可能无可用接收端：', error)
    return false
  }
}

function ensureContextMenu(): void {
  // 中文注释：每次初始化都重建一次右键菜单，保证菜单状态一致。
  chromeApi.contextMenus.removeAll(() => {
    chromeApi.contextMenus.create({
      id: TRANSLATE_CONTEXT_MENU_ID,
      title: '翻译所选文本',
      contexts: ['selection'],
    })
  })
}

// 中文注释：安装插件和浏览器启动后都尝试注册右键菜单。
chromeApi.runtime.onInstalled.addListener(() => {
  ensureContextMenu()
})

chromeApi.runtime.onStartup.addListener(() => {
  ensureContextMenu()
})

ensureContextMenu()

// 中文注释：后台统一处理来自内容脚本的翻译请求。
chromeApi.runtime.onMessage.addListener((message: TranslateRequestMessage, _sender: unknown, sendResponse: (response: unknown) => void) => {
  if (message?.type !== 'TRANSLATE_TEXT') {
    return false
  }

  const text = String(message?.payload?.text ?? '').trim()

  if (!text) {
    sendResponse({ ok: false, error: '未检测到可翻译文本' })
    return false
  }

  // 中文注释：异步返回翻译结果，必须返回 true 保持消息通道。
  void translateByLlm(text)
    .then((translation) => {
      sendResponse({ ok: true, translation })
    })
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : '翻译失败'
      sendResponse({ ok: false, error: messageText })
    })

  return true
})

// 中文注释：处理网页右键菜单“翻译所选文本”事件。
chromeApi.contextMenus.onClicked.addListener((info: any, tab: any) => {
  if (info?.menuItemId !== TRANSLATE_CONTEXT_MENU_ID) {
    return
  }

  const tabId = typeof tab?.id === 'number' ? tab.id : null

  if (tabId === null) {
    return
  }

  const selectedText = String(info?.selectionText ?? '')

  // 中文注释：右键菜单优先由内容脚本重新读取选区；这里保留 selectionText 作为选区丢失时的兜底文本。
  const message: ContextMenuTranslateMessage = {
    type: 'CONTEXT_MENU_TRANSLATE',
    payload: {
      text: selectedText,
    },
  }
  void safeSendMessageToTab(tabId, message)
})
