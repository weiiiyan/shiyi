import { createRouter, createWebHashHistory } from 'vue-router'
import DeckSelect from '../views/DeckSelect.vue'
import LearnView from '../views/LearnView.vue'
import SettingsView from '../views/SettingsView.vue'

const routes = [
  { path: '/', name: 'decks', component: DeckSelect },
  { path: '/learn/:deckId', name: 'learn', component: LearnView, props: true },
  { path: '/settings', name: 'settings', component: SettingsView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
