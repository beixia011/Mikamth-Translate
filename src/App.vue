<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getLlmConfig, saveLlmConfig, type TranslationTargetLanguage } from './shared/config'

// 中文注释：以模块化卡片组织 popup 页面，便于后续继续扩展新功能。
const featureCards = [
  {
    key: 'translate-method',
    title: '划词翻译方式',
    desc: '用于控制网页划词后何时触发翻译。',
  },
  {
    key: 'target-language',
    title: '目标语言',
    desc: '设置译文输出语言，仅通过追加短提示词控制目标语言。',
  },
]

const translationTriggerMode = ref<'context_menu' | 'auto_selection'>('context_menu')
const targetLanguage = ref<TranslationTargetLanguage>('chinese')
const saving = ref(false)
const message = ref('')

const targetLanguageOptions: Array<{ value: TranslationTargetLanguage; label: string }> = [
  { value: 'chinese', label: '简体中文（默认）' },
  { value: 'english', label: '英语' },
  { value: 'japanese', label: '日语' },
  { value: 'korean', label: '韩语' },
  { value: 'french', label: '法语' },
  { value: 'german', label: '德语' },
  { value: 'spanish', label: '西班牙语' },
]

const triggerModeLabel = computed(() => {
  if (translationTriggerMode.value === 'auto_selection') {
    return '当前模式：自动划词翻译'
  }

  return '当前模式：右键菜单翻译（默认）'
})

const targetLanguageLabelMap: Record<TranslationTargetLanguage, string> = {
  chinese: '简体中文',
  english: '英语',
  japanese: '日语',
  korean: '韩语',
  french: '法语',
  german: '德语',
  spanish: '西班牙语',
}

const targetLanguageLabel = computed(() => `当前目标语言：${targetLanguageLabelMap[targetLanguage.value]}`)

onMounted(async () => {
  const config = await getLlmConfig()
  translationTriggerMode.value = config.translationTriggerMode
  targetLanguage.value = config.targetLanguage
})

// 中文注释：仅更新触发模式字段，避免覆盖其他配置项。
async function saveTriggerMode(): Promise<void> {
  saving.value = true
  message.value = ''

  try {
    const config = await getLlmConfig()

    await saveLlmConfig({
      ...config,
      translationTriggerMode: translationTriggerMode.value,
    })

    message.value = '划词翻译方式已保存'
  } catch (error) {
    const errorText = error instanceof Error ? error.message : '保存失败'
    message.value = `保存失败：${errorText}`
  } finally {
    saving.value = false
  }
}

// 中文注释：仅更新目标语言字段，翻译时会在基础 prompt 后追加对应短提示词。
async function saveTargetLanguage(): Promise<void> {
  saving.value = true
  message.value = ''

  try {
    const config = await getLlmConfig()

    await saveLlmConfig({
      ...config,
      targetLanguage: targetLanguage.value,
    })

    message.value = '目标语言已保存'
  } catch (error) {
    const errorText = error instanceof Error ? error.message : '保存失败'
    message.value = `保存失败：${errorText}`
  } finally {
    saving.value = false
  }
}

// 中文注释：在 popup 页面提供“打开配置”的快捷入口。
function openOptions(): void {
  const chromeApi = (globalThis as any).chrome

  if (chromeApi?.runtime?.openOptionsPage) {
    chromeApi.runtime.openOptionsPage()
  }
}
</script>

<template>
  <main class="popup">
    <header class="header">
      <div class="header-top">
        <h1>翻译功能中心</h1>
        <button class="settings-icon-btn" type="button" aria-label="打开配置页面" title="打开配置页面" @click="openOptions">
          <span aria-hidden="true">&#9881;</span>
        </button>
      </div>
      <p>统一管理翻译触发方式与功能入口，后续可持续扩展更多模块。</p>
    </header>

    <section class="feature-list">
      <article v-for="card in featureCards" :key="card.key" class="card">
        <h2>{{ card.title }}</h2>
        <p>{{ card.desc }}</p>

        <template v-if="card.key === 'translate-method'">
          <label class="radio-item">
            <input v-model="translationTriggerMode" type="radio" value="context_menu" />
            <span>右键菜单翻译（默认）</span>
          </label>
          <label class="radio-item">
            <input v-model="translationTriggerMode" type="radio" value="auto_selection" />
            <span>自动划词翻译（鼠标抬起触发）</span>
          </label>

          <button :disabled="saving" @click="saveTriggerMode">
            {{ saving ? '保存中...' : '保存划词方式' }}
          </button>
          <p class="status">{{ triggerModeLabel }}</p>
        </template>

        <template v-if="card.key === 'target-language'">
          <label class="field">
            <span>译文输出语言</span>
            <select v-model="targetLanguage">
              <option v-for="item in targetLanguageOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>

          <button :disabled="saving" @click="saveTargetLanguage">
            {{ saving ? '保存中...' : '保存目标语言' }}
          </button>
          <p class="status">{{ targetLanguageLabel }}</p>
        </template>
      </article>
    </section>

    <p v-if="message" class="message">{{ message }}</p>
  </main>
</template>
