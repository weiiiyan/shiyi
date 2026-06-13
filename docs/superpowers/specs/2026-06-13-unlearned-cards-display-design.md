# 未学习卡片的学习安排与显示 — 设计文档

**日期：** 2026-06-13
**状态：** 已批准

---

## 背景

当前 ShiYi 学习应用只关注 "到期"（`is:due`）的卡片——即需要复习的卡片。Anki 中的卡片有三种类型：
- `type=0`：新卡（从未学过）
- `type=1`：学习中
- `type=2`：待复习

牌组选择界面只显示笼统的"X 待学"和"共 X 张"，用户无法区分哪些是新卡片、哪些是需要复习的旧卡片。学习界面也不标识当前卡片是新卡还是复习卡。

## 目标

在牌组选择界面和学习界面中，增加对"未学习"（新卡）状态的展示和区分，让用户可以清楚地看到每个牌组的新卡数量和复习数量，并在学习时知道当前卡片的熟练度状态。

## 关键发现

**`is:due` 不包含新卡。** Anki 中 `is:new` 和 `is:due` 是两个互斥的集合：
- `is:new`：从未学过的卡片（type=0），没有到期时间，**不会**被 `is:due` 匹配
- `is:due`：到期待复习的卡片（type=2 到期 + type=1 学习中到期）

这就是为什么用户有 8 张新卡但当前显示 0 待学——因为 `is:due` 查不到它们。需要同时修改统计查询**和**学习队列查询。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 学习队列 | 混合排队 | 新卡和复习卡统一排队，查询改为 `(is:due OR is:new)` |
| 排序 | 依靠 Anki 调度 | `(is:due OR is:new)` 由 Anki 按内部算法排序（到期时间 + 新卡队列位置） |
| 统计展示 | 新卡 + 复习 + 总数 | 三项数字让用户清楚每种状态的数量 |
| 卡片标签 | 显示状态 | 学习时在卡片上显示"新卡"或"复习"标签 |

## 架构

```
┌─────────────────────────────────────────────────┐
│                    Frontend (Vue 3)               │
│  DeckSelect.vue          LearnView.vue            │
│  ┌──────────────────┐    ┌──────────────────┐    │
│  │ 🆕 N 未学         │    │ 📖 读 🆕 新卡    │    │
│  │ 🔄 N 待复习       │    │ word             │    │
│  │ 共 N 张           │    │                  │    │
│  └──────────────────┘    └──────────────────┘    │
└────────────────────┬─────────────────────────────┘
                     │ HTTP
┌────────────────────┴─────────────────────────────┐
│                  Backend (Express)                 │
│  /api/decks              /api/learn/*              │
│  ┌──────────────────┐    ┌──────────────────┐    │
│  │ newCards,         │    │ card.ankiType    │    │
│  │ reviewCards,      │    │ (0=new, 1=learn, │    │
│  │ totalCards        │    │  2=review)       │    │
│  └──────────────────┘    └──────────────────┘    │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────┐
│              ankiService.js                        │
│  ┌────────────────────────────────────────────┐   │
│  │ is:new → newCards count                     │   │
│  │ is:due → reviewCards count                   │   │
│  │ deck:"..." → totalCards count               │   │
│  │ (is:due OR is:new) → learning queue          │   │
│  └────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────┘
```

## 改动详情

### 文件 1：`code/server/services/ankiService.js`

**`getDueCards()` 函数修改：**

当前查询只使用 `is:due`，查不到新卡。改为 `(is:due OR is:new)` 以同时包含新卡和待复习卡片：

```js
// 旧：只查到期待复习卡片
const cardIds = await invoke('findCards', {
  query: `deck:"${deckFullName}" is:due`,
});

// 新：同时包含新卡和到期待复习卡片
const cardIds = await invoke('findCards', {
  query: `deck:"${deckFullName}" (is:due OR is:new)`,
});
```

**`getShiYiDecks()` 函数修改：**

当前 `dueCards` 是通过 `is:due` 查询的，只包含复习到期卡片，不包含新卡。需要拆分为新卡和复习两类统计：

1. 新增 `is:new` 查询，获取新卡 ID 并构建 Set
2. `dueSet` 保持 `is:due`（本身就不含新卡）
3. 返回的每个 deck 对象增加 `newCards` 和 `reviewCards` 字段（`reviewCards` 即原来的 `dueCards`）

```js
// 伪代码示意
const newCardIds = await invoke('findCards', { query: 'deck:"ShiYi" is:new' });
const dueCardIds = await invoke('findCards', { query: 'deck:"ShiYi" is:due' });
const newSet = new Set(newCardIds);
const dueSet = new Set(dueCardIds);

// 遍历 cardsInfo 统计:
// stat.newCards++     if newSet.has(card.cardId)
// stat.reviewCards++  if dueSet.has(card.cardId)
// (new 和 due 互斥，不需要做减法)
```

### 文件 2：`code/server/routes/decks.js`

透传新增字段到前端响应。deck 对象从 `{ id, name, fullName, totalCards, dueCards }` 变为 `{ id, name, fullName, totalCards, newCards, reviewCards }`。保留 `dueCards` 字段向后兼容。

### 文件 3：`code/server/routes/learn.js`

**`/api/learn/start` 和 `/api/learn/next`：**

返回的 `card` 对象增加 `ankiType` 字段：

```js
card: {
  cardId: card.cardId,
  word: card.word,
  cardType: card.cardType,
  ankiType: card.type,  // 新增：0=new, 1=learning, 2=review
}
```

### 文件 4：`code/src/views/DeckSelect.vue`

模板中统计行改为三项：

```html
<div class="deck-stats">
  <span class="new-cards">🆕 {{ deck.newCards }} 未学</span>
  <span class="review">🔄 {{ deck.reviewCards }} 待复习</span>
  <span class="total">共 {{ deck.totalCards }} 张</span>
</div>
```

### 文件 5：`code/src/views/LearnView.vue`

1. 在 `card-type-badge` 旁边增加状态标签
2. 新增 `cardStateLabel()` 函数，根据 `ankiType` 返回标签

```js
function cardStateLabel(ankiType) {
  if (ankiType === 0) return '🆕 新卡'
  if (ankiType === 2) return '🔄 复习'
  return '' // type=1 (learning) 不显示
}
```

## 错误处理

- Anki-Connect 查询 `is:new` 失败时，`newCards` 回退为 0，不影响主流程
- 前端 `ankiType` 为 `undefined`（旧版本兼容）时不显示状态标签

## 测试要点

1. DeckSelect 正确显示三项统计（特别验证：有新卡无复习时，新卡数 > 0、复习 = 0）
2. LearnView 新卡显示"🆕 新卡"标签，复习卡显示"🔄 复习"标签
3. 学习队列同时包含新卡和复习卡（新卡不再被遗漏）
4. `answerCard` 正常更新新卡（Anki 会将新卡转为 learning 状态）
5. Anki-Connect 不可用时的错误处理
