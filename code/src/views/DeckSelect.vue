<template>
  <div class="deck-select">
    <h2>选择学习牌组</h2>

    <!-- Anki 连接状态 -->
    <div class="status-bar" :class="{ connected: ankiConnected, disconnected: !ankiConnected }">
      <template v-if="ankiConnected">
        ✅ Anki-Connect 已连接 (v{{ ankiVersion }})
      </template>
      <template v-else>
        <div class="disconnected-warning">
          <p>⚠️ 无法连接到 Anki-Connect</p>
          <p class="hint">请确保 Anki 已启动，且安装了 <a href="https://ankiweb.net/shared/info/2055492159" target="_blank">Anki-Connect</a> 插件</p>
          <button @click="checkAnkiStatus" :disabled="checking">重新检测</button>
        </div>
      </template>
    </div>

    <!-- 牌组列表 -->
    <div v-if="loading" class="loading">加载牌组中...</div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="loadDecks">重试</button>
    </div>

    <div v-else-if="decks.length === 0" class="empty">
      <h3>📭 没有找到 MaiMemo 牌组</h3>
      <p>本应用需要以 <code>MaiMemo::</code> 为前缀的牌组。</p>
      <p><strong>如何在 Anki 中创建：</strong></p>
      <ol class="setup-guide">
        <li>打开 Anki，点击底部 <strong>"创建牌组"</strong></li>
        <li>输入 <code>MaiMemo::日常交流</code>（这会创建一个名为"日常交流"的子牌组）</li>
        <li>或者先创建 <code>MaiMemo</code>，再在其下创建子牌组</li>
      </ol>
      <div v-if="allDeckNames.length > 0" class="detected-decks">
        <p>🔍 Anki 中检测到的牌组（{{ allDeckNames.length }} 个）：</p>
        <ul>
          <li v-for="name in allDeckNames" :key="name">
            <code>{{ name }}</code>
            <span v-if="name.startsWith('MaiMemo::')">✅ 匹配</span>
            <span v-else class="not-match">❌ 需要重命名为 <code>MaiMemo::{{ name }}</code></span>
          </li>
        </ul>
      </div>
      <div v-else class="detected-decks">
        <p>⚠️ Anki 中似乎没有任何牌组。请先在 Anki 中创建牌组。</p>
      </div>
      <button @click="loadDecks" class="btn-refresh">🔄 刷新检测</button>
    </div>

    <div v-else class="deck-grid">
      <div
        v-for="deck in decks"
        :key="deck.id"
        class="deck-card"
        @click="startLearn(deck)"
      >
        <h3>{{ deck.name }}</h3>
        <div class="deck-stats">
          <span class="due">{{ deck.dueCards }} 待学</span>
          <span class="total">共 {{ deck.totalCards }} 张</span>
        </div>
        <div class="start-hint">点击开始学习 →</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const decks = ref([])
const allDeckNames = ref([])
const loading = ref(true)
const error = ref('')
const ankiConnected = ref(false)
const ankiVersion = ref('')
const checking = ref(false)

async function checkAnkiStatus() {
  checking.value = true
  try {
    const res = await fetch('/api/decks/status')
    const data = await res.json()
    ankiConnected.value = data.available
    ankiVersion.value = data.version || ''
  } catch {
    ankiConnected.value = false
  } finally {
    checking.value = false
  }
}

async function loadDecks() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/decks')
    const data = await res.json()
    decks.value = data.decks || []
    allDeckNames.value = data.allDeckNames || []
  } catch (err) {
    error.value = '加载牌组失败：' + err.message
  } finally {
    loading.value = false
  }
}

function startLearn(deck) {
  router.push({ name: 'learn', params: { deckId: deck.id } })
}

onMounted(async () => {
  await checkAnkiStatus()
  if (ankiConnected.value) {
    await loadDecks()
  } else {
    loading.value = false
  }
})
</script>
