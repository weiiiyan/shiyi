<template>
  <div id="app-container">
    <header class="app-header">
      <router-link to="/" class="logo">ShiYi</router-link>
      <nav>
        <router-link to="/">牌组</router-link>
        <router-link to="/settings">设置</router-link>
        <select v-model="theme" class="theme-select">
          <option value="dark">🌙 深色</option>
          <option value="light">☀️ 浅色</option>
          <option value="auto">💻 跟随系统</option>
        </select>
      </nav>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const STORAGE_KEY = 'ShiYi_theme'
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

const theme = ref(localStorage.getItem(STORAGE_KEY) || 'dark')

function resolveTheme(value) {
  if (value === 'auto') return mediaQuery.matches ? 'dark' : 'light'
  return value
}

function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved)
  // Update browser title bar color
  const meta = document.getElementById('theme-color-meta')
  if (meta) {
    meta.setAttribute('content', resolved === 'light' ? '#ffffff' : '#1b1918')
  }
}

// Bootstrap
applyTheme(resolveTheme(theme.value))

// User changes
watch(theme, (newVal) => {
  localStorage.setItem(STORAGE_KEY, newVal)
  applyTheme(resolveTheme(newVal))
})

// System theme changes (only relevant in auto mode)
function onSystemChange(e) {
  if (theme.value === 'auto') {
    applyTheme(e.matches ? 'dark' : 'light')
  }
}

mediaQuery.addEventListener('change', onSystemChange)
</script>
