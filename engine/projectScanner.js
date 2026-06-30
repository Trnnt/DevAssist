import { getRepoDetails, getRepoTree, getFileContent } from '../services/github.js';

export const SCANNER_SOURCES = {
  GITHUB: 'github',
  LOCAL: 'local'
};

/**
 * List of directories and file patterns to ignore during scanning
 */
const IGNORED_PATHS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.DS_Store',
  '.cache',
  'tmp',
  'out',
  '__pycache__'
];

const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.mov', '.exe', '.dll', '.so', '.dylib', '.jar'
];

/**
 * Determines if a file path should be ignored.
 */
function shouldIgnorePath(path) {
  const parts = path.split('/');
  for (const part of parts) {
    if (IGNORED_PATHS.includes(part)) return true;
  }
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  if (BINARY_EXTENSIONS.includes(ext)) return true;
  return false;
}

/**
 * Base abstraction for project scanners.
 */
class BaseScanner {
  async scan() {
    throw new Error('scan() must be implemented by subclass.');
  }

  /**
   * Helper to normalize output into the standardized intermediate structure.
   */
  normalizeOutput({ metadata, tree, importantFiles, stats }) {
    return {
      type: 'scanned_project_data',
      scannedAt: new Date().toISOString(),
      metadata: metadata || {},
      tree: tree || [],
      importantFiles: importantFiles || [],
      stats: stats || { fileCount: 0, dirCount: 0 }
    };
  }

  /**
   * Categorizes files into "important" based on patterns.
   */
  categorizeFile(path) {
    const p = path.toLowerCase();
    const isRoot = !path.includes('/');

    if (p.includes('readme')) return 'README';
    if (p.includes('license')) return 'LICENSE';
    if (isRoot && (p === 'package.json' || p === 'pom.xml' || p === 'build.gradle' || p === 'requirements.txt' || p === 'cargo.toml')) return 'DEPENDENCY_MANIFEST';
    if (isRoot && (p.includes('config') || p.includes('.env.example') || p === 'dockerfile' || p === 'docker-compose.yml')) return 'CONFIGURATION';
    if (p.startsWith('.github/workflows/')) return 'CI_CD';
    
    return 'SOURCE_CODE';
  }
}

/**
 * Scanner for GitHub repositories.
 */
class GitHubScanner extends BaseScanner {
  constructor(owner, repo) {
    super();
    this.owner = owner;
    this.repo = repo;
  }

  async scan() {
    try {
      // 1. Fetch Repository Metadata
      const details = await getRepoDetails(this.owner, this.repo);
      
      const defaultBranch = details.default_branch || 'main';
      
      const metadata = {
        name: details.name,
        fullName: details.full_name,
        description: details.description,
        defaultBranch,
        url: details.html_url,
        language: details.language,
        topics: details.topics || [],
        source: SCANNER_SOURCES.GITHUB
      };

      const stats = {
        stars: details.stargazers_count,
        forks: details.forks_count,
        watchers: details.subscribers_count,
        fileCount: 0,
        dirCount: 0
      };

      // 2. Fetch Repository Tree
      const treeData = await getRepoTree(this.owner, this.repo, defaultBranch);
      const items = treeData.tree || [];

      const filteredTree = [];
      const importantFiles = [];

      for (const item of items) {
        if (shouldIgnorePath(item.path)) continue;

        const isDir = item.type === 'tree';
        if (isDir) {
          stats.dirCount++;
        } else {
          stats.fileCount++;
        }

        const node = {
          path: item.path,
          type: isDir ? 'directory' : 'file',
          size: item.size || 0,
          sha: item.sha
        };

        filteredTree.push(node);

        if (!isDir) {
          const category = this.categorizeFile(item.path);
          if (category !== 'SOURCE_CODE') {
            importantFiles.push({
              path: item.path,
              category,
              sha: item.sha
            });
          }
        }
      }

      // 3. Return normalized structure
      return this.normalizeOutput({
        metadata,
        tree: filteredTree,
        importantFiles,
        stats
      });

    } catch (err) {
      throw new Error(`GitHub Scanner Failed: ${err.message}`);
    }
  }

  /**
   * Dedicated method to fetch content of an important file.
   */
  async getFileContent(path, sha) {
    return await getFileContent(this.owner, this.repo, path, sha);
  }
}

/**
 * Abstraction for scanning local folders.
 * In a Manifest V3 extension, accessing the local file system requires the File System Access API
 * or a native messaging host. This serves as a placeholder/interface.
 */
class LocalScanner extends BaseScanner {
  constructor(directoryHandle) {
    super();
    this.directoryHandle = directoryHandle; // e.g. FileSystemDirectoryHandle
  }

  async scan() {
    // Placeholder implementation for Local Project scanning
    if (!this.directoryHandle) {
      throw new Error("No directory handle provided for local scanning.");
    }

    const metadata = {
      name: this.directoryHandle.name,
      fullName: `local/${this.directoryHandle.name}`,
      description: 'Local project folder',
      defaultBranch: 'local',
      url: 'file:///',
      language: 'Unknown',
      topics: [],
      source: SCANNER_SOURCES.LOCAL
    };

    const stats = {
      fileCount: 0,
      dirCount: 0
    };

    const filteredTree = [];
    const importantFiles = [];

    // In a real implementation using File System Access API:
    // async function walk(dirHandle, currentPath = '') {
    //   for await (const entry of dirHandle.values()) {
    //     const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    //     if (shouldIgnorePath(fullPath)) continue;
    //     if (entry.kind === 'directory') {
    //        stats.dirCount++;
    //        filteredTree.push({ path: fullPath, type: 'directory' });
    //        await walk(entry, fullPath);
    //     } else {
    //        stats.fileCount++;
    //        filteredTree.push({ path: fullPath, type: 'file' });
    //        // Categorize and push to importantFiles
    //     }
    //   }
    // }
    // await walk(this.directoryHandle);

    return this.normalizeOutput({
      metadata,
      tree: filteredTree,
      importantFiles,
      stats
    });
  }

  async getFileContent(path) {
    // Placeholder: await this.directoryHandle.getFileHandle(path)...
    throw new Error('Local file content fetching not yet implemented.');
  }
}

/**
 * Factory and Service Orchestrator for the Project Intelligence Engine.
 * Provides a unified API to scan projects without knowing their source type.
 */
export class ProjectScannerService {
  /**
   * Initializes the appropriate scanner based on source type.
   * @param {string} sourceType - 'github' or 'local'
   * @param {Object} config - { owner, repo } for github, { directoryHandle } for local
   */
  static createScanner(sourceType, config) {
    if (sourceType === SCANNER_SOURCES.GITHUB) {
      if (!config.owner || !config.repo) throw new Error('GitHub scanner requires owner and repo configuration.');
      return new GitHubScanner(config.owner, config.repo);
    } 
    
    if (sourceType === SCANNER_SOURCES.LOCAL) {
      return new LocalScanner(config.directoryHandle);
    }

    throw new Error(`Unsupported scanner source type: ${sourceType}`);
  }
}
