/**
 * Defines the ProjectContext model schema.
 * This ensures versioning and strict structure for all downstream AI modules.
 */

export function createProjectContext(sourceType) {
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    scannerVersion: "1.0",
    source: sourceType, // "github" | "local"
    
    project: {
      name: "",
      description: "",
      owner: "",
      url: "",
      defaultBranch: "",
      visibility: "public",
      topics: [],
      license: null
    },

    technologyStack: {
      languages: [],
      frameworks: [],
      runtime: null,
      packageManager: null,
      buildSystem: null,
      dependencies: {
        production: {}, // { "react": "^18.0.0" }
        development: {}
      }
    },

    infrastructure: {
      authentication: [],
      database: [],
      deployment: [],
      ciCd: []
    },

    architecture: {
      entryPoints: [],
      normalizedTree: [],
      importantFiles: {
        README: null,
        LICENSE: null,
        DEPENDENCY_MANIFEST: null,
        CONFIGURATION: [],
        CI_CD: []
      },
      summary: "" // Deterministic summary of architecture
    },

    stats: {
      stars: 0,
      forks: 0,
      watchers: 0,
      fileCount: 0,
      dirCount: 0
    }
  };
}
