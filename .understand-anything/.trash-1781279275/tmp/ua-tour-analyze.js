#!/usr/bin/env node

const fs = require('fs');

// Read input
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
  console.error('Failed to read input file:', e.message);
  process.exit(1);
}

const { nodes, edges, layers } = data;
if (!nodes || !edges) {
  console.error('Input must contain nodes and edges arrays');
  process.exit(1);
}

// ============================================================
// A. Fan-In Ranking (how many edges point TO this node)
// ============================================================
const fanIn = {};
nodes.forEach(n => { fanIn[n.id] = 0; });
edges.forEach(e => {
  if (fanIn[e.target] !== undefined) {
    fanIn[e.target]++;
  }
});
const fanInRanking = Object.entries(fanIn)
  .map(([id, count]) => ({ id, fanIn: count, name: (nodes.find(n => n.id === id) || {}).name }))
  .sort((a, b) => b.fanIn - a.fanIn)
  .slice(0, 20);

// ============================================================
// B. Fan-Out Ranking (how many edges point FROM this node)
// ============================================================
const fanOut = {};
nodes.forEach(n => { fanOut[n.id] = 0; });
edges.forEach(e => {
  if (fanOut[e.source] !== undefined) {
    fanOut[e.source]++;
  }
});
const fanOutRanking = Object.entries(fanOut)
  .map(([id, count]) => ({ id, fanOut: count, name: (nodes.find(n => n.id === id) || {}).name }))
  .sort((a, b) => b.fanOut - a.fanOut)
  .slice(0, 20);

// ============================================================
// C. Entry Point Candidates
// ============================================================
const entryNames = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
  'server.ts', 'server.js', 'mod.rs', 'main.go', 'main.py', 'main.rs',
  'manage.py', 'app.py', 'wsgi.py', 'asgi.py', 'run.py', '__main__.py',
  'Application.java', 'Main.java', 'Program.cs', 'config.ru', 'index.php',
  'App.swift', 'Application.kt', 'main.cpp', 'main.c'];

const fanOutValues = Object.values(fanOut).sort((a, b) => a - b);
const fanOutTop10Threshold = fanOutValues[Math.floor(fanOutValues.length * 0.9)] || 0;
const fanInValues = Object.values(fanIn).sort((a, b) => a - b);
const fanInBottom25Threshold = fanInValues[Math.floor(fanInValues.length * 0.25)] || 0;

function scoreNode(node) {
  let score = 0;
  const fn = node.filePath || '';
  const name = node.name || '';

  // Code file scoring
  if (node.type === 'file') {
    // Filename match with entry names
    const nameLC = name.toLowerCase();
    for (const en of entryNames) {
      if (nameLC === en.toLowerCase()) {
        score += 3;
        break;
      }
    }

    // At project root or one level deep
    const parts = fn.replace(/\\/g, '/').split('/');
    const depth = parts.length;
    if (depth <= 2) {
      score += 1;
    }

    // High fan-out (top 10%)
    if (fanOut[node.id] >= fanOutTop10Threshold && fanOut[node.id] > 0) {
      score += 1;
    }

    // Low fan-in (bottom 25%)
    if (fanIn[node.id] <= fanInBottom25Threshold) {
      score += 1;
    }
  }

  // Documentation file scoring
  if (node.type === 'document') {
    if (name === 'README.md') {
      score += 5;
    }
    // Check if it's at root level
    const parts = fn.replace(/\\/g, '/').split('/');
    if (parts.length <= 2 && name.endsWith('.md')) {
      score += 2;
    }
  }

  return score;
}

const scoredEntries = nodes.map(n => ({
  id: n.id,
  score: scoreNode(n),
  name: n.name,
  summary: n.summary
}))
  .filter(e => e.score > 0)
  .sort((a, b) => b.score - a.fanIn)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

// ============================================================
// D. BFS Traversal from top code entry point
// ============================================================
// Find top code entry point (type: file, not document)
const topCodeEntry = scoredEntries.find(e => {
  const node = nodes.find(n => n.id === e.id);
  return node && node.type === 'file';
});

const bfsTraversal = {
  startNode: null,
  order: [],
  depthMap: {},
  byDepth: {}
};

if (topCodeEntry) {
  bfsTraversal.startNode = topCodeEntry.id;

  // Build adjacency (forward: imports, calls, depends_on)
  const adj = {};
  nodes.forEach(n => { adj[n.id] = []; });
  edges.forEach(e => {
    if (e.type === 'imports' || e.type === 'calls' || e.type === 'depends_on') {
      if (adj[e.source]) {
        adj[e.source].push(e.target);
      }
    }
  });

  // BFS
  const visited = new Set();
  const queue = [{ id: topCodeEntry.id, depth: 0 }];
  visited.add(topCodeEntry.id);

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    bfsTraversal.order.push(id);
    bfsTraversal.depthMap[id] = depth;
    if (!bfsTraversal.byDepth[depth]) bfsTraversal.byDepth[depth] = [];
    bfsTraversal.byDepth[depth].push(id);

    const neighbors = adj[id] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }
}

// ============================================================
// E. Non-Code File Inventory
// ============================================================
const nonCodeFiles = {
  documentation: [],
  infrastructure: [],
  data: [],
  config: []
};

const docTypes = ['document'];
const infraTypes = ['service', 'pipeline', 'resource'];
const dataTypes = ['table', 'schema', 'endpoint'];
const configTypes = ['config'];

nodes.forEach(n => {
  const entry = { id: n.id, name: n.name, summary: n.summary };
  if (docTypes.includes(n.type)) {
    nonCodeFiles.documentation.push(entry);
  } else if (infraTypes.includes(n.type)) {
    nonCodeFiles.infrastructure.push(entry);
  } else if (dataTypes.includes(n.type)) {
    nonCodeFiles.data.push(entry);
  } else if (configTypes.includes(n.type)) {
    nonCodeFiles.config.push(entry);
  }
});

// ============================================================
// F. Tightly Coupled Clusters
// ============================================================
// Build bidirectional edge map
const bidirectional = new Set();
const adjMap = new Map();
nodes.forEach(n => adjMap.set(n.id, new Set()));

edges.forEach(e => {
  adjMap.get(e.source)?.add(e.target);
});

// Find bidirectional pairs
nodes.forEach(a => {
  nodes.forEach(b => {
    if (a.id < b.id) {
      const aToB = adjMap.get(a.id)?.has(b.id) || false;
      const bToA = adjMap.get(b.id)?.has(a.id) || false;
      if (aToB && bToA) {
        bidirectional.add(`${a.id}|||${b.id}`);
      }
    }
  });
});

// Expand into clusters (greedy: merge overlapping pairs)
const clusters = [];
const used = new Set();

for (const pair of bidirectional) {
  const [a, b] = pair.split('|||');
  if (used.has(a) && used.has(b)) continue;

  // Find existing cluster
  let found = null;
  for (const c of clusters) {
    if (c.has(a) || c.has(b)) {
      found = c;
      break;
    }
  }

  if (found) {
    found.add(a);
    found.add(b);
    used.add(a);
    used.add(b);
  } else {
    const newCluster = new Set([a, b]);
    clusters.push(newCluster);
    used.add(a);
    used.add(b);
  }
}

// Expand: add nodes that connect to 2+ existing cluster members
for (const cluster of clusters) {
  let expanded = true;
  while (expanded && cluster.size < 5) {
    expanded = false;
    for (const n of nodes) {
      if (cluster.has(n.id)) continue;
      let connections = 0;
      for (const member of cluster) {
        if (adjMap.get(n.id)?.has(member) || adjMap.get(member)?.has(n.id)) {
          connections++;
        }
      }
      if (connections >= 2) {
        cluster.add(n.id);
        expanded = true;
      }
    }
  }
}

const clusterOutput = clusters
  .filter(c => c.size >= 2)
  .map(c => {
    const members = Array.from(c);
    let edgeCount = 0;
    for (const a of members) {
      for (const b of members) {
        if (a < b && (adjMap.get(a)?.has(b) || adjMap.get(b)?.has(a))) {
          edgeCount++;
        }
      }
    }
    return { nodes: members.slice(0, 5), edgeCount };
  })
  .sort((a, b) => b.edgeCount - a.edgeCount)
  .slice(0, 10);

// ============================================================
// G. Layer List
// ============================================================
const layersOutput = {
  count: layers.length,
  list: layers.map(l => ({ id: l.id, name: l.name, description: l.description }))
};

// ============================================================
// H. Node Summary Index
// ============================================================
const nodeSummaryIndex = {};
nodes.forEach(n => {
  nodeSummaryIndex[n.id] = {
    name: n.name,
    type: n.type,
    summary: n.summary
  };
});

// ============================================================
// Output
// ============================================================
const output = {
  scriptCompleted: true,
  entryPointCandidates: scoredEntries,
  fanInRanking,
  fanOutRanking,
  bfsTraversal,
  nonCodeFiles,
  clusters: clusterOutput,
  layers: layersOutput,
  nodeSummaryIndex,
  totalNodes: nodes.length,
  totalEdges: edges.length
};

try {
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log('Analysis complete. Output written to', outputPath);
  console.log('Nodes:', nodes.length, 'Edges:', edges.length);
  console.log('Entry candidates:', scoredEntries.length);
  console.log('BFS order length:', bfsTraversal.order.length);
  console.log('Clusters:', clusterOutput.length);
} catch (e) {
  console.error('Failed to write output:', e.message);
  process.exit(1);
}
