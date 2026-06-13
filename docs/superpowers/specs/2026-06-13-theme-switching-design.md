# 主题切换功能 & 浅色主题设计

**日期：** 2026-06-13  
**状态：** 已批准  
**关联：** Nocturne Study 暗色主题（现有）

---

## 目标

为 ShiYi 应用增加主题切换功能，新增一套现代极简浅色主题，保留现有暖暗主题。用户可通过 header 下拉菜单在深色 / 浅色 / 跟随系统三个选项间切换。

## 设计决策

| 维度 | 暗色主题（现有） | 浅色主题（新） |
|------|-----------------|---------------|
| 风格 | Nocturne Study 暖暗文学 | Clean Minimal 极简现代 |
| 底色 | `#1B1918` 深褐 | `#FFFFFF` 纯白 |
| 强调色 | Gold `#C9A95C` | Teal `#0D9488` |
| 字体 | 衬线为主（保留但统一更新） | 全无衬线 |
| 纹理 | 颗粒噪点保留 | 无纹理 |
| 卡片 | 暖暗层次 | 冷灰层次 `#F8F9FB` |

---

## 架构

### CSS 变量三层结构

```
:root                      ← 共享层（字体、间距、圆角、阴影、过渡）
[data-theme="dark"]       ← 暗色主题颜色变量
[data-theme="light"]      ← 浅色主题颜色变量
```

主题切换：在 `<html>` 元素上设置 `data-theme` 属性。CSS 通过属性选择器自动匹配。

变量命名规则：
- `--gold` → `--accent`（重命名，暗色浅色共用）
- `--gold-light` → `--accent-light`
- `--gold-glow` → `--accent-glow`
- `--gold-subtle` → `--accent-subtle`
- 其余语义化变量名不变

### 状态管理

- 存储键名：`localStorage` → `ShiYi_theme`
- 可选值：`dark` | `light` | `auto`
- 默认值：`dark`（兼容现有用户）
- `auto` 模式监听 `matchMedia('(prefers-color-scheme: dark)')` change 事件

---

## 完整色板

### 浅色主题 `[data-theme="light"]`

```
背景层级：
  --bg-deep:      #ffffff    ← 页面底色
  --bg-surface:   #f8f9fb    ← 卡片、聊天区
  --bg-elevated:  #f1f3f6    ← 输入栏、header
  --bg-hover:     #e8ebef    ← hover 态

文字层级：
  --text-primary:   #1a1a1a
  --text-secondary: #6b7280
  --text-muted:     #9ca3af
  --text-inverse:   #ffffff

强调色（Teal）：
  --accent:        #0d9488
  --accent-light:  #14b8a6
  --accent-glow:   rgba(13,148,136,0.18)
  --accent-subtle: rgba(13,148,136,0.08)

技能色（浅色下更饱和）：
  --skill-read:     #3b82b6
  --skill-read-bg:  rgba(59,130,182,0.1)
  --skill-write:    #d9466f
  --skill-write-bg: rgba(217,70,111,0.1)
  --skill-listen:   #10b981
  --skill-listen-bg:rgba(16,185,129,0.1)
  --skill-speak:    #e5a50a
  --skill-speak-bg: rgba(229,165,10,0.1)

语义色：
  --success:    #10b981
  --success-bg: rgba(16,185,129,0.1)
  --warning:    #e5a50a
  --warning-bg: rgba(229,165,10,0.1)
  --danger:     #ef4444
  --danger-bg:  rgba(239,68,68,0.1)

边框：
  --border-subtle:  #e5e7eb
  --border-visible: #d1d5db

阴影（更淡、扩散更大）：
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.06)
  --shadow:     0 2px 8px rgba(0,0,0,0.08)
  --shadow-lg:  0 8px 24px rgba(0,0,0,0.1)
  --shadow-glow: 0 0 20px var(--accent-glow)
```

### 暗色主题 `[data-theme="dark"]`

现有 Nocturne Study 色值保持，仅变量名从 `--gold*` 改为 `--accent*`。

### 共享 `:root`

```
字体（全无衬线）：
  --font-display: 'Inter', 'SF Pro Display', -apple-system, sans-serif
  --font-body:    'Inter', 'SF Pro Text', -apple-system, sans-serif
  --font-ui:      'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif

间距 & 形状：
  --radius-sm: 6px
  --radius:    10px
  --radius-lg: 16px
  --radius-xl: 24px

过渡：
  --ease-out:    cubic-bezier(0.22, 0.61, 0.36, 1)
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
```

注意：`--shadow-glow` 可放在 `:root`（它引用 `var(--accent-glow)` 随主题变化）。其余阴影变量 `--shadow-sm`/`--shadow`/`--shadow-lg` 值含固定颜色，需放在各主题块内。

### 主题差异项

| 项目 | 暗色 | 浅色 |
|------|------|------|
| `body::after` 颗粒纹理 | 保留 | 移除 (`display: none`) |
| `::selection` | accent 底 + inverse 字 | accent 底 + inverse 字（共用规则） |
| 滚动条 | warm 色调 | neutral 灰调 |
| `body` background | `var(--bg-deep)` | `var(--bg-deep)`（共用规则） |

---

## 主题切换控件

### 位置
App.vue header 内，`<nav>` 右侧。

### 形态
一个紧凑的 `<select>` 下拉框，三个选项：
- 🌙 深色 (`dark`)
- ☀️ 浅色 (`light`)
- 💻 跟随系统 (`auto`)

### 行为
1. 页面加载时从 `localStorage` 读取 `ShiYi_theme`
2. 值为 `auto` 时读取 `matchMedia('(prefers-color-scheme: dark)')`
3. 解析后设置 `<html data-theme="...">`
4. 用户切换时更新 `localStorage` + DOM 属性
5. `auto` 模式下监听系统主题变化事件，实时响应

### 样式
- 无边框、透明背景，与 header nav 链接风格统一
- focus 时 accent 色边框
- 字体：`--font-ui`，`0.88rem`

---

## 影响范围

### 需要修改的文件

| 文件 | 改动内容 |
|------|---------|
| `code/index.html` | 更新 Google Fonts 引用（Inter + DM Sans） |
| `code/src/style.css` | 变量重组：新增 `:root` 共享层、`[data-theme]` 主题层；`--gold*` → `--accent*` 重命名；新增浅色主题全部色值 |
| `code/src/App.vue` | Header 内新增主题 `<select>` + 切换逻辑 |

### 不需要修改的文件

- `views/DeckSelect.vue` — 样式全通过 CSS 变量继承
- `views/LearnView.vue` — 同上
- `views/SettingsView.vue` — 同上
- `components/PhilosophyPanel.vue` — 同上
- `router/index.js` — 无关
- `server/` — 无关

---

## 验收标准

1. Header 出现主题下拉，默认选中"深色"
2. 切换到"浅色"，页面立即切换为纯白 + Teal 强调色的极简风格
3. 切换到"跟随系统"，匹配当前系统主题设置
4. 刷新页面后主题选择保持（localStorage 持久化）
5. 在"跟随系统"模式下，切换系统主题 → 页面自动响应
6. 暗色主题视觉效果与改动前一致（仅 `--gold` 重命名为 `--accent`，色值不变）
7. 暗色主题的颗粒纹理保留
8. 浅色主题无颗粒纹理
