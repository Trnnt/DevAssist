import { serializeContext } from './repoIntelligence.js';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Shared helper to call the Gemini API
 * @param {string} prompt 
 * @param {string} apiKey 
 * @returns {Promise<string>}
 */
async function callGemini(prompt, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('No Gemini API key found. Please add your key in Settings (⚙).');
  }

  let response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey.trim()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });
  } catch (err) {
    throw new Error('Network error. Please check your internet connection.');
  }

  if (response.status === 400) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Invalid request: ${errorData?.error?.message || 'Bad request'}`);
  }

  if (response.status === 403 || response.status === 401) {
    throw new Error('Invalid Gemini API key. Please check your key in Settings.');
  }

  if (response.status === 429) {
    throw new Error('Gemini API quota exceeded. Please wait and try again.');
  }

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response generated. Please try again.');
  }

  return text;
}

const SYSTEM_INSTRUCTION = "base output only on provided context, never invent unevidenced data, return clean Markdown.";

/**
 * Generates a complete README.md
 * @param {Object} ctx - Repository Knowledge Context
 * @param {string} apiKey 
 * @returns {Promise<string>}
 */
export async function generateReadme(ctx, apiKey) {
  const contextStr = serializeContext(ctx);
  const prompt = `${SYSTEM_INSTRUCTION}

Task: Generate an enterprise-grade, highly professional README.md for this repository.
Sections and Formatting:
1. Title and an advanced, professional tagline/description.
2. "Architectural Overview & Engineering Highlights" section with a clear \`\`\`mermaid\`\`\` flowchart (e.g. graph TD) demonstrating the component architecture.
3. Deep-dive bullet points on specific engineering achievements, performance optimizations, and technical decisions made in the codebase.
4. "CI/CD Workflow Automation" section detailing the build or deployment pipeline if workflows are detected.
5. Standard sections: Features, Tech Stack, Installation, Usage, and Project Structure.
6. CRITICAL SECURITY REQUIREMENT: Absolutely DO NOT include, expose, or hint at any API keys, secrets, local paths, or security vulnerabilities in the generated README.

Format Mermaid diagrams EXACTLY inside \`\`\`mermaid ... \`\`\` code blocks. Only include sections with real evidence.

Context:
${contextStr}`;
  return callGemini(prompt, apiKey);
}

/**
 * Generates Architecture Documentation
 * @param {Object} ctx 
 * @param {string} apiKey 
 * @returns {Promise<string>}
 */
export async function generateArchitectureDocs(ctx, apiKey) {
  const contextStr = serializeContext(ctx);
  const prompt = `${SYSTEM_INSTRUCTION}\n\nTask: Generate Architecture Docs for this repository.\nInclude: architecture overview, system components breakdown with a \`\`\`mermaid\`\`\` flowchart (e.g. graph TD), data flow explanation (include another \`\`\`mermaid\`\`\` sequenceDiagram or flowchart), rationale for tech choices, annotated folder structure, key dependency explanations, and 3-5 concrete improvement suggestions.\nIMPORTANT: Format Mermaid diagrams EXACTLY inside \`\`\`mermaid ... \`\`\` code blocks.\n\nContext:\n${contextStr}`;
  return callGemini(prompt, apiKey);
}

/**
 * Generates a Development Roadmap
 * @param {Object} ctx 
 * @param {string} apiKey 
 * @returns {Promise<string>}
 */
export async function generateRoadmap(ctx, apiKey) {
  const contextStr = serializeContext(ctx);
  const prompt = `${SYSTEM_INSTRUCTION}\n\nTask: Generate a Roadmap for this repository.\nInclude: project maturity assessment, what's already built, what's missing, suggested milestones, 10-15 concrete next-feature ideas, a priority matrix (Critical / Important / Nice-to-have), and technical debt notes.\n\nContext:\n${contextStr}`;
  return callGemini(prompt, apiKey);
}

/**
 * Generates a Code Review
 * @param {Object} ctx 
 * @param {string} apiKey 
 * @returns {Promise<string>}
 */
export async function generateCodeReview(ctx, apiKey) {
  const contextStr = serializeContext(ctx);
  const prompt = `${SYSTEM_INSTRUCTION}\n\nTask: Generate a high-level Code Review for this repository.\nInclude: quality score out of 10 with justification, strengths, code quality issues, architecture concerns, brief security pass, brief performance pass, testing coverage assessment, top 10 ranked improvement suggestions, and a best-practices scorecard (documentation, tests, security, architecture, maintainability — each scored out of 10).\n\nContext:\n${contextStr}`;
  return callGemini(prompt, apiKey);
}

/**
 * Generates a Security Review
 * @param {Object} ctx 
 * @param {string} apiKey 
 * @returns {Promise<string>}
 */
export async function generateSecurityReview(ctx, apiKey) {
  const contextStr = serializeContext(ctx);
  const prompt = `${SYSTEM_INSTRUCTION}\n\nTask: Generate a Security Review for this repository.\nInclude: overall risk level, auth/authorization analysis, secret management check, dependency risk notes, input validation concerns, API security notes (CORS, rate limiting), a list of specific findings each tagged with severity (Critical/High/Medium/Low), and a prioritized remediation plan.\n\nContext:\n${contextStr}`;
  return callGemini(prompt, apiKey);
}

/**
 * Generates Commit Message Options
 * @param {Object} ctx 
 * @param {string} changeDescription 
 * @param {string} apiKey 
 * @returns {Promise<string>}
 */
export async function generateCommitMessage(ctx, changeDescription, apiKey) {
  const contextStr = serializeContext(ctx);
  const prompt = `${SYSTEM_INSTRUCTION}\n\nTask: Generate commit message options for the following changes:\n"${changeDescription}"\n\nGenerate 3 options: a short one-liner, a detailed message with body, and a Conventional Commits format message.\n\nRepository Context:\n${contextStr}`;
  return callGemini(prompt, apiKey);
}

/**
 * Generates a PR Description
 * @param {Object} ctx 
 * @param {string} changesSummary 
 * @param {string} apiKey 
 * @returns {Promise<string>}
 */
export async function generatePRDescription(ctx, changesSummary, apiKey) {
  const contextStr = serializeContext(ctx);
  const prompt = `${SYSTEM_INSTRUCTION}\n\nTask: Generate a structured PR Description for the following changes:\n"${changesSummary}"\n\nInclude: Summary, Changes Made, Why These Changes, Testing notes, and a checklist.\n\nRepository Context:\n${contextStr}`;
  return callGemini(prompt, apiKey);
}
