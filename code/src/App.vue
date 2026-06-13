<template>
  <div id="app-container">
    <header class="app-header">
      <router-link to="/" class="logo">ShiYi</router-link>
      <nav>
        <router-link to="/">牌组</router-link>
        <router-link to="/settings">设置</router-link>
      </nav>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>
