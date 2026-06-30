/**
 * Local Project Scanner Service
 * Leverages File System Access API to scan local folders and build project contexts.
 */

import { 
  KEY_FILES, 
  detectFrameworks, 
  detectLanguagesFromFileList, 
  buildFolderStructure, 
  detectArchitecture 
} from './projectDetection.js';

// IndexedDB Helper
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('devassist_handles', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('handles');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    const req = store.put(handle, 'last_folder');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const req = store.get('last_folder');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

const DEFAULT_IGNORES = [
  'node_modules', '.git', 'dist', 'build', '.next', 'venv', '.venv', '__pycache__'
];

function parseGitignore(content) {
  if (!content) return [];
  return content.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      // Escape regex special chars except * and ?
      let pattern = line
        .replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      if (line.endsWith('/')) {
        pattern = pattern + '.*';
      }
      return new RegExp('(^|/)' + pattern + '($|/)');
    });
}

function shouldIgnore(path, name, gitignoreRegexes) {
  const parts = path.split('/');
  if (parts.some(p => DEFAULT_IGNORES.includes(p))) {
    return true;
  }
  return gitignoreRegexes.some(rx => rx.test(path));
}

async function walkDirectory(dirHandle, currentPath = '', ignoreRules = [], collectedFiles = []) {
  for await (const [name, entry] of dirHandle.entries()) {
    const entryPath = currentPath ? `${currentPath}/${name}` : name;
    
    if (shouldIgnore(entryPath, name, ignoreRules)) {
      continue;
    }
    
    if (entry.kind === 'directory') {
      collectedFiles.push({ path: entryPath, type: 'tree', handle: entry });
      if (collectedFiles.length < 3000) {
        await walkDirectory(entry, entryPath, ignoreRules, collectedFiles);
      }
    } else if (entry.kind === 'file') {
      collectedFiles.push({ path: entryPath, type: 'blob', handle: entry });
    }
  }
}

/**
 * Checks IndexedDB for a stored folder handle and verifies active permission.
 * @returns {Promise<FileSystemDirectoryHandle|null>} Stored handle if granted, otherwise null.
 */
export async function tryResumeLastFolder() {
  const handle = await getStoredHandle();
  if (!handle) return null;
  
  try {
    const permission = await handle.queryPermission({ mode: 'read' });
    if (permission === 'granted') {
      return handle;
    }
  } catch (e) {
    console.warn('Failed to query folder permission:', e);
  }
  return null;
}

/**
 * Scans a local folder and builds a Project Context.
 * @param {Function} onProgress - Callback for updates
 * @param {FileSystemDirectoryHandle} [existingHandle] - Stored handle if resuming
 * @returns {Promise<Object>} Formatted Repository Context
 */
export async function scanLocalFolder(onProgress = () => {}, existingHandle = null) {
  let handle = existingHandle;
  
  if (!handle) {
    onProgress('Waiting for folder selection…');
    // Must be triggered by direct user click
    handle = await window.showDirectoryPicker({ mode: 'read' });
    if (!handle) {
      throw new Error('No folder selected');
    }
    // Save to IndexedDB for quick resume
    await saveHandle(handle);
  }

  onProgress(`Scanning local folder: ${handle.name}…`);

  // Load .gitignore at root if present
  let gitignoreRegexes = [];
  try {
    const gitignoreFileHandle = await handle.getFileHandle('.gitignore');
    const gitignoreFile = await gitignoreFileHandle.getFile();
    const text = await gitignoreFile.text();
    gitignoreRegexes = parseGitignore(text);
  } catch (e) {
    // No .gitignore found, skip
  }

  // Walk directory tree recursively
  const collectedFiles = [];
  await walkDirectory(handle, '', gitignoreRegexes, collectedFiles);

  // Filter key files to read contents
  const foundKeyFiles = collectedFiles.filter(f => 
    f.type === 'blob' && KEY_FILES.some(kf => f.path.endsWith(kf) || f.path === kf)
  );
  
  onProgress('Reading config and key files…');
  const keyFiles = {};
  let packageJsonData = null;

  // Pick up to 8 key files
  const filesToRead = foundKeyFiles.slice(0, 8);
  for (const f of filesToRead) {
    try {
      const file = await f.handle.getFile();
      const content = await file.text();
      keyFiles[f.path] = content.substring(0, 3000); // Cap size
      if (f.path.endsWith('package.json')) {
        try { packageJsonData = JSON.parse(content); } catch (e) {}
      }
    } catch (e) {
      console.warn(`Failed to read key file ${f.path}:`, e);
    }
  }

  // Parse .git/config remote origin if it exists
  onProgress('Checking Git remote configuration…');
  let owner = null;
  let repo = null;
  try {
    const gitDirHandle = await handle.getDirectoryHandle('.git');
    const configFileHandle = await gitDirHandle.getFileHandle('config');
    const configFile = await configFileHandle.getFile();
    const configText = await configFile.text();
    
    // Regex to match [remote "origin"] url
    const remoteRegex = /\[remote\s+"origin"\][^]*?url\s*=\s*(.+)/i;
    const match = configText.match(remoteRegex);
    if (match) {
      const url = match[1].trim();
      const githubUrlRegex = /(?:github\.com[:/])([^/]+)\/([^/.]+)(?:\.git)?/i;
      const urlMatch = url.match(githubUrlRegex);
      if (urlMatch) {
        owner = urlMatch[1];
        repo = urlMatch[2];
      }
    }
  } catch (e) {
    // No git config, skip remote resolution
  }

  onProgress('Detecting technologies…');
  const languages = detectLanguagesFromFileList(collectedFiles);
  const frameworks = detectFrameworks(packageJsonData);
  const architecture = detectArchitecture(collectedFiles, frameworks);

  const fileCount = collectedFiles.filter(f => f.type === 'blob').length;
  const folderCount = collectedFiles.filter(f => f.type === 'tree').length;

  return {
    owner,
    repo,
    metadata: {
      name: handle.name,
      description: 'Local Project Folder',
      stars: null,
      forks: null,
      defaultBranch: 'local',
      fileCount,
      folderCount
    },
    structure: buildFolderStructure(collectedFiles),
    keyFiles,
    packageJson: packageJsonData,
    languages,
    frameworks,
    architecture,
    topics: [],
    analyzedAt: new Date().toISOString(),
    isLocal: true
  };
}
