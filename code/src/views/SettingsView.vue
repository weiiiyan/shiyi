<template>
  <div class="settings-view">
    <h2>设置</h2>

    <!-- AI 模型设置 -->
    <section class="settings-section">
      <h3>🤖 AI 模型配置</h3>

      <div class="form-group">
        <label>AI 服务商</label>
        <select v-model="config.provider">
          <option value="openai">OpenAI</option>
          <option value="qwen">千问 (Qwen)</option>
          <option value="doubao">豆包 (Doubao)</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      <div class="form-group" v-if="config.provider === 'custom'">
        <label>API Base URL</label>
        <input v-model="config.baseURL" placeholder="https://api.openai.com/v1" />
      </div>

      <div class="form-group">
        <label>API Key</label>
        <input v-model="config.apiKey" type="password" placeholder="sk-..." />
      </div>

      <div class="form-group">
        <label>模型名称</label>
        <input v-model="config.model" placeholder="gpt-4o-mini" list="model-list" />
        <datalist id="model-list">
          <option v-for="m in modelOptions" :key="m" :value="m" />
        </datalist>
      </div>

      <button class="btn-primary" @click="testConnection" :disabled="testing">
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
      <div v-if="testResult !== null" class="test-result" :class="{ ok: testResult.ok }">
        {{ testResult.ok ? '✅ 连接成功：' + testResult.message : '❌ 连接失败：' + testResult.message }}
      </div>
    </section>

    <!-- Anki-Connect 设置 -->
    <section class="settings-section">
      <h3>📋 Anki-Connect 设置</h3>
      <div class="form-group">
        <label>Anki-Connect URL</label>
        <input v-model="ankiUrl" placeholder="http://localhost:8765" disabled />
        <span class="hint">默认使用本地 Anki-Connect</span>
      </div>
      <button class="btn-secondary" @click="checkAnki">检测 Anki 连接</button>
      <div v-if="ankiStatus !== null" class="test-result" :class="{ ok: ankiStatus }">
        {{ ankiStatus ? '✅ Anki-Connect 已连接' : '❌ 无法连接到 Anki-Connect' }}
      </div>
    </section>

    <div class="save-bar">
      <button class="btn-primary" @click="saveSettings">保存设置</button>
      <span v-if="saved" class="saved-hint">✅ 已保存</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'

const MODEL_PRESETS = {
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-omni-turbo', 'qwen-vl-plus', 'qwen-vl-max'],
  doubao: ['doubao-1.5-pro-256k', 'doubao-1.5-lite-32k'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  custom: [],
}

const config = reactive({
  provider: 'openai',
  apiKey: '',
  baseURL: '',
  model: 'gpt-4o-mini',
})

const ankiUrl = ref('http://localhost:8765')
const testing = ref(false)
const testResult = ref(null)
const ankiStatus = ref(null)
const saved = ref(false)

const modelOptions = computed(() => MODEL_PRESETS[config.provider] || [])

function loadConfig() {
  try {
    const saved = localStorage.getItem('maimemo_ai_config')
    if (saved) Object.assign(config, JSON.parse(saved))
  } catch {}
}

async function testConnection() {
  // 自动保存，避免忘点保存导致配置丢失
  saveToStorage()
  testing.value = true
  testResult.value = null
  try {
    const res = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: config.provider,
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
      }),
    })
    const data = await res.json()
    testResult.value = { ok: data.ok, message: data.message }
  } catch (err) {
    testResult.value = { ok: false, message: err.message }
  } finally {
    testing.value = false
  }
}

async function checkAnki() {
  const res = await fetch('/api/decks/status')
  const data = await res.json()
  ankiStatus.value = data.available
}

function saveToStorage() {
  localStorage.setItem('maimemo_ai_config', JSON.stringify({
    provider: config.provider,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    model: config.model,
  }))
}

function saveSettings() {
  saveToStorage()
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

// 任意配置变更自动保存
watch(config, () => saveToStorage(), { deep: true })

onMounted(() => {
  loadConfig()
  if (!config.model) {
    config.model = 'gpt-4o-mini'
  }
})
</script>
