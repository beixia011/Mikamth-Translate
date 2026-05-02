<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
<<<<<<< HEAD
import { DEFAULT_TRANSLATION_PROMPT, getLlmConfig, saveLlmConfig, type ScreenshotTranslateMode } from '../shared/config'
=======
import { DEFAULT_PAGE_IMAGE_PROMPT, DEFAULT_TRANSLATION_PROMPT, getLlmConfig, saveLlmConfig, type ScreenshotTranslateMode } from '../shared/config'
>>>>>>> develop

// NOTE: 定义配置页导航模块，后续新增功能仅需补充此数组和对应内容区块。
const sections = [
  { key: 'model', title: '模型服务', desc: '配置文本模型与视觉模型。' },
  { key: 'behavior', title: '翻译功能', desc: '配置基础翻译功能。' },
  { key: 'screenshot', title: '截图翻译', desc: '配置截图翻译模式与 OCR 参数。' },
<<<<<<< HEAD
=======
  { key: 'image', title: '图片翻译', desc: '配置页面图片翻译模式与提示词。' },
>>>>>>> develop
] as const

type SectionKey = (typeof sections)[number]['key']

const activeSection = ref<SectionKey>('model')

// NOTE: 文本模型配置。
const textBaseUrl = ref('')
const textApiKey = ref('')
const textSelectedModel = ref('')
const textModelList = ref<string[]>([])
const textAutoRefreshModels = ref(false)
<<<<<<< HEAD

// NOTE: 视觉模型配置，可选择复用文本模型配置。
const useTextConfigForVision = ref(true)
const visionBaseUrl = ref('')
const visionApiKey = ref('')
const visionSelectedModel = ref('')
const visionModelList = ref<string[]>([])
const visionAutoRefreshModels = ref(false)

// NOTE: 行为与截图相关配置。
const translationTriggerMode = ref<'context_menu' | 'auto_selection'>('context_menu')
const requestTimeoutSeconds = ref(180)
const customTranslationPrompt = ref('')
const screenshotTranslateMode = ref<ScreenshotTranslateMode>('vision_direct')
const screenshotEnableFallback = ref(true)
const screenshotMaxImageSide = ref(1800)
const screenshotImageQualityPercent = ref(85)

=======

// NOTE: 视觉模型配置，可选择复用文本模型配置。
const useTextConfigForVision = ref(true)
const visionBaseUrl = ref('')
const visionApiKey = ref('')
const visionSelectedModel = ref('')
const visionModelList = ref<string[]>([])
const visionAutoRefreshModels = ref(false)

// NOTE: 行为与截图相关配置。
const translationTriggerMode = ref<'context_menu' | 'auto_selection'>('context_menu')
const textRequestTimeoutSeconds = ref(180)
const customTranslationPrompt = ref('')
const screenshotTranslateMode = ref<ScreenshotTranslateMode>('vision_direct')
const screenshotEnableFallback = ref(true)
const screenshotRequestTimeoutSeconds = ref(180)
const screenshotMaxImageSide = ref(1800)
const screenshotImageQualityPercent = ref(85)

// NOTE: 页面图片翻译配置。
const imageTranslateMode = ref<ScreenshotTranslateMode>('vision_direct')
const imageEnableFallback = ref(true)
const imageCustomPrompt = ref('')
const imageRequestTimeoutSeconds = ref(180)

>>>>>>> develop
// NOTE: 页面提示信息，用于展示刷新/保存结果。
const message = ref('')
const saving = ref(false)
const textRefreshing = ref(false)
const visionRefreshing = ref(false)

const activeSectionMeta = computed(() => sections.find((item) => item.key === activeSection.value))

function buildModelsUrl(inputBaseUrl: string): string {
  const trimmedBaseUrl = inputBaseUrl.trim().replace(/\/+$/, '')

  if (trimmedBaseUrl.endsWith('/models')) {
    return trimmedBaseUrl
  }

  return `${trimmedBaseUrl}/models`
}

function extractModelIds(data: unknown): string[] {
  const payload = data as { data?: unknown[] }

  if (!Array.isArray(payload?.data)) {
    return []
  }

  return payload.data
    .map((item: unknown) => {
      const model = item as { id?: unknown }
      return String(model?.id ?? '').trim()
    })
    .filter((item) => item.length > 0)
}

async function requestModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const response = await fetch(buildModelsUrl(baseUrl), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`获取模型失败：${response.status} ${responseText}`)
  }

  const data = await response.json()
  const modelIds = extractModelIds(data)

  if (modelIds.length === 0) {
    throw new Error('未获取到模型，请检查 baseUrl 是否兼容 /models 协议')
  }

  return modelIds
}

// NOTE: 刷新文本模型列表并维护当前选中项。
async function refreshTextModels(): Promise<void> {
  const safeBaseUrl = textBaseUrl.value.trim()
  const safeApiKey = textApiKey.value.trim()

  if (!safeBaseUrl || !safeApiKey) {
    message.value = '请先填写文本模型 baseUrl 和 apiKey 再刷新'
    return
  }

  textRefreshing.value = true
  message.value = ''

  try {
    const nextModelList = await requestModels(safeBaseUrl, safeApiKey)
    textModelList.value = nextModelList

    if (!nextModelList.includes(textSelectedModel.value)) {
      textSelectedModel.value = nextModelList[0]
    }

    message.value = `文本模型已刷新，共 ${nextModelList.length} 个`
  } catch (error) {
    const errorText = error instanceof Error ? error.message : '刷新失败'
    message.value = `文本模型刷新失败：${errorText}`
  } finally {
    textRefreshing.value = false
  }
}

// NOTE: 刷新视觉模型列表并维护当前选中项。
async function refreshVisionModels(): Promise<void> {
  const safeBaseUrl = visionBaseUrl.value.trim()
  const safeApiKey = visionApiKey.value.trim()

  if (!safeBaseUrl || !safeApiKey) {
    message.value = '请先填写视觉模型 baseUrl 和 apiKey 再刷新'
    return
  }

  visionRefreshing.value = true
  message.value = ''

  try {
    const nextModelList = await requestModels(safeBaseUrl, safeApiKey)
    visionModelList.value = nextModelList

    if (!nextModelList.includes(visionSelectedModel.value)) {
      visionSelectedModel.value = nextModelList[0]
    }

    message.value = `视觉模型已刷新，共 ${nextModelList.length} 个`
  } catch (error) {
    const errorText = error instanceof Error ? error.message : '刷新失败'
    message.value = `视觉模型刷新失败：${errorText}`
  } finally {
    visionRefreshing.value = false
  }
}

let textRefreshTimer: number | null = null
let visionRefreshTimer: number | null = null

function scheduleTextAutoRefresh(): void {
  if (!textAutoRefreshModels.value) {
    return
  }

  if (textRefreshTimer) {
    window.clearTimeout(textRefreshTimer)
  }

  // NOTE: 自动刷新使用轻量防抖，避免连续输入触发过多请求。
  textRefreshTimer = window.setTimeout(() => {
    void refreshTextModels()
  }, 500)
}

function scheduleVisionAutoRefresh(): void {
  // NOTE: 开启”视觉复用文本配置”时无需刷新独立视觉模型列表。
  if (useTextConfigForVision.value || !visionAutoRefreshModels.value) {
    return
  }

  if (visionRefreshTimer) {
    window.clearTimeout(visionRefreshTimer)
  }

  // NOTE: 视觉模型自动刷新与文本模型保持一致，统一使用 500ms 防抖。
  visionRefreshTimer = window.setTimeout(() => {
    void refreshVisionModels()
  }, 500)
}

onMounted(async () => {
  const config = await getLlmConfig()
  textBaseUrl.value = config.textBaseUrl
  textApiKey.value = config.textApiKey
  textSelectedModel.value = config.textSelectedModel
  textModelList.value = config.textModelList
  textAutoRefreshModels.value = config.textAutoRefreshModels
  useTextConfigForVision.value = config.useTextConfigForVision
  visionBaseUrl.value = config.visionBaseUrl
  visionApiKey.value = config.visionApiKey
  visionSelectedModel.value = config.visionSelectedModel
  visionModelList.value = config.visionModelList
  visionAutoRefreshModels.value = config.visionAutoRefreshModels
  translationTriggerMode.value = config.translationTriggerMode
  textRequestTimeoutSeconds.value = Math.max(5, Math.round(config.textRequestTimeoutMs / 1000))
  customTranslationPrompt.value = config.customTranslationPrompt
  screenshotTranslateMode.value = config.screenshotTranslateMode
  screenshotEnableFallback.value = config.screenshotEnableFallback
<<<<<<< HEAD
  screenshotMaxImageSide.value = config.screenshotMaxImageSide
  screenshotImageQualityPercent.value = Math.round(config.screenshotImageQuality * 100)
})

watch([textBaseUrl, textApiKey], () => {
  scheduleTextAutoRefresh()
})

=======
  screenshotRequestTimeoutSeconds.value = Math.max(5, Math.round(config.screenshotRequestTimeoutMs / 1000))
  screenshotMaxImageSide.value = config.screenshotMaxImageSide
  screenshotImageQualityPercent.value = Math.round(config.screenshotImageQuality * 100)
  imageTranslateMode.value = config.imageTranslateMode
  imageEnableFallback.value = config.imageEnableFallback
  imageCustomPrompt.value = config.imageCustomPrompt
  imageRequestTimeoutSeconds.value = Math.max(5, Math.round(config.imageRequestTimeoutMs / 1000))
})

// NOTE: 切换配置分区时清空旧提示，避免不同分区的消息串行显示。
watch(activeSection, () => {
  message.value = ''
})

watch([textBaseUrl, textApiKey], () => {
  scheduleTextAutoRefresh()
})

>>>>>>> develop
watch([visionBaseUrl, visionApiKey], () => {
  scheduleVisionAutoRefresh()
})

// NOTE: 统一保存所有配置，保证不同功能模块的参数一致落库。
async function onSave(): Promise<void> {
  saving.value = true
  message.value = ''

  try {
    const currentConfig = await getLlmConfig()
<<<<<<< HEAD
    const safeSeconds = Math.max(5, Math.min(600, Math.round(Number(requestTimeoutSeconds.value) || 180)))
    const safeImageSide = Math.max(600, Math.min(4096, Math.round(Number(screenshotMaxImageSide.value) || 1800)))
    const safeImageQualityPercent = Math.max(40, Math.min(100, Math.round(Number(screenshotImageQualityPercent.value) || 85)))

    requestTimeoutSeconds.value = safeSeconds
=======
    const safeTextSeconds = Math.max(5, Math.min(600, Math.round(Number(textRequestTimeoutSeconds.value) || 180)))
    const safeScreenshotSeconds = Math.max(5, Math.min(600, Math.round(Number(screenshotRequestTimeoutSeconds.value) || 180)))
    const safeImageSeconds = Math.max(5, Math.min(600, Math.round(Number(imageRequestTimeoutSeconds.value) || 180)))
    const safeImageSide = Math.max(600, Math.min(4096, Math.round(Number(screenshotMaxImageSide.value) || 1800)))
    const safeImageQualityPercent = Math.max(40, Math.min(100, Math.round(Number(screenshotImageQualityPercent.value) || 85)))

    textRequestTimeoutSeconds.value = safeTextSeconds
    screenshotRequestTimeoutSeconds.value = safeScreenshotSeconds
    imageRequestTimeoutSeconds.value = safeImageSeconds
>>>>>>> develop
    screenshotMaxImageSide.value = safeImageSide
    screenshotImageQualityPercent.value = safeImageQualityPercent

    await saveLlmConfig({
      textBaseUrl: textBaseUrl.value,
      textApiKey: textApiKey.value,
      textSelectedModel: textSelectedModel.value,
      textModelList: textModelList.value,
      textAutoRefreshModels: textAutoRefreshModels.value,
      useTextConfigForVision: useTextConfigForVision.value,
      visionBaseUrl: visionBaseUrl.value,
      visionApiKey: visionApiKey.value,
      visionSelectedModel: visionSelectedModel.value,
      visionModelList: visionModelList.value,
      visionAutoRefreshModels: visionAutoRefreshModels.value,
      translationTriggerMode: translationTriggerMode.value,
      targetLanguage: currentConfig.targetLanguage,
      customTranslationPrompt: customTranslationPrompt.value,
<<<<<<< HEAD
      requestTimeoutMs: safeSeconds * 1000,
=======
      textRequestTimeoutMs: safeTextSeconds * 1000,
      screenshotRequestTimeoutMs: safeScreenshotSeconds * 1000,
      imageRequestTimeoutMs: safeImageSeconds * 1000,
>>>>>>> develop
      screenshotTranslateMode: screenshotTranslateMode.value,
      screenshotEnableFallback: screenshotEnableFallback.value,
      screenshotMaxImageSide: safeImageSide,
      screenshotImageQuality: safeImageQualityPercent / 100,
<<<<<<< HEAD
=======
      imageTranslateMode: imageTranslateMode.value,
      imageEnableFallback: imageEnableFallback.value,
      imageCustomPrompt: imageCustomPrompt.value,
>>>>>>> develop
    })

    message.value = '配置已保存'
  } catch (error) {
    const errorText = error instanceof Error ? error.message : '保存失败'
    message.value = `保存失败：${errorText}`
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="settings-page">
    <aside class="sidebar">
      <div class="brand">
        <h1>Mikamth Translate设置中心</h1>
        <p>配置面板</p>
      </div>

      <nav class="nav-list">
        <button
          v-for="section in sections"
          :key="section.key"
          class="nav-item"
          :class="{ active: activeSection === section.key }"
          @click="activeSection = section.key"
        >
          <span class="title">{{ section.title }}</span>
          <span class="desc">{{ section.desc }}</span>
        </button>
      </nav>
    </aside>

    <section class="content-area">
      <header class="content-head">
        <h2>{{ activeSectionMeta?.title }}</h2>
        <p>{{ activeSectionMeta?.desc }}</p>
      </header>

      <div class="panel">
        <template v-if="activeSection === 'model'">
          <div class="subsection">
            <h3>文本模型配置</h3>

            <label class="field">
              <span>文本模型 Base URL</span>
              <input v-model="textBaseUrl" type="text" placeholder="例如：https://api.openai.com/v1" />
            </label>

            <label class="field">
              <span>文本模型 API Key</span>
              <input v-model="textApiKey" type="password" placeholder="请输入文本模型 api-key" />
            </label>

            <div class="row">
              <label class="checkbox">
                <input v-model="textAutoRefreshModels" type="checkbox" />
                <span>文本模型自动刷新</span>
              </label>

              <button class="small" :disabled="textRefreshing" @click="refreshTextModels">
                {{ textRefreshing ? '刷新中...' : '刷新文本模型' }}
              </button>
            </div>

            <label class="field">
              <span>文本翻译模型</span>
              <select v-model="textSelectedModel">
                <option value="" disabled>请先刷新文本模型列表</option>
                <option v-for="model in textModelList" :key="model" :value="model">{{ model }}</option>
              </select>
            </label>
          </div>

          <div class="subsection">
            <h3>视觉模型配置</h3>

            <label class="checkbox">
              <input v-model="useTextConfigForVision" type="checkbox" />
              <span>视觉模型配置与文本模型一致（Base URL / API Key / 模型）</span>
            </label>

            <template v-if="!useTextConfigForVision">
              <label class="field">
                <span>视觉模型 Base URL</span>
                <input v-model="visionBaseUrl" type="text" placeholder="例如：https://api.openai.com/v1" />
              </label>

              <label class="field">
                <span>视觉模型 API Key</span>
                <input v-model="visionApiKey" type="password" placeholder="请输入视觉模型 api-key" />
              </label>

              <div class="row">
                <label class="checkbox">
                  <input v-model="visionAutoRefreshModels" type="checkbox" />
                  <span>视觉模型自动刷新</span>
                </label>
                <button class="small" :disabled="visionRefreshing" @click="refreshVisionModels">
                  {{ visionRefreshing ? '刷新中...' : '刷新视觉模型' }}
                </button>
              </div>

              <label class="field">
                <span>截图视觉模型</span>
                <select v-model="visionSelectedModel">
                  <option value="" disabled>请先刷新视觉模型列表</option>
                  <option v-for="model in visionModelList" :key="model" :value="model">{{ model }}</option>
                </select>
              </label>
            </template>

            <p v-else class="hint">当前视觉翻译将直接复用文本模型配置。</p>
          </div>
        </template>

        <template v-else-if="activeSection === 'behavior'">
          <div class="field-group">
            <span class="label">划词翻译方式</span>
            <label class="radio-item">
              <input v-model="translationTriggerMode" type="radio" value="context_menu" />
              <span>右键菜单翻译（默认）</span>
            </label>
            <label class="radio-item">
              <input v-model="translationTriggerMode" type="radio" value="auto_selection" />
              <span>自动划词翻译（鼠标抬起触发）</span>
            </label>
          </div>

          <label class="field">
            <span>文本翻译超时（秒）</span>
            <input v-model.number="textRequestTimeoutSeconds" type="number" min="5" max="600" />
          </label>

          <label class="field">
            <span>翻译 Prompt（留空则使用默认 Prompt）</span>
            <textarea
              v-model="customTranslationPrompt"
              rows="5"
              placeholder="可按需填写自定义 prompt；留空时自动使用默认 prompt。"
            />
          </label>

          <p class="hint">超时范围：5~600 秒，默认 180 秒（3 分钟）。</p>
          <p class="hint">默认 Prompt：{{ DEFAULT_TRANSLATION_PROMPT }}</p>
          <p class="hint warning">请谨慎设置 prompt，防止输出的内容错误。</p>
        </template>

        <template v-else-if="activeSection === 'screenshot'">
          <label class="checkbox screenshot-fallback">
            <input v-model="screenshotEnableFallback" type="checkbox" />
            <span>失败自动降级（vision -> ocr_local）</span>
          </label>

          <div class="field-group">
            <span class="label">截图翻译模式</span>
            <label class="radio-item">
              <input v-model="screenshotTranslateMode" type="radio" value="vision_direct" />
              <span>视觉模型直译（推荐）</span>
            </label>
            <label class="radio-item">
              <input v-model="screenshotTranslateMode" type="radio" value="ocr_local" />
              <span>本地 OCR 识别后走文本翻译</span>
            </label>
          </div>

          <template v-if="screenshotTranslateMode === 'vision_direct'">
            <p class="hint">视觉模型参数在“模型服务 -> 视觉模型配置”中维护。</p>
          </template>

          <div class="subsection compact">
            <h3>通用截图参数</h3>

            <div class="row">
              <label class="field field-inline">
                <span>压缩最长边（像素）</span>
                <input v-model.number="screenshotMaxImageSide" type="number" min="600" max="4096" />
              </label>

              <label class="field field-inline">
                <span>图片质量（百分比）</span>
                <input v-model.number="screenshotImageQualityPercent" type="number" min="40" max="100" />
              </label>
            </div>
<<<<<<< HEAD
=======

            <label class="field">
              <span>截图翻译超时（秒）</span>
              <input v-model.number="screenshotRequestTimeoutSeconds" type="number" min="5" max="600" />
            </label>
>>>>>>> develop
          </div>

          <p class="hint">
            LLM 视觉能力识别实现位置：`src/background/llm-client.ts` 的 `isVisionUnsupportedError`。
          </p>
<<<<<<< HEAD
=======
          <p class="hint">超时范围：5~600 秒，默认 180 秒（3 分钟）。</p>
        </template>

        <template v-else-if="activeSection === 'image'">
          <label class="checkbox screenshot-fallback">
            <input v-model="imageEnableFallback" type="checkbox" />
            <span>失败自动降级（vision -> ocr_local）</span>
          </label>

          <div class="field-group">
            <span class="label">图片翻译模式</span>
            <p class="hint">推荐使用视觉模型直译，方便更好的理解翻译上下文</p>
            <label class="radio-item">
              <input v-model="imageTranslateMode" type="radio" value="vision_direct" />
              <span>视觉模型直译（推荐）</span>
            </label>
            <label class="radio-item">
              <input v-model="imageTranslateMode" type="radio" value="ocr_local" />
              <span>本地 OCR 识别后走文本翻译</span>
            </label>
          </div>

          <template v-if="imageTranslateMode === 'vision_direct'">
            <p class="hint">视觉模型参数在"模型服务 -> 视觉模型配置"中维护。</p>
            <br>
            <label class="field">
              <span>图片翻译 Prompt（留空则使用默认 Prompt）</span>
              <textarea
                v-model="imageCustomPrompt"
                rows="5"
                placeholder="可按需填写自定义 prompt；留空时自动使用默认 prompt。"
              />
            </label>
            <br>
            <p class="hint">默认 Prompt：{{ DEFAULT_PAGE_IMAGE_PROMPT }}</p>
          </template>

          <template v-else>
            <p class="hint">本地 OCR 识别后走文本翻译，翻译 Prompt 在"翻译功能"中设置。</p>
          </template>

          <label class="field">
            <span>图片翻译超时（秒）</span>
            <input v-model.number="imageRequestTimeoutSeconds" type="number" min="5" max="600" />
          </label>

          <p class="hint">超时范围：5~600 秒，默认 180 秒（3 分钟）。</p>
>>>>>>> develop
        </template>

        <div class="actions">
          <button :disabled="saving" @click="onSave">
            {{ saving ? '保存中...' : '保存当前配置' }}
          </button>
        </div>

        <p v-if="message" class="message">{{ message }}</p>
      </div>

      <footer class="page-footer">
        Mikamth Translate V0.3 Beta Version / Version Update time: 2026.4.30 / Newest Version: V0.3 Beta Version
      </footer>
    </section>
  </main>
</template>
