<template>
  <div class="learn-view">
    <!-- 左侧：对话区域 -->
    <div class="chat-area">
      <!-- 顶部信息栏 -->
      <div class="learn-header">
        <button class="back-btn" @click="goBack">← 返回</button>
        <div class="card-info">
          <span class="card-type-badge" :class="currentCard?.cardType">
            {{ cardTypeLabel(currentCard?.cardType) }}
          </span>
          <span v-if="cardStateLabel(currentCard?.ankiType)" class="card-state-badge" :class="stateClass(currentCard?.ankiType)">
            {{ cardStateLabel(currentCard?.ankiType) }}
          </span>
          <span v-if="currentCard" class="word">{{ currentCard.word }}</span>
        </div>
        <div class="progress-info" v-if="totalDue > 0">
          <span v-if="scores.again + scores.good + scores.easy > 0" class="session-scores">
            ✅{{ scores.easy }} ⚠️{{ scores.good }} 🔁{{ scores.again }}
          </span>
          剩余: {{ remaining + 1 }}
        </div>
      </div>

      <!-- 目标单词横幅 -->
      <div v-if="currentCard" class="target-word-banner">
        <div class="target-word-main">{{ currentCard.word }}</div>
        <div class="target-word-concept" v-if="currentConcept">{{ currentConcept }}</div>
      </div>

      <!-- 对话消息 -->
      <div class="messages" ref="messagesContainer">
        <!-- 如果没有活跃会话 -->
        <div v-if="!started && !loading" class="start-prompt">
          <h2>🎯 准备开始学习</h2>
          <p>牌组：<strong>{{ deckName }}</strong></p>
          <button class="btn-primary" @click="startSession">开始学习</button>
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="loading-message">
          正在准备学习场景...
        </div>

        <!-- 对话消息列表 -->
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="message"
          :class="msg.role"
        >
          <div v-if="msg.role === 'user'" class="message-content">{{ msg.content }}</div>
          <div v-else class="message-content" v-html="msg.content"></div>
          <div v-if="msg.role === 'assistant' && !msg.ease" class="msg-actions">
            <button
              class="btn-speak"
              @click="readAloud(msg.content, i)"
              :disabled="ttsSpeaking && ttsIndex === i"
              :title="ttsSpeaking && ttsIndex === i ? '朗读中...' : '朗读'"
            >
              {{ ttsSpeaking && ttsIndex === i ? '🔊' : '🔈' }}
            </button>
          </div>
          <div v-if="msg.ease" class="judgment" :class="'ease-' + msg.ease">
            {{ easeLabel(msg.ease) }}
          </div>
        </div>

        <!-- 完成状态 — 放在消息之后，确保可见 -->
        <div v-if="done" class="done-message">
          <h2>🎉</h2>
          <p>{{ doneMessage }}</p>
          <button class="btn-primary" @click="goBack">返回牌组列表</button>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-area" v-if="started && !done">
        <button
          class="btn-mic"
          :class="{ recording: sttListening }"
          @click="toggleVoiceInput"
          :disabled="waiting"
          :title="sttListening ? '录音中，点击停止' : '语音输入'"
        >
          {{ sttListening ? '⏹' : '🎤' }}
        </button>
        <input
          v-model="userInput"
          :placeholder="inputPlaceholder"
          @keydown.enter="sendResponse"
          :disabled="waiting"
          ref="inputBox"
        />
        <button @click="sendResponse" :disabled="waiting || !userInput.trim()">
          发送
        </button>
      </div>
    </div>

    <!-- 右侧：学习理念面板 -->
    <div class="philosophy-panel">
      <PhilosophyPanel />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import PhilosophyPanel from '../components/PhilosophyPanel.vue'
import { useTTS, useSTT } from '../composables/useSpeech.js'

const props = defineProps({
  deckId: String,
})

const router = useRouter()

const deckName = decodeURIComponent(props.deckId)

// 状态
const started = ref(false)
const loading = ref(false)
const waiting = ref(false)
const done = ref(false)
const doneMessage = ref('')
const currentCard = ref(null)
const currentConcept = ref('')
const totalDue = ref(0)
const remaining = ref(0)
const messages = ref([])
const userInput = ref('')
const messagesContainer = ref(null)
const inputBox = ref(null)
const scores = ref({ again: 0, good: 0, easy: 0 })
const currentScenario = ref(null)  // 原始场景数据，供 TTS 使用

// 语音功能
const { speak, stop: stopTTS, speaking: ttsSpeaking, supported: ttsSupported } = useTTS()
const { startListening, stopListening, listening: sttListening, supported: sttSupported } = useSTT()
const ttsIndex = ref(-1)
const voiceInputText = ref('')

const inputPlaceholder = computed(() => {
  if (sttListening.value) return '正在听取语音...'
  if (currentCard.value?.cardType === 'speak') return '点击 🎤 说出你的回答...'
  if (currentCard.value?.cardType === 'write') return '用英语输入你的回答...'
  return '用英语输入你的回答...'
})

function readAloud(text, index) {
  if (ttsSpeaking.value && ttsIndex.value === index) {
    stopTTS()
    ttsIndex.value = -1
    return
  }

  // 清理文本中用于显示的标记、HTML 标签和 Markdown 语法
  const cleanText = text
    .replace(/<[^>]*>/g, '')     // 移除 HTML 标签（如 <mark> 高亮标记）
    .replace(/\*{1,2}/g, '')     // 移除 Markdown 强调标记 ** 和 *
    .replace(/🎧\s*/g, '')
    .replace(/🗣️\s*/g, '')
    .replace(/✍️\s*/g, '')
    .replace(/❓\s*/g, '')
    .trim()

  ttsIndex.value = index
  speak(cleanText)
  // 朗读完成后重置
  setTimeout(() => {
    if (!ttsSpeaking.value) ttsIndex.value = -1
  }, 100)
}

async function toggleVoiceInput() {
  if (sttListening.value) {
    stopListening()
    return
  }

  try {
    const text = await startListening()
    if (text) {
      userInput.value = text
      voiceInputText.value = text
      // 自动发送语音识别结果
      await sendResponse()
    }
  } catch (err) {
    console.warn('Voice input error:', err.message)
  }
}

// AI 配置 — 从 localStorage 读取
const aiConfig = computed(() => {
  try {
    const saved = localStorage.getItem('ShiYi_ai_config')
    if (saved) return JSON.parse(saved)
  } catch {}
  return {
    provider: 'openai',
    apiKey: '',
    baseURL: '',
    model: 'gpt-4o-mini',
  }
})

// 英语水平配置 — 从 localStorage 读取
const proficiencyConfig = computed(() => {
  try {
    const saved = localStorage.getItem('ShiYi_proficiency_config')
    if (saved) return JSON.parse(saved)
  } catch {}
  return null
})

const LABELS = {
  cardType: { read: '📖 读', write: '✍️ 写', listen: '🎧 听', speak: '🗣️ 说' },
  cardState: { 0: '🆕 新卡', 2: '🔄 复习' },
  stateClass: { 0: 'state-new', 2: 'state-review' },
  ease: { 1: '需要再练', 3: '基本掌握', 4: '完全掌握' }
}

function getLabel(type, key) {
  return LABELS[type]?.[key] ?? key ?? ''
}

function cardTypeLabel(type) {
  return getLabel('cardType', type)
}

function cardStateLabel(ankiType) {
  return getLabel('cardState', ankiType)
}

function stateClass(ankiType) {
  return getLabel('stateClass', ankiType)
}

function easeLabel(ease) {
  return getLabel('ease', ease)
}

function goBack() {
  router.push({ name: 'decks' })
}

async function startSession() {
  loading.value = true
  try {
    const res = await fetch('/api/learn/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: props.deckId,
        aiConfig: aiConfig.value,
        proficiencyConfig: proficiencyConfig.value,
      }),
    })
    const data = await res.json()

    if (data.error) {
      messages.value.push({ role: 'system', content: '❌ ' + data.error })
      loading.value = false
      return
    }

    if (data.done) {
      done.value = true
      doneMessage.value = data.message
      totalDue.value = data.totalDue
      loading.value = false
      return
    }

    currentCard.value = data.card
    currentConcept.value = data.card.concept || ''
    totalDue.value = data.totalDue
    remaining.value = data.remaining
    started.value = true
    loading.value = false

    // 显示 AI 生成的场景
    if (data.scenario) {
      currentScenario.value = data.scenario
      const msg = formatScenario(currentCard.value.cardType, data.scenario, currentCard.value.word)
      messages.value.push({ role: 'assistant', content: msg })
      // listen 卡片自动朗读
      if (currentCard.value.cardType === 'listen' && data.scenario.audioText) {
        await nextTick()
        speak(data.scenario.audioText)
      }
    }

    await nextTick()
    scrollToBottom()
  } catch (err) {
    messages.value.push({ role: 'system', content: '❌ 连接失败：' + err.message })
    loading.value = false
  }
}

async function sendResponse() {
  const text = userInput.value.trim()
  if (!text || waiting.value) return

  messages.value.push({ role: 'user', content: text })
  userInput.value = ''
  waiting.value = true
  await nextTick()
  scrollToBottom()

  try {
    const res = await fetch('/api/learn/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: props.deckId,
        response: text,
      }),
    })
    const data = await res.json()

    if (data.error) {
      messages.value.push({ role: 'system', content: '❌ ' + data.error })
      waiting.value = false
      return
    }

    const j = data.judgment

    // 显示反馈（不含目标词高亮，只做 Markdown → HTML + 转义）
    messages.value.push({
      role: 'assistant',
      content: formatMessageText(j.feedback, null),
      ease: j.ease,
    })

    // AI 评分后直接完成当前卡片，不再进行多轮对话
    // 这样每张卡片只做一轮问答，避免同一问题反复出现
    await completeCard(j.ease)
  } catch (err) {
    messages.value.push({ role: 'system', content: '❌ 请求失败：' + err.message })
    waiting.value = false
  }

  await nextTick()
  scrollToBottom()
}

async function completeCard(ease) {
  try {
    const res = await fetch('/api/learn/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: props.deckId, ease }),
    })
    const data = await res.json()

    if (data.cardCompleted) {
      scores.value = data.progress?.scores || scores.value
    }

    // 获取下一张卡片
    await nextCard()
  } catch (err) {
    messages.value.push({ role: 'system', content: '❌ 更新失败：' + err.message })
  }
  waiting.value = false
}

async function nextCard() {
  try {
    const res = await fetch('/api/learn/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: props.deckId }),
    })
    const data = await res.json()

    if (data.done) {
      done.value = true
      doneMessage.value = data.message
      totalDue.value = data.totalDue
      return
    }

    currentCard.value = data.card
    currentConcept.value = data.card.concept || ''
    totalDue.value = data.totalDue
    remaining.value = data.remaining
    if (data.progress) {
      scores.value = data.progress.scores
    }

    if (data.scenario) {
      currentScenario.value = data.scenario
      const msg = formatScenario(currentCard.value.cardType, data.scenario, currentCard.value.word)
      messages.value.push({ role: 'assistant', content: msg })
      // listen 卡片自动朗读
      if (currentCard.value.cardType === 'listen' && data.scenario.audioText) {
        await nextTick()
        speak(data.scenario.audioText)
      }
    }
  } catch (err) {
    messages.value.push({ role: 'system', content: '❌ 获取下一张卡片失败：' + err.message })
  }
}

function formatScenario(cardType, scenario, word = '') {
  let text
  switch (cardType) {
    case 'read':
      text = `${scenario.scenario}\n\n❓ ${scenario.question}`
      break
    case 'write':
      text = `✍️ ${scenario.scenario}\n\n❓ ${scenario.task}`
      break
    case 'listen':
      text = `🎧 ${scenario.audioText}\n\n❓ ${scenario.question}`
      break
    case 'speak':
      text = `🗣️ ${scenario.scenario}\n\n❓ ${scenario.task}`
      break
    default:
      text = scenario.scenario || scenario.question || ''
  }
  return formatMessageText(text, word)
}

/**
 * 安全地将 AI 文本转为可渲染的 HTML
 *
 * 策略（顺序很重要）：
 * 1. Markdown ** 转占位符（避免被后续转义破坏）
 * 2. 去掉 AI 可能输出的原始 HTML 标签
 * 3. HTML 转义（防 XSS）
 * 4. 占位符还原为 <strong>/<em> 标签
 * 5. \n 转 <br>
 * 6. 高亮目标单词
 */
function formatMessageText(text, word) {
  if (!text) return text

  // Step 1: Markdown → 占位符
  let processed = text
    .replace(/\*\*(.+?)\*\*/g, '\x00STRONG\x00$1\x00/STRONG\x00')
    .replace(/\*(.+?)\*/g, '\x00EM\x00$1\x00/EM\x00')

  // Step 2: 去掉 AI 可能输出的 HTML 标签（仅匹配真正的标签，<字母...>）
  processed = processed.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\/?>/g, '')

  // Step 3: HTML 转义
  processed = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Step 4: 占位符 → HTML 标签
  processed = processed
    .replace(/\x00STRONG\x00/g, '<strong>')
    .replace(/\x00\/STRONG\x00/g, '</strong>')
    .replace(/\x00EM\x00/g, '<em>')
    .replace(/\x00\/EM\x00/g, '</em>')

  // Step 5: \n → <br>
  processed = processed.replace(/\n/g, '<br>')

  // Step 6: 高亮目标单词
  if (word) {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b(${escapedWord})\\b`, 'gi')
    processed = processed.replace(regex, '<mark class="word-highlight">$1</mark>')
  }

  return processed
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

onMounted(() => {
  // 自动开始学习
  startSession()
})
</script>
