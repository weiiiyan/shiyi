<template>
  <div class="settings-view">
    <h2>设置</h2>

    <!-- AI 模型设置 -->
    <section class="settings-section">
      <h3>🤖 AI 模型配置</h3>

      <div class="form-group">
        <label for="ai-provider">AI 服务商</label>
        <select id="ai-provider" v-model="config.provider" name="ai-provider">
          <option value="openai">OpenAI</option>
          <option value="qwen">千问 (Qwen)</option>
          <option value="doubao">豆包 (Doubao)</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      <div class="form-group" v-if="config.provider === 'custom'">
        <label for="api-base-url">API Base URL</label>
        <input id="api-base-url" v-model="config.baseURL" type="url" inputmode="url" name="api-base-url" autocomplete="url" placeholder="https://api.openai.com/v1…" />
      </div>

      <div class="form-group">
        <label for="api-key">API Key</label>
        <input id="api-key" v-model="config.apiKey" type="password" name="api-key" autocomplete="current-password" spellcheck="false" placeholder="sk-…" />
      </div>

      <div class="form-group">
        <label for="model-name">模型名称</label>
        <input id="model-name" v-model="config.model" name="model-name" autocomplete="off" placeholder="gpt-4o-mini…" list="model-list" />
        <datalist id="model-list">
          <option v-for="m in modelOptions" :key="m" :value="m" />
        </datalist>
      </div>

      <button class="btn-primary" @click="testConnection" :disabled="testing">
        {{ testing ? '测试中…' : '测试连接' }}
      </button>
      <div v-if="testResult !== null" class="test-result" :class="{ ok: testResult.ok }" aria-live="polite">
        {{ testResult.ok ? '✅ 连接成功：' + testResult.message : '❌ 连接失败：' + testResult.message + '。请检查 API Key 是否正确，或切换服务商后重试。' }}
      </div>
    </section>

    <!-- Anki-Connect 设置 -->
    <section class="settings-section">
      <h3>📋 Anki-Connect 设置</h3>
      <div class="form-group">
        <label for="anki-url">Anki-Connect URL</label>
        <input id="anki-url" v-model="ankiUrl" type="url" name="anki-url" autocomplete="url" placeholder="http://localhost:8765" disabled />
        <span class="hint">默认使用本地 Anki-Connect</span>
      </div>
      <button class="btn-secondary" @click="checkAnki">检测 Anki 连接</button>
      <div v-if="ankiStatus !== null" class="test-result" :class="{ ok: ankiStatus }" aria-live="polite">
        {{ ankiStatus ? '✅ Anki-Connect 已连接' : '❌ 无法连接到 Anki-Connect。请确认 Anki 已启动且 Anki-Connect 插件已安装并运行。' }}
      </div>
    </section>

    <!-- 英语水平设置 -->
    <section class="settings-section">
      <h3>📊 英语水平设置</h3>
      <p class="section-desc">为读、写、听、说四个维度分别设置英语水平，AI 将据此调整学习内容的词汇难度、句子复杂度和评判标准。</p>

      <div class="proficiency-skills">
        <div class="skill-row" v-for="skill in SKILLS" :key="skill.key">
          <span class="skill-icon">{{ skill.icon }}</span>
          <span class="skill-label">{{ skill.label }}</span>
          <select
            class="skill-level-select"
            :value="proficiency.selected[skill.key]"
            @change="selectLevel(skill.key, $event.target.value)"
          >
            <option v-for="lvl in proficiency.levels" :key="lvl.id" :value="lvl.id">
              {{ lvl.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- 水平等级管理 -->
      <div class="levels-header">
        <h4>水平等级管理</h4>
        <span class="hint">点击展开可编辑每个等级对应的 AI 提示词</span>
      </div>

      <div class="levels-list">
        <div
          v-for="(lvl, idx) in proficiency.levels"
          :key="lvl.id"
          class="level-card"
          :class="{ expanded: expandedLevel === lvl.id }"
        >
          <button class="level-card-header" @click="toggleLevel(lvl.id)" :aria-expanded="expandedLevel === lvl.id ? 'true' : 'false'">
            <span class="level-name">{{ lvl.label }}</span>
            <span v-if="lvl.isBuiltin" class="badge-builtin">内置</span>
            <span v-else class="badge-custom">自定义</span>
            <span
              v-if="!lvl.isBuiltin && confirmDeleteId !== lvl.id"
              class="btn-delete-level"
              role="button"
              tabindex="0"
              :aria-label="'删除等级：' + lvl.label"
              @click.stop="confirmDeleteId = lvl.id"
              @keydown.enter.stop="confirmDeleteId = lvl.id"
              @keydown.space.stop.prevent="confirmDeleteId = lvl.id"
            >🗑️</span>
            <span class="expand-icon">{{ expandedLevel === lvl.id ? '▾' : '▸' }}</span>
          </button>

          <!-- 删除确认 -->
          <div v-if="confirmDeleteId === lvl.id" class="delete-confirm-bar">
            <span>确定删除「{{ lvl.label }}」？此操作不可撤销。</span>
            <button class="btn-danger-sm" @click.stop="executeDelete(lvl.id)">确认删除</button>
            <button class="btn-cancel-sm" @click.stop="confirmDeleteId = null">取消</button>
          </div>

          <div v-if="expandedLevel === lvl.id" class="level-card-body">
            <div class="form-group">
              <label :for="'level-name-' + lvl.id">等级名称</label>
              <input :id="'level-name-' + lvl.id" v-model="lvl.label" :name="'level-name-' + lvl.id" @input="autoSaveProficiency" />
            </div>
            <div class="form-group" v-for="skill in SKILLS" :key="skill.key">
              <label :for="'prompt-' + lvl.id + '-' + skill.key">{{ skill.icon }} {{ skill.label }}提示词</label>
              <textarea
                :id="'prompt-' + lvl.id + '-' + skill.key"
                v-model="lvl.prompts[skill.key]"
                :name="'prompt-' + lvl.id + '-' + skill.key"
                @input="autoSaveProficiency"
                rows="3"
                :placeholder="`描述学生在${skill.label}方面的英语水平…`"
              ></textarea>
            </div>
            <button
              v-if="lvl.isBuiltin"
              class="btn-secondary btn-sm"
              @click="resetLevelToDefault(lvl.id)"
            >重置为默认</button>
          </div>
        </div>
      </div>

      <button class="btn-secondary" @click="addCustomLevel">+ 新增自定义等级</button>
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
    const saved = localStorage.getItem('ShiYi_ai_config')
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
  localStorage.setItem('ShiYi_ai_config', JSON.stringify({
    provider: config.provider,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    model: config.model,
  }))
}

function saveSettings() {
  saveToStorage()
  saveProficiencyToStorage()
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

// ==================== 英语水平配置 ====================

const SKILLS = [
  { key: 'read', label: '读', icon: '📖' },
  { key: 'write', label: '写', icon: '✍️' },
  { key: 'listen', label: '听', icon: '🎧' },
  { key: 'speak', label: '说', icon: '🗣️' },
]

const PROFICIENCY_STORAGE_KEY = 'ShiYi_proficiency_config'

// 默认内置等级（与后端 proficiencyService.js 保持一致）
const DEFAULT_LEVELS = [
  {
    id: 'beginner',
    label: 'Beginner 初学',
    isBuiltin: true,
    prompts: {
      read: 'The student is a BEGINNER reader (CEFR A1). Their English vocabulary is limited to the most basic 300-500 words. Use ONLY very simple, short words (1-2 syllables). Write sentences with 3-5 words each. Avoid all idioms, phrasal verbs, and complex grammar. The scenario topic should be concrete and visual (colors, numbers, family, food, daily objects).',
      write: 'The student is a BEGINNER writer (CEFR A1). They can only produce very short phrases and simple sentences. The writing task should require just 2-4 words as a response. Use ONLY the most basic vocabulary (top 300 words). Accept spelling errors and grammatical mistakes — focus on whether they conveyed the basic idea.',
      listen: 'The student is a BEGINNER listener (CEFR A1). Speak VERY slowly and clearly in the audioText. Use only basic vocabulary (top 300 words). The audioText should be ONE very short sentence (4-6 words). The comprehension question should be answerable with yes/no or a single word. Avoid any background noise or complex context.',
      speak: 'The student is a BEGINNER speaker (CEFR A1). They can produce single words and formulaic phrases. The speaking task should require just 1-3 words as a spoken response. Accept heavy accent and pronunciation errors — focus on whether they tried to communicate. Model the expected response in the scenario so they can imitate it.',
    },
  },
  {
    id: 'elementary',
    label: 'Elementary 基础',
    isBuiltin: true,
    prompts: {
      read: 'The student is an ELEMENTARY reader (CEFR A2). Their vocabulary covers about 1000-1500 common words. Use simple sentences with basic connectors (and, but, because). Keep paragraphs to 2-3 short sentences. The topic can involve simple everyday situations (shopping, weather, hobbies, daily routines). Avoid abstract concepts.',
      write: 'The student is an ELEMENTARY writer (CEFR A2). They can write short, simple sentences about familiar topics. The writing task should require a short phrase or single sentence (5-10 words). Use common everyday vocabulary. Accept grammar errors as long as the meaning is understandable.',
      listen: 'The student is an ELEMENTARY listener (CEFR A2). Speak clearly at a slower-than-normal pace. The audioText should be 1-2 short sentences using common vocabulary. Topics should be concrete and familiar (daily routines, personal information, shopping). The comprehension question should be straightforward.',
      speak: 'The student is an ELEMENTARY speaker (CEFR A2). They can produce short phrases and simple sentences about familiar topics. The speaking task should require a short spoken response (a phrase or simple sentence). Accept pronunciation errors and hesitation — encourage communication over accuracy.',
    },
  },
  {
    id: 'intermediate',
    label: 'Intermediate 中级',
    isBuiltin: true,
    prompts: {
      read: 'The student is an INTERMEDIATE reader (CEFR B1). Their vocabulary covers about 2000-3000 words. Use natural conversational English with moderate sentence complexity. You may use some phrasal verbs and common idioms (explain through context). Topics can include work, travel, opinions, and current events. Occasional unfamiliar words are fine if context makes them clear.',
      write: 'The student is an INTERMEDIATE writer (CEFR B1). They can write connected text on familiar topics. The writing task should require 1-2 complete sentences expressing a thought or opinion. Use everyday vocabulary with occasional slightly advanced words. Expect mostly correct basic grammar — some errors in complex structures are normal.',
      listen: 'The student is an INTERMEDIATE listener (CEFR B1). Speak at a natural conversational pace. The audioText can be 2-3 sentences with moderate complexity. Include some connected speech (linking, weak forms). Topics can include opinions, plans, experiences, and simple narratives.',
      speak: 'The student is an INTERMEDIATE speaker (CEFR B1). They can handle most everyday speaking situations with reasonable fluency. The speaking task should require 1-2 complete spoken sentences. Expect some pauses and self-correction. Focus on whether the message was communicated, not on accent.',
    },
  },
  {
    id: 'upper-intermediate',
    label: 'Upper Intermediate 中高级',
    isBuiltin: true,
    prompts: {
      read: 'The student is an UPPER-INTERMEDIATE reader (CEFR B2). Their vocabulary covers 4000+ words including some less common terms. Use natural, varied English with complex sentence structures. You may use idioms, phrasal verbs, and nuanced expressions freely. Topics can be abstract or specialized (technology, culture, science, society). Expect them to infer meaning from context.',
      write: 'The student is an UPPER-INTERMEDIATE writer (CEFR B2). They can write clear, detailed text on a wide range of topics. The writing task should require 2-3 well-formed sentences expressing nuanced ideas. Use varied vocabulary including some less common words. Expect mostly correct grammar and appropriate register.',
      listen: 'The student is an UPPER-INTERMEDIATE listener (CEFR B2). Speak at a natural, sometimes fast pace. The audioText can be 3-4 sentences with varied structures and vocabulary. Use connected speech naturally. Topics can include abstract ideas, detailed explanations, and subtle opinions.',
      speak: 'The student is an UPPER-INTERMEDIATE speaker (CEFR B2). They can speak fluently and spontaneously on most topics. The speaking task should require 2-3 natural spoken sentences. Expect relatively fluent delivery with occasional hesitation on complex structures. Push for natural expression.',
    },
  },
  {
    id: 'advanced',
    label: 'Advanced 高级',
    isBuiltin: true,
    prompts: {
      read: 'The student is an ADVANCED reader (CEFR C1/C2). Their vocabulary is broad and includes specialized and academic terms. Use fully natural English — the same level you would use with a native speaker. Include cultural references, wordplay, nuanced arguments, and sophisticated rhetorical devices. Challenge them with abstract, technical, or literary content.',
      write: 'The student is an ADVANCED writer (CEFR C1/C2). They can write with near-native precision, style, and nuance. The writing task should require sophisticated expression — nuanced opinions, formal register, or creative writing. Use advanced vocabulary and expect appropriate collocations and register. Push for stylistic refinement.',
      listen: 'The student is an ADVANCED listener (CEFR C1/C2). Speak at a fully natural native speed. The audioText can be longer and cover any topic including specialized, abstract, or fast-paced discussions. Use natural features: contractions, reductions, assimilation, different accents/registers. No simplification needed.',
      speak: 'The student is an ADVANCED speaker (CEFR C1/C2). They can express themselves fluently and precisely on any topic. The speaking task should require extended, well-structured spoken responses. Push for precision, appropriate register, and natural expression. Challenge nuanced pronunciation (stress, intonation, rhythm).',
    },
  },
]

// 深拷贝默认等级
function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_LEVELS))
}

// 水平配置响应式状态
const proficiency = reactive({
  levels: cloneDefaults(),
  selected: {
    read: 'intermediate',
    write: 'intermediate',
    listen: 'intermediate',
    speak: 'intermediate',
  },
})

const expandedLevel = ref(null)
const confirmDeleteId = ref(null)
let proficiencyLoaded = false
let customIdCounter = 0

function loadProficiencyConfig() {
  try {
    const saved = localStorage.getItem(PROFICIENCY_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // 合并：用保存的 levels 替换默认的，但保留 saved 中不存在的内置等级
      if (parsed.levels && Array.isArray(parsed.levels)) {
        proficiency.levels = parsed.levels
        // 确保所有内置等级都存在
        for (const def of cloneDefaults()) {
          if (!proficiency.levels.find((l) => l.id === def.id)) {
            proficiency.levels.splice(DEFAULT_LEVELS.indexOf(def), 0, def)
          }
        }
      }
      if (parsed.selected) {
        Object.assign(proficiency.selected, parsed.selected)
      }
      // 恢复自定义 ID 计数器
      let maxCustom = 0
      for (const lvl of parsed.levels || []) {
        if (!lvl.isBuiltin && lvl.id.startsWith('custom_')) {
          const n = parseInt(lvl.id.slice(7), 10)
          if (n > maxCustom) maxCustom = n
        }
      }
      customIdCounter = maxCustom
    }
  } catch (e) {
    console.warn('加载水平配置失败:', e)
  }
  proficiencyLoaded = true
}

function saveProficiencyToStorage() {
  if (!proficiencyLoaded) return
  localStorage.setItem(PROFICIENCY_STORAGE_KEY, JSON.stringify({
    levels: proficiency.levels,
    selected: proficiency.selected,
  }))
}

function autoSaveProficiency() {
  saveProficiencyToStorage()
}

function selectLevel(skillKey, levelId) {
  proficiency.selected[skillKey] = levelId
  saveProficiencyToStorage()
}

function toggleLevel(levelId) {
  expandedLevel.value = expandedLevel.value === levelId ? null : levelId
}

function addCustomLevel() {
  customIdCounter++
  const newLevel = {
    id: 'custom_' + customIdCounter,
    label: '自定义等级 ' + customIdCounter,
    isBuiltin: false,
    prompts: {
      read: '',
      write: '',
      listen: '',
      speak: '',
    },
  }
  proficiency.levels.push(newLevel)
  expandedLevel.value = newLevel.id
  saveProficiencyToStorage()
}

function executeDelete(levelId) {
  confirmDeleteId.value = null
  const idx = proficiency.levels.findIndex((l) => l.id === levelId)
  if (idx === -1) return
  // 如果有技能选中了被删除的等级，回退到 intermediate
  for (const skill of SKILLS) {
    if (proficiency.selected[skill.key] === levelId) {
      proficiency.selected[skill.key] = 'intermediate'
    }
  }
  proficiency.levels.splice(idx, 1)
  if (expandedLevel.value === levelId) expandedLevel.value = null
  saveProficiencyToStorage()
}

function resetLevelToDefault(levelId) {
  const defs = cloneDefaults()
  const def = defs.find((l) => l.id === levelId)
  if (!def) return
  const existing = proficiency.levels.find((l) => l.id === levelId)
  if (existing) {
    existing.label = def.label
    existing.prompts = JSON.parse(JSON.stringify(def.prompts))
  }
  saveProficiencyToStorage()
}

// 任意配置变更自动保存
watch(config, () => saveToStorage(), { deep: true })

onMounted(() => {
  loadConfig()
  if (!config.model) {
    config.model = 'gpt-4o-mini'
  }
  loadProficiencyConfig()
})
</script>
