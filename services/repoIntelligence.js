/**
 * Repository Intelligence Engine
 * Provides the single analysis step for the v1.0 Repository Mode.
 */

import { 
  KEY_FILES, 
  detectFrameworks, 
  detectLanguagesFromFileList, 
  buildFolderStructure, 
  detectArchitecture 
} from './projectDetection.js';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Helper to build auth headers
 */
function getHeaders(token) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
  if (token && token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }
  return headers;
}

/**
 * Fetches raw file content
 */
async function fetchRawFile(owner, repo, branch, path, token) {
  const headers = getHeaders(token);
  // Request raw content to avoid base64 decoding issues and size limits
  headers['Accept'] = 'application/vnd.github.v3.raw';
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
    headers,
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return null;
  const text = await res.text();
  // Cap at ~3000 chars as requested
  return text.substring(0, 3000);
}

/**
 * Fetches and analyzes repository data
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} token - Optional GitHub PAT
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<Object>} Repository Knowledge Context
 */
export async function fetchRepoIntelligence(owner, repo, token, onProgress = () => {}) {
  if (!owner || !repo) throw new Error('Owner and repo are required.');

  // 1. Fetch Repository Metadata
  onProgress('Fetching repository metadata…');
  const metaRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: getHeaders(token),
    signal: AbortSignal.timeout(10000)
  });
  if (metaRes.status === 404) throw new Error('Repository not found or is private.');
  if (metaRes.status === 403 || metaRes.status === 401) throw new Error('GitHub API rate limit exceeded or invalid token.');
  if (!metaRes.ok) throw new Error(`GitHub API error: ${metaRes.statusText}`);
  
  const metadata = await metaRes.json();
  const defaultBranch = metadata.default_branch || 'main';

  // 2. Fetch full recursive file tree
  onProgress('Mapping repository structure…');
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, {
    headers: getHeaders(token),
    signal: AbortSignal.timeout(15000)
  });
  if (!treeRes.ok) throw new Error(`Failed to fetch repository tree: ${treeRes.statusText}`);
  const treeData = await treeRes.json();
  const fullTree = treeData.tree || [];

  // Filter out node_modules, .git, etc. for cleaner analysis
  const structure = fullTree.filter(t => !t.path.includes('node_modules/') && !t.path.includes('.git/'));

  // Detect languages
  const languages = detectLanguagesFromFileList(structure);

  // Find key files
  const foundKeyFiles = structure.filter(t => t.type === 'blob' && KEY_FILES.some(kf => t.path.endsWith(kf) || t.path === kf));
  // Pick up to 8
  const filesToFetch = foundKeyFiles.slice(0, 8);

  // 3. Read Key Files
  onProgress('Reading key files…');
  const keyFiles = {};
  let packageJsonData = null;

  for (const f of filesToFetch) {
    const content = await fetchRawFile(owner, repo, defaultBranch, f.path, token);
    if (content) {
      keyFiles[f.path] = content;
      if (f.path.endsWith('package.json')) {
        try { packageJsonData = JSON.parse(content); } catch (e) { /* ignore */ }
      }
    }
  }

  // 4. Detecting technologies
  onProgress('Detecting technologies…');
  const frameworks = detectFrameworks(packageJsonData);

  // Infer architecture
  const architecture = detectArchitecture(structure, frameworks);

  return {
    owner,
    repo,
    metadata: {
      name: metadata.name,
      description: metadata.description,
      stars: metadata.stargazers_count,
      forks: metadata.forks_count,
      defaultBranch
    },
    structure: buildFolderStructure(structure),
    keyFiles,
    packageJson: packageJsonData,
    languages,
    frameworks,
    architecture,
    topics: metadata.topics || [],
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Serializes the Knowledge Context into a compact string for Gemini
 * @param {Object} ctx - Repository Knowledge Context
 * @returns {string} Serialized context
 */
export function serializeContext(ctx) {
  let out = `Repository: ${ctx.owner}/${ctx.repo}\n`;
  out += `Description: ${ctx.metadata.description || 'No description'}\n`;
  out += `Stars: ${ctx.metadata.stars} | Forks: ${ctx.metadata.forks}\n`;
  out += `Topics: ${ctx.topics.join(', ')}\n`;
  out += `Languages detected (extensions): ${ctx.languages.join(', ')}\n`;
  out += `Frameworks detected: ${ctx.frameworks.join(', ')}\n\n`;
  
  out += `Architecture Indicators:\n`;
  out += `- Monorepo: ${ctx.architecture.isMonorepo}\n`;
  out += `- Dockerized: ${ctx.architecture.hasDocker}\n`;
  out += `- Test Suite: ${ctx.architecture.hasTestSuite}\n`;
  out += `- CI/CD: ${ctx.architecture.hasCI}\n`;
  out += `- Server-Side Rendered (SSR): ${ctx.architecture.isSSR}\n\n`;

  if (ctx.packageJson) {
    out += `Package.json Details:\n`;
    out += `Name: ${ctx.packageJson.name} | Version: ${ctx.packageJson.version}\n`;
    if (ctx.packageJson.scripts) {
      out += `Scripts: ${Object.keys(ctx.packageJson.scripts).join(', ')}\n`;
    }
    out += `\n`;
  }

  // Look for README
  const readmeKey = Object.keys(ctx.keyFiles).find(k => k.toLowerCase().endsWith('readme.md'));
  if (readmeKey) {
    out += `--- EXCERPT OF README.md ---\n`;
    out += ctx.keyFiles[readmeKey].substring(0, 800) + '\n';
    out += `----------------------------\n\n`;
  }

  out += `Presence Flags:\n`;
  out += `- Dockerfile: ${!!Object.keys(ctx.keyFiles).find(k => k === 'Dockerfile')}\n`;
  out += `- docker-compose.yml: ${!!Object.keys(ctx.keyFiles).find(k => k === 'docker-compose.yml')}\n`;
  out += `- .env.example: ${!!Object.keys(ctx.keyFiles).find(k => k === '.env.example')}\n\n`;

  out += `Folder Structure (Top Level & Key Dirs):\n`;
  // Extract top level folders to keep it compact
  const topLevel = [...new Set(ctx.structure.filter(p => !p.includes('/')).slice(0, 50))];
  out += topLevel.join('\n') + '\n\n';

  return out;
}
