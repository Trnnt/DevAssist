import { buildHeaders } from './github.js';
import { getLoggedInUser } from './storage.js';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Reads a File object and returns a base64 string
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // FileReader result looks like "data:text/plain;base64,....."
      // We need to strip the prefix
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Recursively scans a FileSystemDirectoryHandle and yields files
 */
async function* getLocalFiles(dirHandle, path = '') {
  for await (const entry of dirHandle.values()) {
    // Ignore heavy or hidden folders
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name.startsWith('.')) {
      continue;
    }
    
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      yield { path: path + entry.name, file };
    } else if (entry.kind === 'directory') {
      yield* getLocalFiles(entry, path + entry.name + '/');
    }
  }
}

/**
 * Publishes a local directory to a new GitHub repository
 * @param {FileSystemDirectoryHandle} dirHandle 
 * @param {Object} options { name, description, private, license_template }
 * @param {Function} progressCallback 
 */
export async function publishToGitHub(dirHandle, options, progressCallback = () => {}) {
  const user = await getLoggedInUser();
  if (!user || !user.login) {
    throw new Error('You must be logged in to GitHub to publish.');
  }

  const owner = user.login;
  const headers = await buildHeaders();

  // 1. Create Repository
  progressCallback('Creating repository on GitHub...');
  
  const createRepoPayload = {
    name: options.name,
    description: options.description || '',
    private: options.private,
    auto_init: true
  };
  
  if (options.license_template) {
    createRepoPayload.license_template = options.license_template;
  }

  let repoRes = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    method: 'POST',
    headers,
    body: JSON.stringify(createRepoPayload)
  });

  if (!repoRes.ok) {
    const errData = await repoRes.json().catch(() => ({}));
    throw new Error(`Failed to create repository: ${errData.message || repoRes.statusText}`);
  }

  const repoInfo = await repoRes.json();
  const repoName = repoInfo.name;
  const defaultBranch = repoInfo.default_branch || 'main';

  // 2. Collect local files and upload as blobs
  progressCallback('Scanning local files...');
  const treeNodes = [];
  
  // To avoid hitting rate limits too fast, we'll batch blob creation
  const MAX_CONCURRENT_UPLOADS = 5;
  const filesToUpload = [];
  for await (const fileObj of getLocalFiles(dirHandle)) {
    filesToUpload.push(fileObj);
  }
  
  if (filesToUpload.length > 500) {
    throw new Error(`Too many files (${filesToUpload.length}). Try selecting a smaller or sub-directory to avoid rate limits.`);
  }

  let uploadedCount = 0;
  
  // Helper to upload a single file blob
  const uploadBlob = async (fileObj) => {
    const base64Data = await fileToBase64(fileObj.file);
    const blobRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repoName}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: base64Data,
        encoding: 'base64'
      })
    });
    
    if (!blobRes.ok) {
      throw new Error(`Failed to upload blob for ${fileObj.path}`);
    }
    
    const blobData = await blobRes.json();
    uploadedCount++;
    progressCallback(`Uploading files... (${uploadedCount}/${filesToUpload.length})`);
    
    return {
      path: fileObj.path,
      mode: '100644', // Normal file
      type: 'blob',
      sha: blobData.sha
    };
  };

  // Process in batches
  for (let i = 0; i < filesToUpload.length; i += MAX_CONCURRENT_UPLOADS) {
    const batch = filesToUpload.slice(i, i + MAX_CONCURRENT_UPLOADS);
    const batchResults = await Promise.all(batch.map(uploadBlob));
    treeNodes.push(...batchResults);
  }

  if (options.readmeContent) {
    const readmeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repoName}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: options.readmeContent,
        encoding: 'utf-8'
      })
    });
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json();
      treeNodes.push({
        path: 'README.md',
        mode: '100644',
        type: 'blob',
        sha: readmeData.sha
      });
    }
  }

  if (treeNodes.length === 0) {
    return repoInfo.html_url;
  }

  // 3. Get the latest commit and base tree
  progressCallback('Finalizing commit...');
  let refRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repoName}/git/refs/heads/${defaultBranch}`, { headers });
  if (!refRes.ok) throw new Error('Could not fetch branch ref');
  const refData = await refRes.json();
  const latestCommitSha = refData.object.sha;

  let commitRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repoName}/git/commits/${latestCommitSha}`, { headers });
  if (!commitRes.ok) throw new Error('Could not fetch latest commit');
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  // 4. Create new Tree
  let treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repoName}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeNodes
    })
  });
  if (!treeRes.ok) throw new Error('Could not create git tree');
  const treeData = await treeRes.json();
  const newTreeSha = treeData.sha;

  // 5. Create Commit
  let newCommitRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repoName}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Initial commit via DevAssist',
      tree: newTreeSha,
      parents: [latestCommitSha]
    })
  });
  if (!newCommitRes.ok) throw new Error('Could not create git commit');
  const newCommitData = await newCommitRes.json();
  const newCommitSha = newCommitData.sha;

  // 6. Update Ref
  let updateRefRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repoName}/git/refs/heads/${defaultBranch}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: newCommitSha,
      force: false
    })
  });
  if (!updateRefRes.ok) throw new Error('Could not update branch reference');

  progressCallback('Publish complete!');
  return repoInfo.html_url;
}
