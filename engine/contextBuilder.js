import { createProjectContext } from './models/projectContext.js';

/**
 * ContextBuilderService
 * Consumes the output of ProjectScannerService and transforms raw scan data into a structured ProjectContext.
 * Does not call GitHub APIs directly (only via scanner). Does not use AI.
 */
export class ContextBuilderService {
  /**
   * @param {Object} scanner - An instance of a scanner (GitHubScanner or LocalScanner)
   */
  constructor(scanner) {
    if (!scanner) {
      throw new Error("ContextBuilderService requires a scanner instance.");
    }
    this.scanner = scanner;
  }

  /**
   * Executes the full builder pipeline.
   * @returns {Promise<Object>} The versioned ProjectContext
   */
  async buildContext() {
    let fallbackContext = createProjectContext("unknown");
    try {
      // 1. Scan project via injected scanner
      const rawData = await this.scanner.scan();
      
      // 2. Initialize versioned context
      const context = createProjectContext(rawData.metadata.source || "unknown");
      fallbackContext = context; // Upgrade fallback with proper source
      
      // 3. Populate metadata & stats
      this._populateMetadata(context, rawData);
      
      // 4. Organize folder architecture and important files
      this._organizeFiles(context, rawData);
      
      // 5. Detect and parse dependencies
      await this._parseDependencies(context);
      
      // 6. Detect technology stack (DB, Auth, Deployment, CI/CD)
      this._detectTechnologies(context);
      
      // 7. Generate deterministic architecture summary
      this._generateArchitectureSummary(context);
      
      return context;
    } catch (err) {
      console.error("ContextBuilder Failed:", err);
      // "Never throw uncaught exceptions" - "Return partial ProjectContext if some files are unavailable."
      fallbackContext.project.description = fallbackContext.project.description 
        ? `${fallbackContext.project.description} (Partial Context: ${err.message})`
        : `Failed to completely parse context: ${err.message}`;
      return fallbackContext;
    }
  }

  _populateMetadata(context, rawData) {
    context.project.name = rawData.metadata.name || "Unknown";
    context.project.description = rawData.metadata.description || "";
    context.project.owner = rawData.metadata.fullName ? rawData.metadata.fullName.split('/')[0] : "Unknown";
    context.project.url = rawData.metadata.url || "";
    context.project.defaultBranch = rawData.metadata.defaultBranch || "main";
    context.project.topics = rawData.metadata.topics || [];
    context.project.license = rawData.metadata.license || null;
    
    // Add primary language if provided
    if (rawData.metadata.language && !context.technologyStack.languages.includes(rawData.metadata.language)) {
      context.technologyStack.languages.push(rawData.metadata.language);
    }
    
    context.stats = rawData.stats || context.stats;
    context.architecture.normalizedTree = rawData.tree || [];
  }

  _organizeFiles(context, rawData) {
    for (const file of rawData.importantFiles) {
      const { path, category, sha } = file;
      if (category === 'README') context.architecture.importantFiles.README = { path, sha };
      else if (category === 'LICENSE') context.architecture.importantFiles.LICENSE = { path, sha };
      else if (category === 'DEPENDENCY_MANIFEST') context.architecture.importantFiles.DEPENDENCY_MANIFEST = { path, sha };
      else if (category === 'CONFIGURATION') context.architecture.importantFiles.CONFIGURATION.push({ path, sha });
      else if (category === 'CI_CD') context.architecture.importantFiles.CI_CD.push({ path, sha });
      
      // Simple entry point detector
      const p = path.toLowerCase();
      if (p === 'index.js' || p === 'main.js' || p === 'app.js' || p === 'server.js' || p === 'src/index.js' || p === 'src/main.js' || p === 'src/main.rs' || p === 'main.go') {
        context.architecture.entryPoints.push(path);
      }
    }
  }

  async _parseDependencies(context) {
    const manifest = context.architecture.importantFiles.DEPENDENCY_MANIFEST;
    if (!manifest) return;

    try {
      // Delegate to scanner to fetch the content securely (handles GitHub or Local routing implicitly)
      const content = await this.scanner.getFileContent(manifest.path, manifest.sha);
      if (!content) return;

      const pathLower = manifest.path.toLowerCase();

      if (pathLower.endsWith('package.json')) {
        context.technologyStack.packageManager = "npm/yarn/pnpm";
        context.technologyStack.runtime = "Node.js";
        if (!context.technologyStack.languages.includes('JavaScript')) {
          context.technologyStack.languages.push('JavaScript');
        }
        
        try {
          const pkg = JSON.parse(content);
          if (pkg.dependencies) context.technologyStack.dependencies.production = pkg.dependencies;
          if (pkg.devDependencies) context.technologyStack.dependencies.development = pkg.devDependencies;
        } catch (e) {
          console.warn("Could not parse package.json JSON", e);
        }
        
      } else if (pathLower.endsWith('pom.xml') || pathLower.endsWith('build.gradle')) {
        context.technologyStack.packageManager = pathLower.endsWith('pom.xml') ? "Maven" : "Gradle";
        context.technologyStack.runtime = "Java/JVM";
        if (!context.technologyStack.languages.includes('Java')) context.technologyStack.languages.push('Java');
      } else if (pathLower.endsWith('requirements.txt')) {
        context.technologyStack.packageManager = "pip";
        context.technologyStack.runtime = "Python";
        if (!context.technologyStack.languages.includes('Python')) context.technologyStack.languages.push('Python');
      } else if (pathLower.endsWith('cargo.toml')) {
        context.technologyStack.packageManager = "cargo";
        context.technologyStack.runtime = "Rust";
        if (!context.technologyStack.languages.includes('Rust')) context.technologyStack.languages.push('Rust');
      }
    } catch (err) {
      // Gracefully ignore fetch/parse errors to maintain partial context
      console.warn("Failed to parse dependency manifest:", err);
    }
  }

  _detectTechnologies(context) {
    const prodDeps = Object.keys(context.technologyStack.dependencies.production);
    const devDeps = Object.keys(context.technologyStack.dependencies.development);
    const allDeps = [...prodDeps, ...devDeps];

    // Frameworks
    if (allDeps.includes('react')) context.technologyStack.frameworks.push('React');
    if (allDeps.includes('vue')) context.technologyStack.frameworks.push('Vue');
    if (allDeps.includes('express')) context.technologyStack.frameworks.push('Express');
    if (allDeps.includes('next')) context.technologyStack.frameworks.push('Next.js');
    if (allDeps.includes('@angular/core')) context.technologyStack.frameworks.push('Angular');
    if (allDeps.includes('svelte')) context.technologyStack.frameworks.push('Svelte');

    // Build System
    if (allDeps.includes('webpack')) context.technologyStack.buildSystem = 'Webpack';
    else if (allDeps.includes('vite')) context.technologyStack.buildSystem = 'Vite';
    else if (allDeps.includes('rollup')) context.technologyStack.buildSystem = 'Rollup';

    // Auth
    if (allDeps.includes('firebase') || allDeps.includes('firebase-admin')) context.infrastructure.authentication.push('Firebase Auth');
    if (allDeps.includes('passport')) context.infrastructure.authentication.push('Passport.js');
    if (allDeps.includes('jsonwebtoken') || allDeps.includes('jose')) context.infrastructure.authentication.push('JWT');
    if (allDeps.includes('next-auth')) context.infrastructure.authentication.push('NextAuth');

    // Database
    if (allDeps.includes('mongoose') || allDeps.includes('mongodb')) context.infrastructure.database.push('MongoDB');
    if (allDeps.includes('pg') || allDeps.includes('sequelize') || allDeps.includes('typeorm') || allDeps.includes('prisma')) context.infrastructure.database.push('PostgreSQL/SQL');
    if (allDeps.includes('redis') || allDeps.includes('ioredis')) context.infrastructure.database.push('Redis');
    if (allDeps.includes('firebase-admin') || allDeps.includes('firebase')) {
      if (!context.infrastructure.database.includes('Firestore')) context.infrastructure.database.push('Firestore');
    }

    // CI/CD
    const ciFiles = context.architecture.importantFiles.CI_CD.map(f => f.path.toLowerCase());
    if (ciFiles.some(p => p.startsWith('.github/workflows'))) context.infrastructure.ciCd.push('GitHub Actions');
    if (ciFiles.some(p => p.includes('.gitlab-ci.yml'))) context.infrastructure.ciCd.push('GitLab CI');

    // Deployment
    const configs = context.architecture.importantFiles.CONFIGURATION.map(f => f.path.toLowerCase());
    if (configs.some(p => p === 'firebase.json')) context.infrastructure.deployment.push('Firebase Hosting');
    if (configs.some(p => p === 'vercel.json')) context.infrastructure.deployment.push('Vercel');
    if (configs.some(p => p === 'netlify.toml')) context.infrastructure.deployment.push('Netlify');
    if (configs.some(p => p === 'dockerfile')) context.infrastructure.deployment.push('Docker');
  }

  _generateArchitectureSummary(context) {
    const langString = context.technologyStack.languages.length > 0 
      ? context.technologyStack.languages.join('/') 
      : 'multi-language';
      
    let summary = `${context.project.name || 'This project'} is a ${langString} project`;
    
    if (context.technologyStack.frameworks.length > 0) {
      summary += ` built with ${context.technologyStack.frameworks.join(', ')}`;
    }
    summary += `. `;

    if (context.technologyStack.runtime) {
      summary += `It runs on ${context.technologyStack.runtime} using ${context.technologyStack.packageManager}. `;
    }

    if (context.infrastructure.database.length > 0) {
      summary += `It uses ${context.infrastructure.database.join(' and ')} for data storage. `;
    }

    if (context.infrastructure.authentication.length > 0) {
      summary += `Authentication is handled via ${context.infrastructure.authentication.join(', ')}. `;
    }

    if (context.infrastructure.deployment.length > 0) {
      summary += `It is configured for deployment on ${context.infrastructure.deployment.join(', ')}. `;
    }

    if (context.architecture.entryPoints.length > 0) {
      summary += `The main entry points appear to be: ${context.architecture.entryPoints.join(', ')}.`;
    }

    context.architecture.summary = summary.trim();
  }
}
