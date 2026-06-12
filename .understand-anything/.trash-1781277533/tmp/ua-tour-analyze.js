#!/usr/bin/env node
/**
 * Graph Topology Analyzer for Tour Builder
 * Computes entry points, fan-in/fan-out rankings, BFS traversal, clusters, and non-code inventory.
 */

const fs = require('fs');
const path = require('path');

// --- Read input ---
const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node ua-tour-analyze.js <input.json> <output.json>');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (e) {
  console.error('Failed to read input JSON:', e.message);
  process.exit(1);
}

const { nodes, edges, layers } = data;

if (!nodes || !edges) {
  console.error('Input JSON must have "nodes" and "edges" arrays');
  process.exit(1);
}

// --- Build lookup maps ---
const nodeMap = new Map();
nodes.forEach(n => nodeMap.set(n.id, n));

// --- A. Fan-In Ranking ---
const fanIn = new Map();
nodes.forEach(n => fanIn.set(n.id, 0));
edges.forEach(e => {
  if (fanIn.has(e.target)) {
    fanIn.set(e.target, (fanIn.get(e.target) || 0) + 1);
  }
});

const fanInRanking = [...fanIn.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([id, count]) => ({
    id,
    fanIn: count,
    name: nodeMap.get(id)?.name || id
  }));

// --- B. Fan-Out Ranking ---
const fanOut = new Map();
nodes.forEach(n => fanOut.set(n.id, 0));
edges.forEach(e => {
  if (fanOut.has(e.source)) {
    fanOut.set(e.source, (fanOut.get(e.source) || 0) + 1);
  }
});

const fanOutRanking = [...fanOut.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([id, count]) => ({
    id,
    fanOut: count,
    name: nodeMap.get(id)?.name || id
  }));

// --- C. Entry Point Candidates ---
// Determine thresholds for scoring
const fanOutValues = [...fanOut.values()].filter(v => v > 0).sort((a, b) => a - b);
const fanOutTop10Threshold = fanOutValues.length > 0
  ? fanOutValues[Math.max(0, fanOutValues.length - Math.ceil(fanOutValues.length * 0.1))]
  : 0;

const fanInValues = [...fanIn.values()].filter(v => v > 0).sort((a, b) => a - b);
const fanInBottom25Threshold = fanInValues.length > 0
  ? fanInValues[Math.floor(fanInValues.length * 0.25)]
  : 0;

function scoreEntryPoint(node) {
  let score = 0;

  // Code file checks
  if (node.type === 'file') {
    const entryNames = [
      'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
      'server.ts', 'server.js', 'mod.rs', 'main.go', 'main.py', 'main.rs',
      'manage.py', 'app.py', 'wsgi.py', 'asgi.py', 'run.py', '__main__.py',
      'Application.java', 'Main.java', 'Program.cs', 'config.ru', 'index.php',
      'App.swift', 'Application.kt', 'main.cpp', 'main.c'
    ];
    if (entryNames.includes(node.name)) {
      score += 3;
    }
    // At project root or one level deep
    const depth = (node.filePath || '').split('/').filter(Boolean).length;
    if (depth <= 2) {
      score += 1;
    }
    const nodeFanOut = fanOut.get(node.id) || 0;
    if (nodeFanOut >= fanOutTop10Threshold && nodeFanOut > 0) {
      score += 1;
    }
    const nodeFanIn = fanIn.get(node.id) || 0;
    if (nodeFanIn <= fanInBottom25Threshold) {
      score += 1;
    }
  }

  // Documentation checks
  if (node.type === 'document') {
    if (node.filePath === 'code/README.md' || node.name === 'README.md') {
      score += 5;
    } else if (node.name.endsWith('.md') && (node.filePath || '').split('/').length <= 3) {
      score += 2;
    }
  }

  return score;
}

const entryPointCandidates = nodes
  .map(n => ({ id: n.id, score: scoreEntryPoint(n), name: n.name, summary: n.summary }))
  .filter(c => c.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

// Find the top code entry point for BFS (skip documents)
const topCodeEntry = entryPointCandidates.find(c => {
  const n = nodeMap.get(c.id);
  return n && n.type === 'file';
});

// --- D. BFS Traversal ---
const bfsResult = {
  startNode: topCodeEntry ? topCodeEntry.id : null,
  order: [],
  depthMap: {},
  byDepth: {}
};

if (topCodeEntry) {
  const visited = new Set();
  const queue = [{ id: topCodeEntry.id, depth: 0 }];
  visited.add(topCodeEntry.id);

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    bfsResult.order.push(id);
    bfsResult.depthMap[id] = depth;

    if (!bfsResult.byDepth[depth]) {
      bfsResult.byDepth[depth] = [];
    }
    bfsResult.byDepth[depth].push(id);

    // Follow imports and calls edges
    const neighborEdges = edges.filter(
      e => (e.type === 'imports' || e.type === 'calls') && e.source === id
    );

    for (const edge of neighborEdges) {
      if (!visited.has(edge.target) && nodeMap.has(edge.target)) {
        visited.add(edge.target);
        queue.push({ id: edge.target, depth: depth + 1 });
      }
    }
  }
}

// --- E. Non-Code File Inventory ---
const nonCodeFiles = {
  documentation: nodes
    .filter(n => n.type === 'document')
    .map(n => ({ id: n.id, name: n.name, summary: n.summary })),
  infrastructure: nodes
    .filter(n => ['service', 'pipeline', 'resource'].includes(n.type))
    .map(n => ({ id: n.id, name: n.name, type: n.type, summary: n.summary })),
  data: nodes
    .filter(n => ['table', 'schema', 'endpoint'].includes(n.type))
    .map(n => ({ id: n.id, name: n.name, type: n.type, summary: n.summary })),
  config: nodes
    .filter(n => n.type === 'config')
    .map(n => ({ id: n.id, name: n.name, type: n.type, summary: n.summary }))
};

// --- F. Tightly Coupled Clusters ---
// Step 1: Build adjacency map (bidirectional pairs)
const adj = new Map();
nodes.forEach(n => adj.set(n.id, new Set()));

edges.forEach(e => {
  if (adj.has(e.source) && adj.has(e.target)) {
    adj.get(e.source).add(e.target);
    adj.get(e.target).add(e.source);
  }
});

// Step 2: Find bidirectional pairs as cluster seeds
const seeds = [];
const seenPairs = new Set();
for (const [a, neighbors] of adj) {
  for (const b of neighbors) {
    const pairKey = [a, b].sort().join('||');
    if (!seenPairs.has(pairKey) && adj.get(b)?.has(a)) {
      seenPairs.add(pairKey);
      seeds.push(new Set([a, b]));
    }
  }
}

// Step 3: Expand clusters by adding nodes connected to 2+ existing members
const clusters = [];
for (const seed of seeds) {
  let expanded = new Set(seed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [nodeId, neighbors] of adj) {
      if (!expanded.has(nodeId)) {
        let connections = 0;
        for (const member of expanded) {
          if (neighbors.has(member)) connections++;
        }
        if (connections >= 2) {
          expanded.add(nodeId);
          changed = true;
        }
      }
    }
  }
  // Only keep clusters of size 2-5
  if (expanded.size >= 2 && expanded.size <= 5) {
    // Count edges within the cluster
    let edgeCount = 0;
    const clusterSet = expanded;
    for (const e of edges) {
      if (clusterSet.has(e.source) && clusterSet.has(e.target)) edgeCount++;
    }
    clusters.push({ nodes: [...clusterSet], edgeCount, size: clusterSet.size });
  }
}

// Deduplicate: keep largest clusters, remove subsets
clusters.sort((a, b) => b.size - a.size || b.edgeCount - a.edgeCount);
const uniqueClusters = [];
const coveredNodes = new Set();
for (const c of clusters) {
  const overlap = c.nodes.filter(n => coveredNodes.has(n)).length;
  if (overlap < c.nodes.length * 0.5 || uniqueClusters.length < 3) {
    uniqueClusters.push({ nodes: c.nodes, edgeCount: c.edgeCount });
    c.nodes.forEach(n => coveredNodes.add(n));
  }
}

const topClusters = uniqueClusters.slice(0, 10);

// --- G. Layer List ---
const layerInfo = {
  count: (layers || []).length,
  list: (layers || []).map(l => ({ id: l.id, name: l.name, description: l.description }))
};

// --- H. Node Summary Index ---
const nodeSummaryIndex = {};
nodes.forEach(n => {
  nodeSummaryIndex[n.id] = { name: n.name, type: n.type, summary: n.summary };
});

// --- Assemble output ---
const output = {
  scriptCompleted: true,
  entryPointCandidates,
  fanInRanking,
  fanOutRanking,
  bfsTraversal: bfsResult,
  nonCodeFiles,
  clusters: topClusters,
  layers: layerInfo,
  nodeSummaryIndex,
  totalNodes: nodes.length,
  totalEdges: edges.length
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
console.log('Analysis complete. Results written to:', outputPath);
console.log('Total nodes:', nodes.length);
console.log('Total edges:', edges.length);
console.log('Top entry points:');
entryPointCandidates.forEach(c => console.log(`  ${c.id} (score: ${c.score})`));
