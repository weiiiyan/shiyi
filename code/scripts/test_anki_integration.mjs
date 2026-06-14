/**
 * Anki-Connect 集成测试：验证 deck: vs did: 查询策略
 *
 * 测试目标：
 *   1. 确认 Windows Anki-Connect 对中文牌组名的 deck: 查询是否存在 UTF-8 编码问题
 *   2. 对比 deck: 与 did: 策略的查询结果是否一致
 *   3. 验证 buildRecursiveDeckQuery() 在实际 Anki 环境中的行为
 *
 * 前置条件：
 *   - Anki 正在运行，Anki-Connect 插件已安装
 *   - 默认连接 http://localhost:8765（可通过 ANKI_CONNECT_URL 环境变量覆盖）
 *
 * 用法：
 *   node test_anki_integration.mjs
 */

const ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL || 'http://localhost:8765';

// ============================================================
// Anki-Connect 调用封装
// ============================================================
async function invoke(action, params = {}) {
  const response = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Anki-Connect error [${action}]: ${data.error}`);
  }

  return data.result;
}

// ============================================================
// 复制 buildRecursiveDeckQuery（与 ankiService.js 一致）
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
// 报告工具
// ============================================================
const results = [];

function report(deckName, ascii, deckQuery, didQuery, deckResult, didResult, error) {
  const isAscii = ascii ? 'ASCII' : '非ASCII';
  const deckOk = error ? 'ERR' : `${deckResult.length} 张卡片`;
  const didOk = `${didResult.length} 张卡片`;
  const match = !error && setsEqual(deckResult, didResult) ? '✅ 一致' : '⚠️ 不一致';

  results.push({
    deckName,
    isAscii,
    deckQuery,
    didQuery,
    deckCount: deckResult.length,
    didCount: didResult.length,
    match: !error && setsEqual(deckResult, didResult),
    error: error || null,
  });

  console.log(`  ${match} | ${isAscii} | ${deckName}`);
  console.log(`    deck: ${deckQuery} → ${deckOk}`);
  if (error) {
    console.log(`          ⚡ 错误: ${error}`);
  }
  console.log(`    did:  ${didQuery} → ${didOk}`);
  console.log();
}

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Anki-Connect 集成测试');
  console.log('  deck: vs did: 查询策略对比');
  console.log('═══════════════════════════════════════════════\n');

  // 1. 检查 Anki-Connect 是否可用
  console.log('── 1. 检查 Anki-Connect 连接 ──');
  try {
    const version = await invoke('version');
    console.log(`  ✅ Anki-Connect v${version} 已连接\n`);
  } catch (err) {
    console.log(`  ❌ 无法连接 Anki-Connect: ${err.message}`);
    console.log('  请确保 Anki 正在运行且 Anki-Connect 插件已安装。\n');
    process.exit(1);
  }

  // 2. 获取牌组数据
  console.log('── 2. 获取牌组映射 ──');
  const allDecks = await invoke('deckNames');
  const deckMapping = await invoke('deckNamesAndIds');

  const nameToId = {};
  for (const [name, id] of Object.entries(deckMapping)) {
    nameToId[name] = id;
  }

  console.log(`  ${allDecks.length} 个牌组\n`);

  // 3. 筛选测试目标：ShiYi 相关牌组 + 手动找含中文的牌组
  const shiYiDecks = allDecks.filter(
    (d) => d === 'ShiYi' || d.startsWith('ShiYi::')
  );

  // 也测试非 ShiYi 的牌组，只要包含中文
  const otherChineseDecks = allDecks.filter((d) => {
    if (shiYiDecks.includes(d)) return false;
    return !/^[\x00-\x7F]*$/.test(d);
  });

  const testDecks = [...shiYiDecks, ...otherChineseDecks];

  if (testDecks.length === 0) {
    console.log('── 结果 ──');
    console.log('  ⚠️ 未找到 ShiYi 牌组或含中文的牌组。');
    console.log('  请先在 Anki 中创建 ShiYi 牌组体系，或创建含中文名的测试牌组。');
    console.log();
    console.log('  手动测试步骤：');
    console.log('  1. 在 Anki 中创建牌组 "测试牌组"');
    console.log('  2. 创建子牌组 "测试牌组::子牌组"');
    console.log('  3. 各添加几张卡片');
    console.log('  4. 重新运行本脚本');
    process.exit(0);
  }

  console.log(`── 3. 测试 ${testDecks.length} 个牌组 ──`);
  console.log(`   ShiYi 牌组: ${shiYiDecks.length} 个`);
  console.log(`   其他含中文牌组: ${otherChineseDecks.length} 个`);
  console.log();

  // 4. 逐个牌组对比测试
  console.log('── 4. 逐牌组对比 deck: vs did: ──\n');

  for (const deckName of testDecks) {
    const isAscii = /^[\x00-\x7F]*$/.test(deckName);

    // 构建两种查询
    const deckQuery = `deck:"${deckName}"`;
    const didQuery = buildRecursiveDeckQuery(deckName, allDecks, nameToId);

    // 执行 deck: 查询
    let deckCards = [];
    let deckError = null;
    try {
      deckCards = await invoke('findCards', { query: deckQuery });
    } catch (err) {
      deckError = err.message;
    }

    // 执行 did: 查询
    let didCards = [];
    let didError = null;
    try {
      didCards = await invoke('findCards', { query: didQuery });
    } catch (err) {
      didError = err.message;
    }

    report(deckName, isAscii, deckQuery, didQuery, deckCards, didCards, deckError || didError);
  }

  // 5. 汇总
  console.log('═══════════════════════════════════════════════');
  console.log('  测试汇总');
  console.log('═══════════════════════════════════════════════\n');

  const asciiDecks = results.filter((r) => r.isAscii === 'ASCII');
  const nonAsciiDecks = results.filter((r) => r.isAscii === '非ASCII');

  console.log(`ASCII 牌组 (${asciiDecks.length} 个):`);
  for (const r of asciiDecks) {
    const status = r.match ? '✅' : '⚠️';
    console.log(`  ${status} ${r.deckName}: deck=${r.deckCount} did=${r.didCount}`);
  }

  console.log(`\n非 ASCII 牌组 (${nonAsciiDecks.length} 个):`);
  for (const r of nonAsciiDecks) {
    const status = r.match ? '✅' : '⚠️';
    const err = r.error ? ` [错误: ${r.error}]` : '';
    console.log(`  ${status} ${r.deckName}: deck=${r.deckCount} did=${r.didCount}${err}`);
  }

  // 6. 结论
  console.log('\n── 结论 ──');
  const allMatch = results.every((r) => r.match);
  const asciiAllMatch = asciiDecks.every((r) => r.match);
  const nonAsciiHasError = nonAsciiDecks.some((r) => r.error);
  const nonAsciiMismatch = nonAsciiDecks.some((r) => !r.match && !r.error);

  if (asciiAllMatch) {
    console.log('  ✅ ASCII 牌组: deck: 与 did: 结果完全一致');
  } else {
    console.log('  ⚠️ ASCII 牌组: 存在不一致（需排查）');
  }

  if (nonAsciiHasError) {
    console.log('  ⚡ 确认: Windows Anki-Connect 对含中文牌组名的 deck: 查询存在 UTF-8 编码问题');
    console.log('     did: 策略是有效的 workaround');
  } else if (nonAsciiMismatch) {
    console.log('  ⚠️ 非 ASCII 牌组: deck: 与 did: 结果不一致（但无错误），需进一步分析');
  } else if (nonAsciiDecks.length > 0) {
    console.log('  ℹ️ 非 ASCII 牌组: deck: 查询在此环境下工作正常');
    console.log('     当前 Anki-Connect 版本可能已修复 UTF-8 编码问题');
    console.log('     但保留 did: 策略作为向后兼容是安全的');
  }

  if (allMatch) {
    console.log('\n  🎉 所有牌组的 deck: 与 did: 查询结果完全一致');
  }

  console.log();
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
