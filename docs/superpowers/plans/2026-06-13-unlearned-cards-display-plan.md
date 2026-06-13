# 未学习卡片的学习安排与显示 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在牌组选择和学习界面中增加对"未学习"（新卡）状态的展示，同时修复 `getDueCards()` 查询使新卡能进入学习队列。

**Architecture:** 修改后端 ankiService.js 的查询逻辑（`is:due` → `(is:due OR is:new)` 用于学习队列，新增 `is:new` 用于统计），路由层透传新字段，前端增加统计展示和状态标签。

**Tech Stack:** Node.js (Express), Vue 3 (Composition API), Anki-Connect API

---

### Task 1: 修改 ankiService.js — getDueCards 查询 + getShiYiDecks 统计

**Files:**
- Modify: `code/server/services/ankiService.js`

- [ ] **Step 1: 修改 `getDueCards()` 查询，同时包含新卡和复习卡**

将第 147-149 行的查询从 `is:due` 改为 `(is:due OR is:new)`：

```js
// 旧：
const cardIds = await invoke('findCards', {
  query: `deck:"${deckFullName}" is:due`,
});

// 新：
const cardIds = await invoke('findCards', {
  query: `deck:"${deckFullName}" (is:due OR is:new)`,
});
```

- [ ] **Step 2: 修改 `getShiYiDecks()` — 新增 `is:new` 查询**

在第 55 行附近（`dueCardIds` 查询之前），新增 `is:new` 查询：

```js
// 新增：查询新卡
let newCardIds = [];
try {
  newCardIds = await invoke('findCards', {
    query: 'deck:"ShiYi" is:new',
  });
} catch (err) {
  console.error('[ankiService] findCards new failed:', err.message);
}

// 构建 new 集合
const newSet = new Set(newCardIds);
```

- [ ] **Step 3: 修改 `getShiYiDecks()` — 更新统计初始化**

将第 73-76 行的统计初始化从 `{ totalCards: 0, dueCards: 0 }` 改为包含 `newCards` 和 `reviewCards`：

```js
const deckStats = {};
for (const name of shiYiDecks) {
  deckStats[name] = { totalCards: 0, newCards: 0, reviewCards: 0 };
}
```

- [ ] **Step 4: 修改 `getShiYiDecks()` — 更新统计累加逻辑**

将第 82-89 行的统计累加改为区分新卡和复习：

```js
for (const card of cardsInfo) {
  const stat = deckStats[card.deckName];
  if (stat) {
    stat.totalCards++;
    if (newSet.has(card.cardId)) {
      stat.newCards++;
    }
    if (dueSet.has(card.cardId)) {
      stat.reviewCards++;
    }
  }
}
```

- [ ] **Step 5: 修改 `getShiYiDecks()` — 更新 cardsInfo 失败时的回退逻辑**

将第 94-99 行的错误回退代码也更新为包含新字段：

```js
} catch (err) {
  console.error('[ankiService] cardsInfo failed:', err.message);
  for (const name of shiYiDecks) {
    deckStats[name].totalCards = allCardIds.length;
    deckStats[name].newCards = newCardIds.length;
    deckStats[name].reviewCards = dueCardIds.length;
  }
}
```

- [ ] **Step 6: 修改 `getShiYiDecks()` — 更新聚合和返回数据**

将第 104-136 行的聚合统计更新为包含新字段，返回数据中 `dueCards` 改名为 `reviewCards` 并保留 `dueCards` 兼容：

```js
const aggregatedStats = {};
for (const name of shiYiDecks) {
  aggregatedStats[name] = {
    totalCards: deckStats[name].totalCards,
    newCards: deckStats[name].newCards,
    reviewCards: deckStats[name].reviewCards,
  };
  const prefix = name + '::';
  for (const child of shiYiDecks) {
    if (child.startsWith(prefix)) {
      aggregatedStats[name].totalCards += deckStats[child].totalCards;
      aggregatedStats[name].newCards += deckStats[child].newCards;
      aggregatedStats[name].reviewCards += deckStats[child].reviewCards;
    }
  }
}

const statsList = shiYiDecks.map((name) => ({
  name,
  displayName: name.replace('ShiYi::', ''),
  totalCards: aggregatedStats[name].totalCards,
  newCards: aggregatedStats[name].newCards,
  reviewCards: aggregatedStats[name].reviewCards,
}));

return {
  decks: statsList.map((s) => ({
    id: encodeURIComponent(s.name),
    name: s.displayName,
    fullName: s.name,
    totalCards: s.totalCards,
    newCards: s.newCards,
    reviewCards: s.reviewCards,
    dueCards: s.reviewCards,  // 向后兼容
  })),
  allDecks,
};
```

- [ ] **Step 7: 提交**

```bash
git add code/server/services/ankiService.js
git commit -m "feat: getDueCards加入新卡查询, getShiYiDecks拆分new/review统计"
```

---

### Task 2: 修改 routes/decks.js — 透传新字段

**Files:**
- Modify: `code/server/routes/decks.js`

- [ ] **Step 1: 更新响应以透传 `newCards` 和 `reviewCards`**

`/api/decks` 路由已经透传了 `result.decks`（数组），每个 deck 对象已包含新增的 `newCards` 和 `reviewCards` 字段，无需额外改动。确认响应格式：

```js
router.get('/', async (req, res) => {
  try {
    const result = await ankiService.getShiYiDecks();
    res.json({
      decks: result.decks || [],      // 每个 deck 已含 newCards, reviewCards, dueCards, totalCards
      allDeckNames: result.allDecks || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

实际无需修改代码 — ankiService 返回的 deck 对象已自动携带新字段。跳过此任务。

---

### Task 3: 修改 routes/learn.js — 传递 ankiType 到前端

**Files:**
- Modify: `code/server/routes/learn.js`

- [ ] **Step 1: `/api/learn/start` — card 对象增加 `ankiType`**

在第 56-63 行的 card 对象中增加 `ankiType` 字段：

```js
res.json({
  done: false,
  card: {
    cardId: card.cardId,
    word: card.word,
    cardType: card.cardType,
    ankiType: card.type,  // 新增：0=new, 1=learning, 2=review
  },
  scenario,
  totalDue: dueCards.length,
  remaining: dueCards.length - 1,
});
```

- [ ] **Step 2: `/api/learn/next` — card 对象增加 `ankiType`**

在第 216-224 行的 card 对象中增加 `ankiType` 字段：

```js
res.json({
  done: false,
  card: {
    cardId: card.cardId,
    word: card.word,
    cardType: card.cardType,
    ankiType: card.type,  // 新增：0=new, 1=learning, 2=review
  },
  scenario,
  totalDue: dueCards.length,
  remaining: remaining.length - 1,
  progress: sessionService.getProgress(deckId),
});
```

- [ ] **Step 3: 提交**

```bash
git add code/server/routes/learn.js
git commit -m "feat: learn路由传递ankiType字段到前端"
```

---

### Task 4: 修改 DeckSelect.vue — 三项统计展示

**Files:**
- Modify: `code/src/views/DeckSelect.vue`

- [ ] **Step 1: 更新统计行模板**

将第 60-63 行的两行统计改为三行：

```html
<div class="deck-stats">
  <span class="new-cards">🆕 {{ deck.newCards }} 未学</span>
  <span class="review">🔄 {{ deck.reviewCards }} 待复习</span>
  <span class="total">共 {{ deck.totalCards }} 张</span>
</div>
```

- [ ] **Step 2: 提交**

```bash
git add code/src/views/DeckSelect.vue
git commit -m "feat: DeckSelect展示新卡/复习/总数三项统计"
```

---

### Task 5: 修改 LearnView.vue — 卡片状态标签

**Files:**
- Modify: `code/src/views/LearnView.vue`

- [ ] **Step 1: 模板中增加状态标签**

在第 9-10 行（`card-type-badge` 之后，`word` 之前）增加状态标签：

```html
<span class="card-type-badge" :class="currentCard?.cardType">
  {{ cardTypeLabel(currentCard?.cardType) }}
</span>
<span v-if="cardStateLabel(currentCard?.ankiType)" class="card-state-badge" :class="stateClass(currentCard?.ankiType)">
  {{ cardStateLabel(currentCard?.ankiType) }}
</span>
```

- [ ] **Step 2: 在 script 中新增 `cardStateLabel` 和 `stateClass` 函数**

在 `cardTypeLabel` 函数（第 197-199 行）之后添加：

```js
function cardStateLabel(ankiType) {
  if (ankiType === 0) return '🆕 新卡'
  if (ankiType === 2) return '🔄 复习'
  return '' // type=1 (learning) 或 undefined 时不显示
}

function stateClass(ankiType) {
  if (ankiType === 0) return 'state-new'
  if (ankiType === 2) return 'state-review'
  return ''
}
```

- [ ] **Step 3: 提交**

```bash
git add code/src/views/LearnView.vue
git commit -m "feat: LearnView显示卡片状态标签（新卡/复习）"
```

---

### Task 6: 添加 CSS 样式

**Files:**
- Modify: `code/src/style.css`

- [ ] **Step 1: 更新牌组统计样式**

将第 317-320 行的 `.deck-stats .due` 替换为 `.deck-stats .new-cards` 和 `.deck-stats .review`：

```css
.deck-stats .new-cards {
  color: #3b82f6;
  font-weight: 600;
}

.deck-stats .review {
  color: var(--warning);
  font-weight: 600;
}
```

同时删除旧的 `.deck-stats .due` 样式块（第 317-320 行），因为模板中 `due` 类名已不再使用。

- [ ] **Step 2: 添加卡片状态标签样式**

在第 401 行（`.card-type-badge.speak` 之后，`.word` 之前）添加：

```css
.card-state-badge {
  padding: 0.2em 0.6em;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: 600;
}

.card-state-badge.state-new {
  background: #dbeafe;
  color: #1e40af;
}

.card-state-badge.state-review {
  background: #fee2e2;
  color: #991b1b;
}
```

- [ ] **Step 3: 提交**

```bash
git add code/src/style.css
git commit -m "style: 添加卡片状态标签和三项统计的CSS样式"
```

---

### Task 7: 验证 — 启动应用测试

- [ ] **Step 1: 启动后端服务**

```bash
cd "d:/Learn/Qt Learn/shiyi/code" && npm run server
```

确认输出无报错。

- [ ] **Step 2: 启动前端开发服务器**

```bash
cd "d:/Learn/Qt Learn/shiyi/code" && npm run dev
```

- [ ] **Step 3: 验证牌组选择界面**

1. 打开浏览器访问前端地址
2. 检查牌组卡片是否显示三项统计（🆕 N 未学 / 🔄 N 待复习 / 共 N 张）
3. 特别验证：有新卡无复习的牌组，新卡数 > 0，复习 = 0

- [ ] **Step 4: 验证学习界面**

1. 点击进入一个牌组开始学习
2. 检查卡片信息栏是否显示状态标签（🆕 新卡 或 🔄 复习）
3. 完成一张卡片，确认下一张正常加载
4. 验证新卡能被正常回答（Anki 会将 type=0 的新卡转为 learning 状态）

- [ ] **Step 5: 提交（如有修改）**

```bash
git status
# 如有 lint 修复等小改动
git add -A && git commit -m "chore: 验证后的微调"
```
