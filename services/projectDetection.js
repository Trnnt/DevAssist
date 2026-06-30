/**
 * Shared Project Detection Logic
 * Used by both Remote (GitHub API) and Local (Directory Picker) analysis engines.
 */

export const KEY_FILES = [
  'package.json', 'README.md', 'requirements.txt', 'Pipfile', 'pyproject.toml',
  'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'pubspec.yaml',
  '.env.example', 'docker-compose.yml', 'Dockerfile', 'tsconfig.json',
  '.eslintrc.json', '.eslintrc.js'
];

export const FRAMEWORK_SIGNATURES = {
  'react': 'React',
  'vue': 'Vue',
  '@angular/core': 'Angular',
  'svelte': 'Svelte',
  'express': 'Express',
  'fastify': 'Fastify',
  '@nestjs/core': 'NestJS',
  'next': 'Next.js',
  'react-native': 'React Native',
  'flutter': 'Flutter',
  'django': 'Django',
  'fastapi': 'FastAPI',
  'flask': 'Flask',
  'spring-boot': 'Spring Boot',
  '@prisma/client': 'Prisma',
  'mongoose': 'Mongoose',
  'firebase': 'Firebase',
  '@supabase/supabase-js': 'Supabase',
  'jest': 'Jest',
  'vitest': 'Vitest',
  'webpack': 'Webpack',
  'vite': 'Vite',
  'turbo': 'Turbo'
};

/**
 * Detect frameworks from package.json
 * @param {Object} packageJsonData 
 * @returns {Array<string>} Detected frameworks
 */
export function detectFrameworks(packageJsonData) {
  const frameworks = [];
  if (packageJsonData) {
    const allDeps = { 
      ...packageJsonData.dependencies, 
      ...packageJsonData.devDependencies 
    };
    for (const [dep, label] of Object.entries(FRAMEWORK_SIGNATURES)) {
      if (allDeps[dep]) {
        frameworks.push(label);
      }
    }
  }
  return frameworks;
}

/**
 * Detect languages based on file extensions in the file list
 * @param {Array<Object>} fileList - Array of {path, type} objects
 * @returns {Array<string>} Extracted language extensions
 */
export function detectLanguagesFromFileList(fileList) {
  const extCounts = {};
  fileList
    .filter(f => f.type === 'blob' || f.type === 'file')
    .forEach(f => {
      const ext = f.path.substring(f.path.lastIndexOf('.')).toLowerCase();
      if (ext && ext !== f.path) {
        extCounts[ext] = (extCounts[ext] || 0) + 1;
      }
    });

  return Object.entries(extCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(e => e[0]);
}

/**
 * Build folder structure from file list (capped at 200 items)
 * @param {Array<Object>} fileList - Array of {path, type} objects
 * @returns {Array<string>} Relative file paths
 */
export function buildFolderStructure(fileList) {
  return fileList.slice(0, 200).map(f => f.path);
}

/**
 * Infer architecture patterns from folder structure and frameworks
 * @param {Array<Object>} fileList - Array of {path, type} objects
 * @param {Array<string>} frameworks - Already detected frameworks
 * @returns {Object} Architecture flags
 */
export function detectArchitecture(fileList, frameworks) {
  const paths = fileList.map(f => f.path);
  
  const isMonorepo = fileList.some(f => 
    (f.type === 'tree' || f.type === 'dir' || f.type === 'directory') && 
    (f.path === 'packages' || f.path === 'apps' || f.path === 'backend' || f.path === 'frontend')
  );

  const hasDocker = paths.some(p => p === 'Dockerfile' || p === 'docker-compose.yml');
  
  const hasTestSuite = fileList.some(f => 
    (f.type === 'tree' || f.type === 'dir' || f.type === 'directory') && 
    (f.path === 'test' || f.path === 'tests' || f.path === 'spec')
  ) || frameworks.includes('Jest') || frameworks.includes('Vitest');

  const hasCI = fileList.some(f => 
    f.path.startsWith('.github/workflows')
  );

  const isSSR = frameworks.includes('Next.js');

  return {
    isMonorepo,
    hasDocker,
    hasTestSuite,
    hasCI,
    isSSR
  };
}
