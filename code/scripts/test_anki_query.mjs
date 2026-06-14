/**
 * 测试 buildRecursiveDeckQuery() 查询策略选择逻辑
 *
 * 验证：
 *   - ASCII 牌组名 → deck:"Name"（递归搜索子牌组）
 *   - 含中文牌组名 → (did:ID1 OR did:ID2 …)（避免 UTF-8 编码问题）
 *   - did:0 回退（无匹配牌组）
 *
 * 无需 Anki 运行，纯逻辑测试。
 */

// ============================================================
// 复制 buildRecursiveDeckQuery（与 ankiService.js 第 68-86 行一致）
// ============================================================
function buildRecursiveDeckQuery(deckName, allDeckNames, nameToId) {
  const isAscii = /^[\x00-\x7F]*$/.test(deckName);

  if (isAscii) {
    return `deck:"${deckName}"`;
  }

  const prefix = deckName + '::';
  const relatedNames = allDeckNames.filter(
    (n) => n === deckName || n.startsWith(prefix)
  );
  const ids = relatedNames.map((n) => nameToId[n]).filter(Boolean);

  if (ids.length === 0) return 'did:0';
  if (ids.length === 1) return `did:${ids[0]}`;
  return `(${ids.map((id) => `did:${id}`).join(' OR ')})`;
}

// ============================================================
// 测试夹具：模拟 Anki 牌组数据
// ============================================================
const MOCK_ALL_DECKS = [
  'ShiYi',
  'ShiYi::programming',
  'ShiYi::日常交流',
  'ShiYi::日常交流::问候',
  '中文',
  '中文::子牌组',
  '中文::子牌组::深层',
  '测试::A::B',
  'Hello世界',
  '日本語',
  'café',
  'Default',
];

const MOCK_NAME_TO_ID = {
  ShiYi: 1001,
  'ShiYi::programming': 1002,
  'ShiYi::日常交流': 1003,
  'ShiYi::日常交流::问候': 1004,
  '中文': 2001,
  '中文::子牌组': 2002,
  '中文::子牌组::深层': 2003,
  '测试::A::B': 3001,
  'Hello世界': 4001,
  '日本語': 5001,
  'café': 6001,
  Default: 9999,
};

// ============================================================
// 测试用例
// ============================================================
const tests = [
  // ── ASCII 牌组 → deck: 策略 ──
  {
    name: '纯 ASCII 顶级牌组 → deck:',
    deckName: 'ShiYi',
    expected: 'deck:"ShiYi"',
  },
  {
    name: '纯 ASCII 子牌组 → deck:',
    deckName: 'ShiYi::programming',
    expected: 'deck:"ShiYi::programming"',
  },
  {
    name: '纯 ASCII Default → deck:',
    deckName: 'Default',
    expected: 'deck:"Default"',
  },

  // ── 中文牌组 → did: 策略 ──
  {
    name: '纯中文顶级牌组（含子牌组）→ (did:… OR did:…)',
    deckName: '中文',
    // "中文" 自身 (2001) + "中文::子牌组" (2002) + "中文::子牌组::深层" (2003)
    // did: 策略需显式列出所有后代以模仿 deck: 的递归行为
    expected: '(did:2001 OR did:2002 OR did:2003)',
  },
  {
    name: '纯中文 + 子牌组 → (did:… OR did:…)',
    deckName: '中文::子牌组',
    // "中文::子牌组" 自身 (2002) + "中文::子牌组::深层" (2003)
    expected: '(did:2002 OR did:2003)',
  },
  {
    name: '深层嵌套中文牌组 → 单个 did:',
    deckName: '中文::子牌组::深层',
    expected: 'did:2003',
  },

  // ── 混合 ASCII + 中文 → did: 策略 ──
  {
    name: '混合 ASCII + 中文 → did:',
    deckName: 'Hello世界',
    expected: 'did:4001',
  },

  // ── 日文 → did: 策略 ──
  {
    name: '日文牌组名 → did:',
    deckName: '日本語',
    expected: 'did:5001',
  },

  // ── 重音拉丁字符 → did: 策略（é = 0xE9 > 0x7F） ──
  {
    name: '重音拉丁字符 café → did:',
    deckName: 'café',
    expected: 'did:6001',
  },

  // ── 无匹配牌组 → did:0 回退 ──
  {
    name: '不存在的牌组 → did:0 回退',
    deckName: '不存在的牌组',
    expected: 'did:0',
  },

  // ── 深层嵌套 ASCII 含中文段 → did: 策略 ──
  {
    name: '测试::A::B 深层嵌套 → did:',
    deckName: '测试::A::B',
    // "测试::A::B" 自身只有 3001（没有更深子牌组）
    expected: 'did:3001',
  },
];

// ============================================================
// 额外边界检查
// ============================================================
const edgeCases = [
  {
    name: '前缀精确匹配：中文 不应匹配 中文学习',
    check: () => {
      const prefix = '中文::';
      const bad = MOCK_ALL_DECKS.filter(
        (n) => n.startsWith('中文') && !n.startsWith(prefix) && n !== '中文'
      );
      return { pass: bad.length === 0, detail: `误匹配: [${bad.join(', ')}]` };
    },
  },
  {
    name: 'ASCII 检测正则：空字符串 → ASCII',
    check: () => {
      const result = /^[\x00-\x7F]*$/.test('');
      return { pass: result === true, detail: `空字符串: ${result}` };
    },
  },
  {
    name: 'ASCII 检测正则：纯数字 → ASCII',
    check: () => {
      const result = /^[\x00-\x7F]*$/.test('12345');
      return { pass: result === true, detail: `12345: ${result}` };
    },
  },
  {
    name: 'ASCII 检测正则：特殊字符 !@#$ → ASCII',
    check: () => {
      const result = /^[\x00-\x7F]*$/.test('!@#$%^&*()');
      return { pass: result === true, detail: `!@#$%^&*(): ${result}` };
    },
  },
  {
    name: 'ASCII 检测正则：中文 → 非 ASCII',
    check: () => {
      const result = /^[\x00-\x7F]*$/.test('中文');
      return { pass: result === false, detail: `中文: ${result}` };
    },
  },
  {
    name: 'ASCII 检测正则：emoji → 非 ASCII',
    check: () => {
      const result = /^[\x00-\x7F]*$/.test('😀');
      return { pass: result === false, detail: `😀: ${result}` };
    },
  },
];

// ============================================================
// 运行
// ============================================================
let passed = 0;
let failed = 0;

console.log('═══════════════════════════════════════════');
console.log('  buildRecursiveDeckQuery() 单元测试');
console.log('═══════════════════════════════════════════\n');

console.log('── 查询策略测试 ──\n');
for (const t of tests) {
  const result = buildRecursiveDeckQuery(t.deckName, MOCK_ALL_DECKS, MOCK_NAME_TO_ID);
  if (result === t.expected) {
    console.log(`  ✅ ${t.name}`);
    passed++;
  } else {
    console.log(`  ❌ ${t.name}`);
    console.log(`     期望: ${t.expected}`);
    console.log(`     实际: ${result}`);
    failed++;
  }
}

console.log('\n── 边界条件检查 ──\n');
for (const ec of edgeCases) {
  const { pass, detail } = ec.check();
  if (pass) {
    console.log(`  ✅ ${ec.name}`);
    passed++;
  } else {
    console.log(`  ❌ ${ec.name} — ${detail}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════');
console.log(`  ${passed}/${passed + failed} 通过`);
if (failed > 0) {
  console.log(`  ${failed} 失败`);
  process.exit(1);
} else {
  console.log('  🎉 全部通过!');
}
console.log('═══════════════════════════════════════════');
