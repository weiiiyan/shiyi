# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指引。

## 项目概述

**ShiYi（拾忆）** — AI 驱动的沉浸式英语学习应用。结合 Anki 间隔重复算法与 AI 生成的对话场景，覆盖读、写、听、说四种技能训练。核心理念：英语是**运动类技能**，不是思考类知识——学习过程中不插入中文翻译。

## 常用命令

```bash
# 开发（在 code/ 目录下执行）
cd code
npm run dev           # Vite 开发服务器，端口 5173，含 API 代理
npm run server        # Express 后端，端口 3001
npm run dev:all       # 前后端同时启动
npm run build         # 生产构建
npm run preview       # 预览生产构建
```

**前置条件：** 本地必须运行 Anki，并安装 [Anki-Connect](https://ankiweb.net/shared/info/2055492159) 插件（默认地址 `http://localhost:8765`）。

## 架构拓扑

```
浏览器 (Vue 3) ─→ Vite dev server (:5173) ─proxy /api→ Express (:3001) ─→ Anki-Connect (:8765)
                                                          │
                                                          └──→ AI API (千问/豆包/OpenAI)
```

**Express 后端存在的三个理由：**(1) 代理 Anki-Connect 请求，解决浏览器跨域限制；(2) AI API Key 存放在服务端，不暴露到前端；(3) 学习会话状态在服务端统一管理。

## 项目目录结构

```
code/                        ← 主应用
  server/
    index.js                 ← Express 入口（端口 3001，CORS + JSON 解析）
    services/
      ankiService.js         ← Anki-Connect HTTP 封装（POST JSON, version 6）
      aiService.js           ← 多模型 AI 适配层：场景生成 + 作答评判
      sessionService.js      ← 内存会话存储（TTL: 2 小时）
    routes/
      decks.js               ← GET /api/decks, /api/decks/status, /api/decks/all
      learn.js               ← /api/learn/start|respond|complete|next, /api/learn/progress
      ai.js                  ← POST /api/ai/test, GET /api/ai/presets
  src/
    main.js                  ← Vue 应用入口
    App.vue                  ← 根布局（顶部导航 + router-view）
    router/index.js          ← Hash 路由：/ → 牌组, /learn/:deckId → 学习, /settings → 设置
    views/
      DeckSelect.vue         ← 牌组选择页：Anki 连接状态 + 牌组列表 + 创建引导
      LearnView.vue          ← 学习主界面：场景展示 + 输入 + TTS/STT + AI 评判
      SettingsView.vue       ← 设置页：AI 服务商/Key/模型配置 + Anki 连接检测
    components/
      PhilosophyPanel.vue    ← 静态学习理念展示面板（右侧栏）
    composables/
      useSpeech.js           ← Web Speech API 封装：useTTS() + useSTT()
  vite.config.js             ← Vite 配置，/api → localhost:3001 代理
  .env.example               ← ANKI_CONNECT_URL, SERVER_PORT
doc/                         ← 需求分析文档、设计方案
docs/superpowers/            ← 头脑风暴的 spec 和 plan
temp/                        ← 临时笔记（非源码）
```

## 核心数据模型

### Anki 笔记字段

每条 Anki 笔记对应一个最小语义单元。一个概念 → 4 张不同技能类型卡片：

- `concept` — 概念的中文描述（仅供 AI 参考，不对学习者展示）
- `word` — 目标英文单词/短语
- `card_type` — 技能类型：`read` / `write` / `listen` / `speak`
- `sub_deck` — 所属场景子牌组（如"日常交流"）
- `examples` — 配套例句（JSON 数组）
- `context` — 场景补充说明

### 牌组命名规范

牌组必须以 `ShiYi::` 为前缀，如 `ShiYi::日常交流`。后端以此前缀过滤目标牌组。Anki 的 `deck:"名称"` 查询自动递归搜索所有子牌组。

### 卡片状态

- Anki 类型：`0` = 新卡片，`1` = 学习中，`2` = 待复习
- AI 评分（ease）：`1` = 需要再练（Again），`3` = 基本掌握（Good），`4` = 完全掌握（Easy）
- 注意：有意跳过了 ease `2`（Hard），AI 只输出 1/3/4 三档

## 学习主流程

1. 用户选择 `ShiYi::` 牌组 → `POST /api/learn/start`
2. 后端从 Anki 获取到期+新卡片，创建学习会话
3. 按类型轮换出题：read → write → listen → speak（Round Robin），同类型内随机抽取
4. AI 根据卡片类型、目标词、已知词汇、场景上下文生成沉浸式英语场景
5. 用户作答（文字输入或 Web Speech API 语音）→ `POST /api/learn/respond`
6. AI 评判掌握程度 → 返回 ease 分数 + 一句简短反馈
7. 当前卡片完成（每张卡片只做一轮）→ `POST /api/learn/complete` → 更新 Anki 间隔重复数据
8. 获取下一张卡片 → `POST /api/learn/next`，循环直到全部学完

**重要：** 当前交互模式是每张卡片单轮对话。`sendResponse()` → `completeCard()` → `nextCard()` 链在 AI 评判后自动执行，不做同一张卡片的多轮对话。

## AI 服务层要点

- 支持 OpenAI 兼容接口，内置千问、豆包、OpenAI、自定义四种预设
- `parseAIJson()` 对 LLM 输出做鲁棒 JSON 提取（处理 markdown 代码块、格式错误的 JSON）
- 场景生成使用 `temperature: 0.9`（鼓励多样性），作答评判使用 `temperature: 0.5`（追求一致性）
- 同一会话中记录每个单词已生成场景的哈希，用于去重——同一单词再次出现时提示 AI 生成全新场景
- AI prompt 全部使用英文——学习内容中不出现中文

## 会话状态管理

- 内存存储（`Map<deckId, session>`），每个牌组一个会话
- 2 小时无操作自动过期（每次访问刷新 TTL）
- 跟踪内容：当前卡片、对话历史、连续失败次数、已学单词、场景历史、已完成卡片、评分统计

## 前端注意事项

- AI 配置存储在 `localStorage`，键名为 `ShiYi_ai_config`，由前端读取并通过每次 API 请求发送给后端
- Vue Router 使用 hash 模式（`createWebHashHistory`）
- `LearnView.vue` 是最复杂的组件——编排了整个学习循环
- 语音输入识别完成后自动提交
- listen 类型卡片在场景加载时自动朗读
- 推荐使用 Volar 插件进行 Vue 3 开发
