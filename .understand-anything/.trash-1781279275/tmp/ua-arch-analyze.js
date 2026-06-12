const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node ua-arch-analyze.js <input.json> <output.json>');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
} catch (e) {
  console.error('Failed to read input:', e.message);
  process.exit(1);
}

const { fileNodes, importEdges, allEdges } = data;

// ===== A. Directory Grouping =====
// Find common path prefix
const filePaths = fileNodes.map(n => n.filePath);
let commonPrefix = '';
if (filePaths.length > 0) {
  const first = filePaths[0].split('/');
  for (let i = 0; i < first.length; i++) {
    const candidate = first.slice(0, i + 1).join('/') + '/';
    if (filePaths.every(p => p.startsWith(candidate))) {
      commonPrefix = candidate;
    } else {
      break;
    }
  }
}

// Build a map of node ID to filePath
const idToPath = {};
fileNodes.forEach(n => { idToPath[n.id] = n.filePath; });

// Group by first directory segment after common prefix
const directoryGroups = {};
fileNodes.forEach(node => {
  let relPath = node.filePath;
  if (commonPrefix && relPath.startsWith(commonPrefix)) {
    relPath = relPath.slice(commonPrefix.length);
  }
  // Remove leading slash if any
  if (relPath.startsWith('/')) relPath = relPath.slice(1);

  const parts = relPath.split('/').filter(Boolean);
  let groupName;
  if (parts.length === 0) {
    groupName = '(root)';
  } else {
    groupName = parts[0];
  }

  if (!directoryGroups[groupName]) directoryGroups[groupName] = [];
  directoryGroups[groupName].push(node.id);
});

// ===== B. Node Type Grouping =====
const nodeTypeGroups = {};
fileNodes.forEach(node => {
  if (!nodeTypeGroups[node.type]) nodeTypeGroups[node.type] = [];
  nodeTypeGroups[node.type].push(node.id);
});

// ===== C. Import Adjacency Matrix =====
const fileFanOut = {};
const fileFanIn = {};
const importMap = {}; // source -> Set of targets
const reverseImportMap = {}; // target -> Set of sources

fileNodes.forEach(n => {
  fileFanOut[n.id] = 0;
  fileFanIn[n.id] = 0;
  importMap[n.id] = new Set();
  reverseImportMap[n.id] = new Set();
});

importEdges.forEach(edge => {
  if (importMap[edge.source]) {
    importMap[edge.source].add(edge.target);
    fileFanOut[edge.source] = importMap[edge.source].size;
  }
  if (reverseImportMap[edge.target]) {
    reverseImportMap[edge.target].add(edge.source);
    fileFanIn[edge.target] = reverseImportMap[edge.target].size;
  }
});

// Group-level import analysis
const groupNames = Object.keys(directoryGroups);
const nodeIdToGroup = {};
groupNames.forEach(grp => {
  directoryGroups[grp].forEach(id => { nodeIdToGroup[id] = grp; });
});

const groupImportsFrom = {}; // group -> Set of other groups it imports from
const groupImportedBy = {};  // group -> Set of other groups that import it
groupNames.forEach(g => {
  groupImportsFrom[g] = new Set();
  groupImportedBy[g] = new Set();
});

importEdges.forEach(edge => {
  const srcGrp = nodeIdToGroup[edge.source];
  const tgtGrp = nodeIdToGroup[edge.target];
  if (srcGrp && tgtGrp && srcGrp !== tgtGrp) {
    groupImportsFrom[srcGrp].add(tgtGrp);
    groupImportedBy[tgtGrp].add(srcGrp);
  }
});

// ===== D. Cross-Category Dependency Analysis =====
const crossCategoryCounts = {}; // key: "fromType->toType:edgeType"
allEdges.forEach(edge => {
  const srcNode = fileNodes.find(n => n.id === edge.source);
  const tgtNode = fileNodes.find(n => n.id === edge.target);
  if (srcNode && tgtNode) {
    const fromType = srcNode.type;
    const toType = tgtNode.type;
    const edgeType = edge.type;
    const key = `${fromType}->${toType}:${edgeType}`;
    if (!crossCategoryCounts[key]) crossCategoryCounts[key] = 0;
    crossCategoryCounts[key]++;
  }
});

const crossCategoryEdges = Object.entries(crossCategoryCounts).map(([key, count]) => {
  const [types, edgeType] = key.split(':');
  const [fromType, toType] = types.split('->');
  return { fromType, toType, edgeType, count };
});

// ===== E. Inter-Group Import Frequency =====
const interGroupImportCounts = {}; // "fromGroup->toGroup" -> count
groupNames.forEach(fromG => {
  groupNames.forEach(toG => {
    if (fromG !== toG) {
      let count = 0;
      importEdges.forEach(edge => {
        if (nodeIdToGroup[edge.source] === fromG && nodeIdToGroup[edge.target] === toG) {
          count++;
        }
      });
      if (count > 0) {
        interGroupImportCounts[`${fromG}->${toG}`] = count;
      }
    }
  });
});

const interGroupImports = Object.entries(interGroupImportCounts).map(([key, count]) => {
  const [from, to] = key.split('->');
  return { from, to, count };
});

// ===== F. Intra-Group Import Density =====
const intraGroupDensity = {};
groupNames.forEach(grp => {
  let internalEdges = 0;
  let totalEdges = 0;

  importEdges.forEach(edge => {
    const srcGrp = nodeIdToGroup[edge.source];
    const tgtGrp = nodeIdToGroup[edge.target];
    if (srcGrp === grp || tgtGrp === grp) {
      totalEdges++;
      if (srcGrp === grp && tgtGrp === grp) {
        internalEdges++;
      }
    }
  });

  intraGroupDensity[grp] = {
    internalEdges,
    totalEdges,
    density: totalEdges > 0 ? internalEdges / totalEdges : 0
  };
});

// ===== G. Directory Pattern Matching =====
const patternTable = {
  'routes': 'api', 'api': 'api', 'controllers': 'api', 'endpoints': 'api', 'handlers': 'api',
  'services': 'service', 'core': 'service', 'lib': 'service', 'domain': 'service', 'logic': 'service',
  'models': 'data', 'db': 'data', 'data': 'data', 'persistence': 'data', 'repository': 'data', 'entities': 'data',
  'components': 'ui', 'views': 'ui', 'pages': 'ui', 'ui': 'ui', 'layouts': 'ui', 'screens': 'ui',
  'middleware': 'middleware', 'plugins': 'middleware', 'interceptors': 'middleware', 'guards': 'middleware',
  'utils': 'utility', 'helpers': 'utility', 'common': 'utility', 'shared': 'utility', 'tools': 'utility',
  'config': 'config', 'constants': 'config', 'env': 'config', 'settings': 'config',
  '__tests__': 'test', 'test': 'test', 'tests': 'test', 'spec': 'test', 'specs': 'test',
  'types': 'types', 'interfaces': 'types', 'schemas': 'types', 'contracts': 'types', 'dtos': 'types',
  'hooks': 'hooks', 'store': 'state', 'state': 'state', 'reducers': 'state', 'actions': 'state', 'slices': 'state',
  'assets': 'assets', 'static': 'assets', 'public': 'assets',
  'migrations': 'data', 'management': 'config', 'commands': 'config',
  'templatetags': 'utility', 'signals': 'service', 'serializers': 'api',
  'cmd': 'entry', 'internal': 'service', 'pkg': 'utility',
  'dto': 'types', 'request': 'types', 'response': 'types',
  'entity': 'data', 'controller': 'api', 'routers': 'api', 'composables': 'service',
  'blueprints': 'api', 'mailers': 'service', 'jobs': 'service', 'channels': 'service',
  'bin': 'entry',
  'docs': 'documentation', 'documentation': 'documentation', 'wiki': 'documentation',
  'deploy': 'infrastructure', 'deployment': 'infrastructure', 'infra': 'infrastructure', 'infrastructure': 'infrastructure',
  '.github': 'ci-cd', '.gitlab': 'ci-cd', '.circleci': 'ci-cd',
  'k8s': 'infrastructure', 'kubernetes': 'infrastructure', 'helm': 'infrastructure', 'charts': 'infrastructure',
  'terraform': 'infrastructure', 'tf': 'infrastructure', 'docker': 'infrastructure',
  'sql': 'data', 'database': 'data', 'schema': 'data',
  // Special for this project
  'server': 'api', 'src': 'ui', 'code': 'entry', 'doc': 'documentation',
  '.claude': 'config', '.understand-anything': 'config',
};

// Also check file-level patterns
const patternMatches = {};
groupNames.forEach(grp => {
  const lowerGrp = grp.toLowerCase();
  patternMatches[grp] = patternTable[lowerGrp] || null;
});

// File-level pattern matching
fileNodes.forEach(node => {
  const fileName = node.name;
  // *.test.* or *.spec.* patterns are already handled by directory
  // Check for specific file patterns
  if (fileName === 'index.ts' || fileName === 'index.js' || fileName === '__init__.py') {
    // Package root index files → entry if not already assigned
    // Already handled by directory group
  }
  if (fileName.endsWith('.d.ts')) {
    // TypeScript declaration files → types
  }
  if (fileName === 'Dockerfile' || fileName.startsWith('docker-compose')) {
    // Infrastructure
  }
});

// ===== H. Deployment Topology Detection =====
const infraFiles = [];
let hasDockerfile = false;
let hasCompose = false;
let hasK8s = false;
let hasTerraform = false;
let hasCI = false;

fileNodes.forEach(node => {
  const fp = node.filePath.toLowerCase();
  const fn = node.name.toLowerCase();

  if (fn === 'dockerfile' || fn.startsWith('dockerfile.')) {
    hasDockerfile = true;
    infraFiles.push(node.filePath);
  }
  if (fn.startsWith('docker-compose')) {
    hasCompose = true;
    infraFiles.push(node.filePath);
  }
  if (fp.includes('k8s') || fp.includes('kubernetes') || fp.includes('.helm')) {
    hasK8s = true;
    infraFiles.push(node.filePath);
  }
  if (fn.endsWith('.tf') || fn.endsWith('.tfvars')) {
    hasTerraform = true;
    infraFiles.push(node.filePath);
  }
  if (fp.includes('.github/workflows') || fp.includes('.gitlab-ci.yml') || fn === 'jenkinsfile') {
    hasCI = true;
    infraFiles.push(node.filePath);
  }
});

const deploymentTopology = { hasDockerfile, hasCompose, hasK8s, hasTerraform, hasCI, infraFiles };

// ===== I. Data Pipeline Detection =====
const schemaFiles = [];
const migrationFiles = [];
const dataModelFiles = [];
const apiHandlerFiles = [];

fileNodes.forEach(node => {
  const fp = node.filePath.toLowerCase();
  const fn = node.name.toLowerCase();

  if (fn.endsWith('.sql') || fn.endsWith('.graphql') || fn.endsWith('.gql') || fn.endsWith('.proto')) {
    schemaFiles.push(node.filePath);
  }
  if (fp.includes('migration')) {
    migrationFiles.push(node.filePath);
  }
  if (fp.includes('/models/') || fp.includes('/entities/') || fp.includes('/schemas/')) {
    dataModelFiles.push(node.filePath);
  }
  if (fp.includes('/routes/') || fp.includes('/controllers/') || fp.includes('/api/') || fp.includes('/handlers/')) {
    apiHandlerFiles.push(node.filePath);
  }
});

const dataPipeline = { schemaFiles, migrationFiles, dataModelFiles, apiHandlerFiles };

// ===== J. Documentation Coverage =====
const groupsWithDocs = new Set();
const undocumentedGroups = [];

groupNames.forEach(grp => {
  const filesInGroup = directoryGroups[grp];
  const hasDoc = filesInGroup.some(id => {
    const node = fileNodes.find(n => n.id === id);
    return node && (node.type === 'document' || node.name.toLowerCase().includes('readme'));
  });
  if (hasDoc) {
    groupsWithDocs.add(grp);
  } else {
    undocumentedGroups.push(grp);
  }
});

const totalGroups = groupNames.length;
const docCoverage = {
  groupsWithDocs: groupsWithDocs.size,
  totalGroups,
  coverageRatio: totalGroups > 0 ? groupsWithDocs.size / totalGroups : 0,
  undocumentedGroups
};

// ===== K. Dependency Direction =====
const dependencyDirection = [];
groupNames.forEach(depGrp => {
  groupNames.forEach(dependsOnGrp => {
    if (depGrp === dependsOnGrp) return;
    const forward = interGroupImportCounts[`${depGrp}->${dependsOnGrp}`] || 0;
    const reverse = interGroupImportCounts[`${dependsOnGrp}->${depGrp}`] || 0;
    if (forward > reverse) {
      dependencyDirection.push({ dependent: depGrp, dependsOn: dependsOnGrp });
    } else if (reverse > forward) {
      dependencyDirection.push({ dependent: dependsOnGrp, dependsOn: depGrp });
    }
  });
});

// Deduplicate dependencyDirection
const seenDeps = new Set();
const dedupedDependencyDirection = dependencyDirection.filter(d => {
  const key = `${d.dependent}|${d.dependsOn}`;
  const reverseKey = `${d.dependsOn}|${d.dependent}`;
  if (seenDeps.has(key) || seenDeps.has(reverseKey)) return false;
  seenDeps.add(key);
  return true;
});

// ===== File Stats =====
const totalFileNodes = fileNodes.length;
const filesPerGroup = {};
groupNames.forEach(g => { filesPerGroup[g] = directoryGroups[g].length; });
const nodeTypeCounts = {};
fileNodes.forEach(n => { nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] || 0) + 1; });

const result = {
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
  dependencyDirection: dedupedDependencyDirection,
  fileStats: {
    totalFileNodes,
    filesPerGroup,
    nodeTypeCounts
  },
  fileFanIn,
  fileFanOut
};

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log('Analysis complete. Output written to', outputPath);
process.exit(0);
