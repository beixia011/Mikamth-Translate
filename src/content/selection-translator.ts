import { getLlmConfig } from '../shared/config'

// 中文注释：内容脚本监听用户划词并显示翻译浮层。
const PANEL_ID = 'my-translate-selection-panel'
const MAX_TRANSLATE_TEXT_LENGTH = 1200

let latestTranslateTaskId = 0

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

function normalizeTranslateText(rawText: string): string {
  // 中文注释：去除零宽字符，减少“看起来很短但实际包含隐藏字符”的情况。
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

function removePanel(): void {
  document.getElementById(PANEL_ID)?.remove()
}

function positionPanel(panel: HTMLDivElement, anchor: AnchorPoint): void {
  // 中文注释：根据浮层实际尺寸动态定位，优先放在选区下方，不够空间时放上方。
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
  panel.style.whiteSpace = 'pre-wrap'
  panel.style.wordBreak = 'break-word'
  panel.textContent = text
  panel.style.visibility = 'hidden'

  document.body.appendChild(panel)
  positionPanel(panel, anchor)
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

async function requestTranslation(text: string): Promise<{ ok: boolean; translation?: string; error?: string }> {
  const chromeApi = (globalThis as any).chrome

  return chromeApi.runtime.sendMessage({
    type: 'TRANSLATE_TEXT',
    payload: { text },
  })
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

    // 中文注释：仅允许最新任务更新界面，避免旧请求晚返回覆盖新结果。
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

  // 中文注释：右键后若页面选区丢失，使用后台传回的 selectionText 作为兜底。
  const fallbackValidation = validateTranslateText(fallbackRawText)

  if (!fallbackValidation.ok) {
    showTranslationResult(`翻译失败：${fallbackValidation.error}`, getDefaultAnchor())
    return
  }

  await translateAndRender(fallbackValidation.text, getDefaultAnchor())
}

async function shouldAutoTranslate(): Promise<boolean> {
  const config = await getLlmConfig()
  return config.translationTriggerMode === 'auto_selection'
}

// 中文注释：在鼠标抬起后按配置触发自动划词翻译，减少与页面选择行为冲突。
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

const chromeApi = (globalThis as any).chrome

// 中文注释：接收后台右键翻译指令并展示到页面浮层。
chromeApi.runtime.onMessage.addListener((message: any) => {
  if (message?.type === 'CONTEXT_MENU_TRANSLATE') {
    const fallbackText = String(message?.payload?.text ?? '')
    void handleContextMenuTranslate(fallbackText)
  }
})

// 中文注释：点击面板外部或按下 Esc 时关闭浮层，并取消当前未完成任务的界面回写。
document.addEventListener('mousedown', (event) => {
  const panel = document.getElementById(PANEL_ID)

  if (!panel) {
    return
  }

  if (!panel.contains(event.target as Node)) {
    latestTranslateTaskId += 1
    removePanel()
  }
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    latestTranslateTaskId += 1
    removePanel()
  }
})
