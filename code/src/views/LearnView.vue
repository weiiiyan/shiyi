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
          <span v-if="currentCard" class="word">{{ currentCard.word }}</span>
        </div>
        <div class="progress-info" v-if="totalDue > 0">
          <span v-if="scores.again + scores.good + scores.easy > 0" class="session-scores">
            ✅{{ scores.easy }} ⚠️{{ scores.good }} 🔁{{ scores.again }}
          </span>
          剩余: {{ remaining + 1 }}
        </div>
      </div>

      <!-- 对话消息 -->
      <div class="messages" ref="messagesContainer">
        <!-- 如果没有活跃会话 -->
        <div v-if="!started && !loading" class="start-prompt">
          <h2>🎯 准备开始学习</h2>
          <p>牌组：<strong>{{ deckName }}</strong></p>
          <button class="btn-primary" @click="startSession">开始学习</button>
        </div>

        <!-- 完成状态 -->
        <div v-if="done" class="done-message">
          <h2>🎉</h2>
          <p>{{ doneMessage }}</p>
          <button class="btn-primary" @click="goBack">返回牌组列表</button>
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
          <div class="message-content">{{ msg.content }}</div>
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

  // 清理文本中用于显示的标记
  const cleanText = text
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
    const saved = localStorage.getItem('maimemo_ai_config')
    if (saved) return JSON.parse(saved)
  } catch {}
  return {
    provider: 'openai',
    apiKey: '',
    baseURL: '',
    model: 'gpt-4o-mini',
  }
})

function cardTypeLabel(type) {
  const map = { read: '📖 读', write: '✍️ 写', listen: '🎧 听', speak: '🗣️ 说' }
  return map[type] || type
}

function easeLabel(ease) {
  const map = { 1: '需要再练', 3: '基本掌握', 4: '完全掌握' }
  return map[ease] || ''
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
      loading.value = false
      return
    }

    currentCard.value = data.card
    totalDue.value = data.totalDue
    remaining.value = data.remaining
    started.value = true
    loading.value = false

    // 显示 AI 生成的场景
    if (data.scenario) {
      currentScenario.value = data.scenario
      const msg = formatScenario(currentCard.value.cardType, data.scenario)
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

    // 显示反馈
    messages.value.push({
      role: 'assistant',
      content: j.feedback,
      ease: j.ease,
    })

    // 如果 AI 要继续对话
    if (j.continue && j.followUp) {
      messages.value.push({ role: 'assistant', content: j.followUp })
      waiting.value = false
    } else {
      // 完成当前卡片，更新 Anki
      await completeCard(j.ease)
    }
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
      return
    }

    currentCard.value = data.card
    totalDue.value = data.totalDue
    remaining.value = data.remaining
    if (data.progress) {
      scores.value = data.progress.scores
    }

    if (data.scenario) {
      currentScenario.value = data.scenario
      const msg = formatScenario(currentCard.value.cardType, data.scenario)
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

function formatScenario(cardType, scenario) {
  switch (cardType) {
    case 'read':
      return `${scenario.scenario}\n\n❓ ${scenario.question}`
    case 'write':
      return `✍️ ${scenario.scenario}\n\n❓ ${scenario.task}`
    case 'listen':
      return `🎧 ${scenario.audioText}\n\n❓ ${scenario.question}`
    case 'speak':
      return `🗣️ ${scenario.scenario}\n\n❓ ${scenario.task}`
    default:
      return scenario.scenario || scenario.question || ''
  }
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
