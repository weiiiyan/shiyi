# 主题切换功能 & 浅色主题 Implementation Plan

> **For agentic workers:** 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按 task 逐个执行。Step 使用 checkbox (`- [ ]`) 语法追踪。

**Goal:** 为 ShiYi 增加主题切换功能，新建极简浅色主题，用户可通过 header 下拉在深色/浅色/跟随系统间切换。

**Architecture:** CSS `data-theme` 属性分三层——`:root` 共享层、`[data-theme="dark"]` 暗色、`[data-theme="light"]` 浅色。App.vue 通过 `localStorage` + `matchMedia` 管理状态并设置 `<html>` 属性。

**Tech Stack:** Vue 3 Composition API, CSS Custom Properties, Google Fonts

**Files to modify:**
- `code/index.html` — 更新 Google Fonts
- `code/src/style.css` — CSS 变量三层重构 + `--gold`→`--accent` 重命名 + 浅色色板
- `code/src/App.vue` — 主题下拉 `<select>` 控件

---

### Task 1: Update Google Fonts in index.html

**Files:**
- Modify: `code/index.html:10-13`

- [ ] **Step 1: Replace font link**

Replace lines 10-13 (the `Cormorant Garamond + Crimson Pro + DM Sans` link) with `Inter + DM Sans`:

```html
<link
  href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400;1,14..32,500&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 2: Commit**

```bash
git add code/index.html
git commit -m "chore: update Google Fonts — Inter for sans-serif theme"
```

---

### Task 2: CSS Variables — Three-Layer Restructure

**Files:**
- Modify: `code/src/style.css:1-77`

This task replaces the old `:root` block and nearby metadata. We'll do it in three edits.

- [ ] **Step 1: Update file header comment**

Replace lines 1-4:

```css
/* ================================================================
   ShiYi — Theme System
   "Nocturne Study" dark + "Clean Minimal" light
   ================================================================ */
```

- [ ] **Step 2: Replace old :root block with new three-layer structure**

Replace lines 15-77 (the entire `:root { ... }` block):

```css
/* ================================================================
   Shared Layer — typography, spacing, shape, transitions
   ================================================================ */
:root {
  /* Typography — unified sans-serif */
  --font-display:   'Inter', 'SF Pro Display', -apple-system, sans-serif;
  --font-body:      'Inter', 'SF Pro Text', -apple-system, sans-serif;
  --font-ui:        'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Spacing & shape */
  --radius-sm:      6px;
  --radius:         10px;
  --radius-lg:      16px;
  --radius-xl:      24px;

  /* Transitions */
  --ease-out:       cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Shadow glow (references themed --accent-glow) */
  --shadow-glow:    0 0 20px var(--accent-glow);
}

/* ================================================================
   Dark Theme — "Nocturne Study" warm dark literary
   ================================================================ */
[data-theme="dark"] {
  /* Core palette */
  --bg-deep:        #1b1918;
  --bg-surface:     #242220;
  --bg-elevated:    #2d2a27;
  --bg-hover:       #332f2b;

  /* Text — cream paper tones */
  --text-primary:   #ece5d8;
  --text-secondary: #b8b0a0;
  --text-muted:     #908a80;
  --text-inverse:   #1b1918;

  /* Accent — aged brass / warm gold */
  --accent:           #c9a95c;
  --accent-light:     #e2cc8a;
  --accent-glow:      rgba(201, 169, 92, 0.18);
  --accent-glow-heavy:rgba(201, 169, 92, 0.35);
  --accent-subtle:    rgba(201, 169, 92, 0.08);

  /* Skill colors */
  --skill-read:     #8bb3c4;
  --skill-write:    #cf9da2;
  --skill-listen:   #8fb88f;
  --skill-speak:    #c9b372;

  --skill-read-bg:  rgba(139, 179, 196, 0.12);
  --skill-write-bg: rgba(207, 157, 162, 0.12);
  --skill-listen-bg:rgba(143, 184, 143, 0.12);
  --skill-speak-bg: rgba(201, 179, 114, 0.12);

  /* Semantic */
  --success:        #8aaa8a;
  --success-bg:     rgba(138, 170, 138, 0.12);
  --warning:        #c4945a;
  --warning-bg:     rgba(196, 148, 90, 0.12);
  --danger:         #c4726e;
  --danger-bg:      rgba(196, 114, 110, 0.12);

  /* Borders */
  --border-subtle:  #35302b;
  --border-visible: #4a4540;

  /* Shadows */
  --shadow-sm:      0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow:         0 2px 8px rgba(0, 0, 0, 0.35);
  --shadow-lg:      0 8px 24px rgba(0, 0, 0, 0.45);
}

/* ================================================================
   Light Theme — "Clean Minimal" pure white + teal accent
   ================================================================ */
[data-theme="light"] {
  /* Core palette */
  --bg-deep:        #ffffff;
  --bg-surface:     #f8f9fb;
  --bg-elevated:    #f1f3f6;
  --bg-hover:       #e8ebef;

  /* Text */
  --text-primary:   #1a1a1a;
  --text-secondary: #6b7280;
  --text-muted:     #9ca3af;
  --text-inverse:   #ffffff;

  /* Accent — teal */
  --accent:           #0d9488;
  --accent-light:     #14b8a6;
  --accent-glow:      rgba(13, 148, 136, 0.18);
  --accent-glow-heavy:rgba(13, 148, 136, 0.28);
  --accent-subtle:    rgba(13, 148, 136, 0.08);

  /* Skill colors — more saturated for light bg */
  --skill-read:     #3b82b6;
  --skill-write:    #d9466f;
  --skill-listen:   #10b981;
  --skill-speak:    #e5a50a;

  --skill-read-bg:  rgba(59, 130, 182, 0.1);
  --skill-write-bg: rgba(217, 70, 111, 0.1);
  --skill-listen-bg:rgba(16, 185, 129, 0.1);
  --skill-speak-bg: rgba(229, 165, 10, 0.1);

  /* Semantic */
  --success:        #10b981;
  --success-bg:     rgba(16, 185, 129, 0.1);
  --warning:        #e5a50a;
  --warning-bg:     rgba(229, 165, 10, 0.1);
  --danger:         #ef4444;
  --danger-bg:      rgba(239, 68, 68, 0.1);

  /* Borders */
  --border-subtle:  #e5e7eb;
  --border-visible: #d1d5db;

  /* Shadows — lighter, wider spread */
  --shadow-sm:      0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow:         0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg:      0 8px 24px rgba(0, 0, 0, 0.1);
}
```

- [ ] **Step 3: Commit**

```bash
git add code/src/style.css
git commit -m "refactor: split CSS variables into shared/dark/light three-layer theme system"
```

---

### Task 3: Rename `--gold*` to `--accent*` Throughout style.css

**Files:**
- Modify: `code/src/style.css` (scattered, ~25 locations)

All `--gold` → `--accent`, `--gold-light` → `--accent-light`, `--gold-glow` → `--accent-glow`, `--gold-subtle` → `--accent-subtle`.

- [ ] **Step 1: Rename variable references**

Run four replacements:

```bash
cd code/src
# Replace --gold (but not --gold-light, --gold-glow, --gold-subtle)
sed -i 's/var(--gold-light)/var(--accent-light)/g' style.css
sed -i 's/var(--gold-glow)/var(--accent-glow)/g' style.css
sed -i 's/var(--gold-subtle)/var(--accent-subtle)/g' style.css
sed -i 's/var(--gold)/var(--accent)/g' style.css
```

Verify no `--gold` remains: `grep -n '\-\-gold' style.css` should output nothing.

- [ ] **Step 2: Replace hardcoded gold color values with variables**

Replace these hardcoded gold references with accent variables:

| Line | Old | New |
|------|-----|-----|
| `.btn-primary` box-shadow: `0 2px 8px rgba(201, 169, 92, 0.2)` | `0 2px 8px var(--accent-glow-heavy)` |
| `.btn-primary:hover` background: `#d4b76a` | `var(--accent-light)` |
| `.btn-primary:hover` box-shadow: `0 4px 16px rgba(201, 169, 92, 0.35)` | `0 4px 16px var(--accent-glow-heavy)` |
| `.btn-primary:active` box-shadow: `0 1px 4px rgba(201, 169, 92, 0.2)` | `0 1px 4px var(--accent-glow)` |
| `.deck-card:hover` box-shadow: `0 8px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(201, 169, 92, 0.15)` | `0 8px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--accent-subtle)` |
| `.target-word-banner` background radial-gradient: `rgba(201, 169, 92, 0.08)` | `var(--accent-subtle)` |
| `.word-highlight` background: `rgba(201, 169, 92, 0.25)` | `var(--accent-glow)` |
| `.message.user` background: `rgba(201, 169, 92, 0.1)` | `var(--accent-subtle)` |
| `.message.user` border: `1px solid rgba(201, 169, 92, 0.15)` | `1px solid var(--accent-subtle)` |
| `.input-area button` box-shadow: `0 2px 8px rgba(201, 169, 92, 0.2)` | `0 2px 8px var(--accent-glow-heavy)` |
| `.input-area button:hover` background: `#d4b76a` | `var(--accent-light)` |
| `.input-area button:hover` box-shadow: `0 4px 16px rgba(201, 169, 92, 0.35)` | `0 4px 16px var(--accent-glow-heavy)` |

Use `Edit` tool for each replacement. Verify with `grep -n 'rgba(201, 169, 92\|#c9a95c\|#d4b76a\|#e2cc8a' style.css` — should only match the variable definitions in `[data-theme="dark"]` (lines where they're defined as values).

- [ ] **Step 3: Commit**

```bash
git add code/src/style.css
git commit -m "refactor: rename --gold to --accent, replace hardcoded gold values with variables"
```

---

### Task 4: Handle body Grain Texture Per Theme

**Files:**
- Modify: `code/src/style.css:93-102`

- [ ] **Step 1: Move grain overlay to dark-theme only**

The `body::after` rule currently at lines 94-102. Wrap it so it only applies in dark theme.

Replace lines 93-102:

```css
/* === Subtle grain overlay (dark theme only) === */
[data-theme="dark"] body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}
```

- [ ] **Step 2: Commit**

```bash
git add code/src/style.css
git commit -m "feat: restrict grain texture overlay to dark theme only"
```

---

### Task 5: Ensure `::selection` and Scrollbar Use Themed Variables

**Files:**
- Verify: `code/src/style.css:104-107`, `1319-1341`

- [ ] **Step 1: Check `::selection` rule**

Current (lines 104-107):
```css
::selection {
  background: var(--gold);
  color: var(--text-inverse);
}
```

After the rename in Task 3, this should now read `var(--accent)`. Verify. If not, fix to use `var(--accent)`.

- [ ] **Step 2: Verify scrollbar uses themed variables**

The scrollbar rules at lines 1319-1341 already use `var(--border-visible)` and `var(--text-muted)`, which are themed. No changes needed — the scrollbar will auto-switch with the theme.

- [ ] **Step 3: Commit** (only if changes were needed)

---

### Task 6: Add Theme Select to App.vue

**Files:**
- Modify: `code/src/App.vue`

- [ ] **Step 1: Add `<script setup>` with theme logic + `<select>` in header**

Replace the entire file:

```vue
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
import { ref, onMounted, watch } from 'vue'

const STORAGE_KEY = 'ShiYi_theme'
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

const theme = ref(localStorage.getItem(STORAGE_KEY) || 'dark')

function resolveTheme(value) {
  if (value === 'auto') return mediaQuery.matches ? 'dark' : 'light'
  return value
}

function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved)
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
```

Note: the original file has an empty `<script setup>` — this replaces it with theme logic.

- [ ] **Step 2: Add `.theme-select` style in style.css**

Append to `code/src/style.css` (in the App Layout section, around line 195 right after the nav link styles):

```css
.theme-select {
  font-family: var(--font-ui);
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 0.35em 0.55em;
  cursor: pointer;
  outline: none;
  transition: all 0.2s var(--ease-out);
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6' stroke='%23908a80' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.1em center;
  padding-right: 1.4em;
}

.theme-select:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.theme-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
```

- [ ] **Step 3: Set dark as default in index.html**

Add `data-theme="dark"` to the `<html>` tag in `code/index.html` line 2 to prevent FOUC before Vue mounts:

```html
<html lang="zh-CN" data-theme="dark">
```

- [ ] **Step 4: Commit**

```bash
git add code/src/App.vue code/src/style.css code/index.html
git commit -m "feat: add theme select dropdown with dark/light/auto modes"
```

---

### Task 7: Verify and Finalize

- [ ] **Step 1: Verify no broken references**

```bash
cd code/src
# No --gold leftovers
grep -n '\-\-gold' style.css
# No hardcoded gold color values outside variable definitions
grep -n 'rgba(201, 169, 92\|#c9a95c\|#d4b76a\|#e2cc8a' style.css
```

Expected: `--gold` returns nothing. Hardcoded gold values should only appear in the `[data-theme="dark"]` variable definition block.

- [ ] **Step 2: Start dev server and visually verify**

```bash
cd code && npm run dev
```

Manual check:
1. Open http://localhost:5173
2. Default should be dark theme — visually same as before
3. Switch to "浅色" — white bg + teal accent + sans-serif fonts
4. Switch to "跟随系统" — should match OS setting
5. Refresh page — selection persists
6. Check all three pages: 牌组, 学习, 设置

- [ ] **Step 3: Commit any fixes if needed**
