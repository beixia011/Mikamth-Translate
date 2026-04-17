<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DEFAULT_TRANSLATION_PROMPT, getLlmConfig, saveLlmConfig } from '../shared/config'

// 中文注释：定义配置页导航模块，后续新增功能仅需补充此数组和对应内容区块。
const sections = [
  { key: 'model', title: '模型服务', desc: '配置翻译基本模型' },
  { key: 'behavior', title: '翻译功能', desc: '配置基础翻译功能。' },
] as const

type SectionKey = (typeof sections)[number]['key']

const activeSection = ref<SectionKey>('model')

// 中文注释：表单字段绑定状态。
const baseUrl = ref('')
const apiKey = ref('')
const selectedModel = ref('')
const modelList = ref<string[]>([])
const autoRefreshModels = ref(false)
const translationTriggerMode = ref<'context_menu' | 'auto_selection'>('context_menu')
const requestTimeoutSeconds = ref(180)
// 中文注释：自定义翻译 prompt，留空时后台会回退到默认 prompt。
const customTranslationPrompt = ref('')

// 中文注释：页面提示信息，用于展示刷新/保存结果。
const message = ref('')
const saving = ref(false)
const refreshing = ref(false)

const activeSectionMeta = computed(() => sections.find((item) => item.key === activeSection.value))

function buildModelsUrl(inputBaseUrl: string): string {
  const trimmedBaseUrl = inputBaseUrl.trim().replace(/\/+$/, '')

  if (trimmedBaseUrl.endsWith('/models')) {
    return trimmedBaseUrl
  }

  return `${trimmedBaseUrl}/models`
}

// 中文注释：从模型接口拉取模型列表，并同步维护当前选中模型。
async function refreshModels(): Promise<void> {
  const safeBaseUrl = baseUrl.value.trim()
  const safeApiKey = apiKey.value.trim()

  if (!safeBaseUrl || !safeApiKey) {
    message.value = '请先填写 baseUrl 和 apiKey 再刷新模型'
    return
  }

  refreshing.value = true
  message.value = ''

  try {
    const response = await fetch(buildModelsUrl(safeBaseUrl), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${safeApiKey}`,
      },
    })

    if (!response.ok) {
      const responseText = await response.text()
      throw new Error(`获取模型失败：${response.status} ${responseText}`)
    }

    const data = await response.json()
    const nextModelList = Array.isArray(data?.data)
      ? data.data
          .map((item: any) => String(item?.id ?? '').trim())
          .filter((item: string) => item.length > 0)
      : []

    if (nextModelList.length === 0) {
      throw new Error('未获取到模型，请检查 baseUrl 是否兼容 /models 协议')
    }

    modelList.value = nextModelList

    if (!nextModelList.includes(selectedModel.value)) {
      selectedModel.value = nextModelList[0]
    }

    message.value = `模型已刷新，共 ${nextModelList.length} 个`
  } catch (error) {
    const errorText = error instanceof Error ? error.message : '刷新失败'
    message.value = `刷新失败：${errorText}`
  } finally {
    refreshing.value = false
  }
}

let refreshTimer: number | null = null

function scheduleAutoRefresh(): void {
  if (!autoRefreshModels.value) {
    return
  }

  if (refreshTimer) {
    window.clearTimeout(refreshTimer)
  }

  // 中文注释：自动刷新使用轻量防抖，避免连续输入触发过多请求。
  refreshTimer = window.setTimeout(() => {
    void refreshModels()
  }, 500)
}

onMounted(async () => {
  const config = await getLlmConfig()
  baseUrl.value = config.baseUrl
  apiKey.value = config.apiKey
  selectedModel.value = config.selectedModel
  modelList.value = config.modelList
  autoRefreshModels.value = config.autoRefreshModels
  translationTriggerMode.value = config.translationTriggerMode
  requestTimeoutSeconds.value = Math.max(5, Math.round(config.requestTimeoutMs / 1000))
  customTranslationPrompt.value = config.customTranslationPrompt
})

watch([baseUrl, apiKey], () => {
  scheduleAutoRefresh()
})

// 中文注释：统一保存所有配置，保证不同功能模块的参数一致落库。
async function onSave(): Promise<void> {
  saving.value = true
  message.value = ''

  try {
    const safeSeconds = Math.max(5, Math.min(600, Math.round(Number(requestTimeoutSeconds.value) || 180)))

    requestTimeoutSeconds.value = safeSeconds

    const currentConfig = await getLlmConfig()

    await saveLlmConfig({
      ...currentConfig,
      baseUrl: baseUrl.value,
      apiKey: apiKey.value,
      selectedModel: selectedModel.value,
      modelList: modelList.value,
      autoRefreshModels: autoRefreshModels.value,
      translationTriggerMode: translationTriggerMode.value,
      customTranslationPrompt: customTranslationPrompt.value,
      requestTimeoutMs: safeSeconds * 1000,
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
          <label class="field">
            <span>Base URL</span>
            <input v-model="baseUrl" type="text" placeholder="例如：https://api.openai.com/v1" />
          </label>

          <label class="field">
            <span>API Key</span>
            <input v-model="apiKey" type="password" placeholder="请输入 api-key" />
          </label>

          <div class="row">
            <label class="checkbox">
              <input v-model="autoRefreshModels" type="checkbox" />
              <span>自动刷新模型</span>
            </label>

            <button class="small" :disabled="refreshing" @click="refreshModels">
              {{ refreshing ? '刷新中...' : '刷新模型' }}
            </button>
          </div>

          <label class="field">
            <span>翻译模型</span>
            <select v-model="selectedModel">
              <option value="" disabled>请先刷新模型列表</option>
              <option v-for="model in modelList" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>
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
            <span>请求超时（秒）</span>
            <input v-model.number="requestTimeoutSeconds" type="number" min="5" max="600" />
          </label>

          <label class="field">
            <span>翻译 Prompt（留空则使用默认 Prompt）</span>
            <textarea
              v-model="customTranslationPrompt"
              rows="5"
              placeholder="可按需填写自定义 prompt；留空时自动使用默认 prompt。"
            />
          </label>

          <p class="hint">当前范围：5~600 秒，默认 180 秒（3 分钟）。</p>
          <p class="hint">默认 Prompt：{{ DEFAULT_TRANSLATION_PROMPT }}</p>
          <p class="hint warning">请谨慎设置 prompt，防止输出的内容错误。</p>
        </template>

        <div class="actions">
          <button :disabled="saving" @click="onSave">
            {{ saving ? '保存中...' : '保存当前配置' }}
          </button>
        </div>

        <p v-if="message" class="message">{{ message }}</p>
      </div>

      <footer class="page-footer">
        Footer 占位文本：`[custom-footer-text-placeholder]`（后续可替换为版本信息、帮助链接、同步状态等）。
      </footer>
    </section>
  </main>
</template>
