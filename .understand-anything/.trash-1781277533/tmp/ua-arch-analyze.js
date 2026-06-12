#!/usr/bin/env node
/**
 * Phase 1 — Structural Analysis Script
 * Reads ua-arch-input.json, computes structural patterns, writes ua-arch-results.json
 */

const fs = require('fs');
const path = require('path');

// ── Parse args ──────────────────────────────────────────────────────────────
const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
  console.error('Usage: node ua-arch-analyze.js <input.json> <output.json>');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
} catch (e) {
  console.error('Failed to read/parse input file:', e.message);
  process.exit(1);
}

const { fileNodes, importEdges, allEdges } = data;

// ── Helper: extract file-level node IDs only (files, not functions) ──────────
// Function nodes are sub-file; we handle them separately.
// For directory grouping, we only group file-type nodes (non-function).
const fileLevelNodes = fileNodes.filter(n => n.type === 'file' || n.type === 'config' || n.type === 'document' || n.type === 'service' || n.type === 'pipeline' || n.type === 'table' || n.type === 'schema' || n.type === 'resource' || n.type === 'endpoint');
const functionNodes = fileNodes.filter(n => n.type === 'function');

// All node IDs for verification
const allNodeIds = new Set(fileNodes.map(n => n.id));

// ── A. Directory Grouping ────────────────────────────────────────────────────

// Determine common path prefix across all file-level nodes
function commonPrefix(paths) {
  if (paths.length === 0) return '';
  let prefix = paths[0];
  for (let i = 1; i < paths.length; i++) {
    while (!paths[i].startsWith(prefix)) {
      prefix = prefix.substring(0, prefix.lastIndexOf('/'));
      if (prefix === '') return '';
    }
  }
  // Strip to the last / to get the common directory prefix
  const lastSlash = prefix.lastIndexOf('/');
  return lastSlash >= 0 ? prefix.substring(0, lastSlash + 1) : '';
}

const filePaths = fileLevelNodes.map(n => n.filePath);
const commonPrefixStr = commonPrefix(filePaths);

function getGroupKey(filePath, commonPrefix) {
  let relative = filePath;
  if (commonPrefix && filePath.startsWith(commonPrefix)) {
    relative = filePath.substring(commonPrefix.length);
  }
  const segments = relative.split('/').filter(s => s.length > 0);
  return segments.length > 0 ? segments[0] : 'root';
}

const directoryGroups = {};
for (const node of fileLevelNodes) {
  const key = getGroupKey(node.filePath, commonPrefixStr);
  if (!directoryGroups[key]) directoryGroups[key] = [];
  directoryGroups[key].push(node.id);
}

// ── B. Node Type Grouping ────────────────────────────────────────────────────
const nodeTypeGroups = {};
for (const node of fileNodes) {
  if (!nodeTypeGroups[node.type]) nodeTypeGroups[node.type] = [];
  nodeTypeGroups[node.type].push(node.id);
}

// ── C. Import Adjacency Matrix ───────────────────────────────────────────────
const fileFanIn = {};
const fileFanOut = {};

for (const node of fileNodes) {
  fileFanIn[node.id] = 0;
  fileFanOut[node.id] = 0;
}

// Only count import edges between file-level nodes (not function nodes)
// Build adjacency list for directory groups
const groupAdjList = {}; // fromDir -> { toDir: count }

for (const edge of importEdges) {
  const src = edge.source;
  const tgt = edge.target;

  // Fan-out for source
  if (fileFanOut.hasOwnProperty(src)) fileFanOut[src]++;
  // Fan-in for target
  if (fileFanIn.hasOwnProperty(tgt)) fileFanIn[tgt]++;

  // Group-level
  const srcNode = fileLevelNodes.find(n => n.id === src);
  const tgtNode = fileLevelNodes.find(n => n.id === tgt);
  if (srcNode && tgtNode) {
    const fromGroup = getGroupKey(srcNode.filePath, commonPrefixStr);
    const toGroup = getGroupKey(tgtNode.filePath, commonPrefixStr);
    if (!groupAdjList[fromGroup]) groupAdjList[fromGroup] = {};
    if (!groupAdjList[fromGroup][toGroup]) groupAdjList[fromGroup][toGroup] = 0;
    groupAdjList[fromGroup][toGroup]++;
  }
}

// ── D. Cross-Category Dependency Analysis ────────────────────────────────────
const crossCategoryEdges = [];

const typeEdgeMap = {}; // "fromType|toType|edgeType" -> count

for (const edge of allEdges) {
  const srcNode = fileNodes.find(n => n.id === edge.source);
  const tgtNode = fileNodes.find(n => n.id === edge.target);
  if (!srcNode || !tgtNode) continue;

  // Only count edges between different node types (cross-category)
  if (srcNode.type === tgtNode.type) continue;

  const key = `${srcNode.type}|${tgtNode.type}|${edge.type}`;
  if (!typeEdgeMap[key]) typeEdgeMap[key] = 0;
  typeEdgeMap[key]++;
}

for (const [key, count] of Object.entries(typeEdgeMap)) {
  const [fromType, toType, edgeType] = key.split('|');
  crossCategoryEdges.push({ fromType, toType, edgeType, count });
}

// ── E. Inter-Group Import Frequency ──────────────────────────────────────────
const interGroupImports = [];
for (const [from, targets] of Object.entries(groupAdjList)) {
  for (const [to, count] of Object.entries(targets)) {
    interGroupImports.push({ from, to, count });
  }
}

// ── F. Intra-Group Import Density ────────────────────────────────────────────
const intraGroupDensity = {};

for (const [group, nodeIds] of Object.entries(directoryGroups)) {
  let internalEdges = 0;
  let totalEdges = 0;

  outLoop:
  for (const edge of importEdges) {
    const srcNode = fileLevelNodes.find(n => n.id === edge.source);
    const tgtNode = fileLevelNodes.find(n => n.id === edge.target);
    if (!srcNode || !tgtNode) continue;

    const srcGroup = getGroupKey(srcNode.filePath, commonPrefixStr);
    const tgtGroup = getGroupKey(tgtNode.filePath, commonPrefixStr);

    if (srcGroup === group || tgtGroup === group) {
      totalEdges++;
      if (srcGroup === group && tgtGroup === group) {
        internalEdges++;
      }
    }
  }

  intraGroupDensity[group] = {
    internalEdges,
    totalEdges,
    density: totalEdges > 0 ? internalEdges / totalEdges : 0
  };
}

// ── G. Directory Pattern Matching ────────────────────────────────────────────
const patternMap = {
  'routes': 'api', 'api': 'api', 'controllers': 'api', 'endpoints': 'api', 'handlers': 'api',
  'services': 'service', 'core': 'service', 'lib': 'service', 'domain': 'service', 'logic': 'service',
  'models': 'data', 'db': 'data', 'data': 'data', 'persistence': 'data', 'repository': 'data', 'entities': 'data', 'migrations': 'data',
  'components': 'ui', 'views': 'ui', 'pages': 'ui', 'ui': 'ui', 'layouts': 'ui', 'screens': 'ui',
  'middleware': 'middleware', 'plugins': 'middleware', 'interceptors': 'middleware', 'guards': 'middleware',
  'utils': 'utility', 'helpers': 'utility', 'common': 'utility', 'shared': 'utility', 'tools': 'utility',
  'config': 'config', 'constants': 'config', 'env': 'config', 'settings': 'config',
  '__tests__': 'test', 'test': 'test', 'tests': 'test', 'spec': 'test', 'specs': 'test',
  'types': 'types', 'interfaces': 'types', 'schemas': 'types', 'contracts': 'types', 'dtos': 'types',
  'hooks': 'hooks',
  'store': 'state', 'state': 'state', 'reducers': 'state', 'actions': 'state', 'slices': 'state',
  'assets': 'assets', 'static': 'assets', 'public': 'assets',
  'management': 'config', 'commands': 'config',
  'templatetags': 'utility',
  'signals': 'service',
  'serializers': 'api',
  'cmd': 'entry',
  'internal': 'service',
  'pkg': 'utility',
  'composables': 'service',
  'blueprints': 'api',
  'mailers': 'service', 'jobs': 'service', 'channels': 'service',
  'bin': 'entry',
  'docs': 'documentation', 'documentation': 'documentation', 'wiki': 'documentation',
  'deploy': 'infrastructure', 'deployment': 'infrastructure', 'infra': 'infrastructure', 'infrastructure': 'infrastructure',
  'docker': 'infrastructure',
  'sql': 'data', 'database': 'data', 'schema': 'data',
  'server': 'service',
  'src': 'service',
  'code': 'root',
  'doc': 'documentation',
};

const fileLevelPatterns = [
  { pattern: /\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/, label: 'test' },
  { pattern: /test_[\w-]+\.(py|rb|php)$/, label: 'test' },
  { pattern: /_test\.go$/, label: 'test' },
  { pattern: /Test\.java$/, label: 'test' },
  { pattern: /Test\.cs$/, label: 'test' },
  { pattern: /\.d\.ts$/, label: 'types' },
  { pattern: /index\.(ts|js|mjs)$/, label: 'entry' },
  { pattern: /^main\.(go|rs)$/, label: 'entry' },
  { pattern: /^lib\.rs$/, label: 'entry' },
  { pattern: /Dockerfile/, label: 'infrastructure' },
  { pattern: /docker-compose/, label: 'infrastructure' },
  { pattern: /\.tf$/, label: 'infrastructure' },
  { pattern: /\.tfvars$/, label: 'infrastructure' },
  { pattern: /Jenkinsfile/, label: 'ci-cd' },
  { pattern: /\.sql$/, label: 'data' },
  { pattern: /\.(graphql|gql|proto)$/, label: 'types' },
  { pattern: /\.(md|rst)$/, label: 'documentation' },
  { pattern: /Makefile/, label: 'infrastructure' },
  { pattern: /vite\.config\.(js|ts|mjs)$/, label: 'config' },
  { pattern: /package\.json$/, label: 'config' },
  { pattern: /tsconfig/, label: 'config' },
  { pattern: /\.env/, label: 'config' },
];

const patternMatches = {};
for (const [group, nodeIds] of Object.entries(directoryGroups)) {
  // Try directory name match first
  if (patternMap[group]) {
    patternMatches[group] = patternMap[group];
  } else {
    // Try file-level pattern match on representative files
    for (const nodeId of nodeIds) {
      const node = fileLevelNodes.find(n => n.id === nodeId);
      if (!node) continue;
      const fileName = node.name;
      for (const { pattern, label } of fileLevelPatterns) {
        if (pattern.test(fileName)) {
          patternMatches[group] = label;
          break;
        }
      }
      if (patternMatches[group]) break;
    }
  }
  if (!patternMatches[group]) {
    patternMatches[group] = 'utility'; // default
  }
}

// ── H. Deployment Topology Detection ─────────────────────────────────────────
const deploymentTopology = {
  hasDockerfile: false,
  hasCompose: false,
  hasK8s: false,
  hasTerraform: false,
  hasCI: false,
  infraFiles: []
};

for (const node of fileNodes) {
  const name = node.name || '';
  const fp = node.filePath || '';

  if (name.includes('Dockerfile') || fp.includes('Dockerfile')) {
    deploymentTopology.hasDockerfile = true;
    deploymentTopology.infraFiles.push(node.filePath);
  }
  if (name.includes('docker-compose') || fp.includes('docker-compose')) {
    deploymentTopology.hasCompose = true;
    deploymentTopology.infraFiles.push(node.filePath);
  }
  if (fp.includes('.github/workflows') || name === '.gitlab-ci.yml' || name === 'Jenkinsfile') {
    deploymentTopology.hasCI = true;
    deploymentTopology.infraFiles.push(node.filePath);
  }
  if (fp.includes('k8s') || fp.includes('kubernetes') || fp.includes('helm') || fp.includes('charts')) {
    deploymentTopology.hasK8s = true;
    deploymentTopology.infraFiles.push(node.filePath);
  }
  if (name.endsWith('.tf') || name.endsWith('.tfvars')) {
    deploymentTopology.hasTerraform = true;
    deploymentTopology.infraFiles.push(node.filePath);
  }
}

// ── I. Data Pipeline Detection ───────────────────────────────────────────────
const dataPipeline = {
  schemaFiles: [],
  migrationFiles: [],
  dataModelFiles: [],
  apiHandlerFiles: []
};

for (const node of fileNodes) {
  const name = node.name || '';
  const fp = node.filePath || '';
  const tags = node.tags || [];

  if (name.endsWith('.sql') || name.endsWith('.graphql') || name.endsWith('.gql') || name.endsWith('.proto') || name.endsWith('.prisma')) {
    if (fp.includes('migration') || fp.includes('migrate')) {
      dataPipeline.migrationFiles.push(node.id);
    } else {
      dataPipeline.schemaFiles.push(node.id);
    }
  }
  if (tags.includes('api-handler') && (fp.includes('/api/') || fp.includes('/routes/'))) {
    dataPipeline.apiHandlerFiles.push(node.id);
  }
  if (fp.includes('/models/') || fp.includes('/entities/') || fp.includes('/schemas/') || fp.includes('/db/')) {
    dataPipeline.dataModelFiles.push(node.id);
  }
}

// ── J. Documentation Coverage ────────────────────────────────────────────────
const groupsWithDocs = new Set();
const undocumentedGroups = [];

for (const node of fileNodes) {
  if (node.type === 'document') {
    // Find which group the doc belongs to
    const group = getGroupKey(node.filePath, commonPrefixStr);
    groupsWithDocs.add(group);
  }
}

// Also check if doc files reference code in other groups via allEdges
for (const edge of allEdges) {
  const srcNode = fileNodes.find(n => n.id === edge.source);
  if (srcNode && srcNode.type === 'document' && edge.type === 'documents') {
    const tgtNode = fileNodes.find(n => n.id === edge.target);
    if (tgtNode && tgtNode.type === 'file') {
      const group = getGroupKey(tgtNode.filePath, commonPrefixStr);
      groupsWithDocs.add(group);
    }
  }
}

const totalGroups = Object.keys(directoryGroups).length;
for (const group of Object.keys(directoryGroups)) {
  if (!groupsWithDocs.has(group)) {
    undocumentedGroups.push(group);
  }
}

const docCoverage = {
  groupsWithDocs: groupsWithDocs.size,
  totalGroups,
  coverageRatio: totalGroups > 0 ? groupsWithDocs.size / totalGroups : 0,
  undocumentedGroups
};

// ── K. Dependency Direction ─────────────────────────────────────────────────
const dependencyDirection = [];

for (const [from, targets] of Object.entries(groupAdjList)) {
  for (const [to, fromCount] of Object.entries(targets)) {
    const toGroupImports = groupAdjList[to] || {};
    const toCount = toGroupImports[from] || 0;

    if (fromCount > toCount) {
      dependencyDirection.push({ dependent: from, dependsOn: to });
    }
  }
}

// Also add cases where there's a one-way dependency (import only one direction)
for (const [from, targets] of Object.entries(groupAdjList)) {
  for (const [to, count] of Object.entries(targets)) {
    const reverse = (groupAdjList[to] || {})[from] || 0;
    if (count > 0 && reverse === 0) {
      // Only add if not already added
      const alreadyAdded = dependencyDirection.some(d => d.dependent === from && d.dependsOn === to);
      if (!alreadyAdded) {
        dependencyDirection.push({ dependent: from, dependsOn: to });
      }
    }
  }
}

// ── File Stats ───────────────────────────────────────────────────────────────
const filesPerGroup = {};
for (const [group, nodeIds] of Object.entries(directoryGroups)) {
  filesPerGroup[group] = nodeIds.length;
}

const nodeTypeCounts = {};
for (const [type, nodeIds] of Object.entries(nodeTypeGroups)) {
  nodeTypeCounts[type] = nodeIds.length;
}

const fileStats = {
  totalFileNodes: fileNodes.length,
  filesPerGroup,
  nodeTypeCounts
};

// ── Assemble output ─────────────────────────────────────────────────────────
const results = {
  scriptCompleted: true,
  directoryGroups,
  nodeTypeGroups,
  crossCategoryEdges,
  interGroupImports,
  intraGroupDensity,
  patternMatches,
  deploymentTopology,
  dataPipeline,
  docCoverage,
  dependencyDirection,
  fileStats,
  fileFanIn,
  fileFanOut
};

fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf-8');
process.exit(0);
