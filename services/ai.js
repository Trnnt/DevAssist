/**
 * AI Service — Google Gemini Integration
 * Communicates with the Gemini API to generate developer insights.
 */

import { getGithubToken, getGeminiKey } from './storage.js';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Calls the Gemini API with the given prompt.
 * @param {string} prompt
 * @param {string} apiKey
 * @returns {Promise<string>} AI-generated text
 * @throws {Error} On API errors or missing key
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

/**
 * Generates a professional developer summary.
 * @param {Object} user - GitHub user profile
 * @param {string[]} topLanguages - Top programming languages
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function summarizeProfile(user, topLanguages, apiKey) {
  const year = user.created_at ? new Date(user.created_at).getFullYear() : 'unknown';
  const prompt = `Based on this GitHub profile data: Name: ${user.name || user.login}, Bio: "${user.bio || 'No bio'}", ${user.public_repos} public repos, top languages: ${topLanguages.join(', ')}, account since ${year}, followers: ${user.followers}. Write a 3-sentence professional developer summary. Be specific and insightful. Do not use generic filler phrases.`;
  return callGemini(prompt, apiKey);
}

/**
 * Explains what kind of developer someone is based on their top repos.
 * @param {Array} topRepos - Top repos by star count
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function explainTopRepos(topRepos, apiKey) {
  const repoList = topRepos
    .slice(0, 8)
    .map((r) => `${r.name} (⭐${r.stargazers_count}): ${r.description || 'No description'}`)
    .join('\n');
  const prompt = `These are the top GitHub repos by stars:\n${repoList}\n\nIn 3 concise bullet points, explain what kind of developer this person is based on their projects. Focus on their specialization, impact, and style.`;
  return callGemini(prompt, apiKey);
}

/**
 * Suggests a personalized learning path.
 * @param {string[]} languages - Languages the developer uses
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function suggestLearningPath(languages, apiKey) {
  const prompt = `This developer primarily uses these technologies: ${languages.join(', ')}. Suggest a personalized 3-step learning path to level up their skills. Each step should be specific, actionable, and build on their existing foundation. Format as numbered steps.`;
  return callGemini(prompt, apiKey);
}

/**
 * Generates new project ideas for a developer.
 * @param {string[]} languages - Languages the developer uses
 * @param {Array} repos - Developer's repositories
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function generateProjectIdeas(languages, repos, apiKey) {
  const repoNames = repos
    .slice(0, 10)
    .map((r) => r.name)
    .join(', ');
  const prompt = `Based on this developer's existing projects (${repoNames}) and skills (${languages.join(', ')}), suggest 3 creative and impactful new project ideas they could build to strengthen their portfolio. Each idea should be unique, practical, and leverage their existing skills while introducing new challenges. Format as numbered items with a project name and 2-sentence description.`;
  return callGemini(prompt, apiKey);
}

/**
 * Validates a Gemini API Key by sending a minimal token generation query.
 * @param {string} apiKey
 * @returns {Promise<boolean>} True if valid, false otherwise
 */
export async function validateApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) return false;
  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey.trim()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 }
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches fresh profile and repositories from GitHub API using the active session token.
 * @param {string} username - Developer username to fetch
 * @returns {Promise<{profile: Object, repos: Array}>}
 */
export async function fetchDeveloperGitHubData(username) {
  const token = await getGithubToken();
  if (!token || !token.trim()) {
    throw new Error('GitHub token not found. Please authenticate in Settings.');
  }

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'Authorization': `token ${token.trim()}`
  };

  // 1. Get authenticated user first to identify the logged-in user
  let authProfile;
  try {
    const res = await fetch('https://api.github.com/user', { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }
    authProfile = await res.json();
  } catch (err) {
    throw new Error('Failed to fetch authenticated user profile. Please check your network or token.');
  }

  const authUsername = authProfile.login;
  if (!authUsername) {
    throw new Error('Failed to retrieve authenticated username from session.');
  }

  const targetUsername = (username || authUsername).trim();
  const isSelf = targetUsername.toLowerCase() === authUsername.toLowerCase();

  let profile;
  let repos = [];

  if (isSelf) {
    profile = authProfile;
    try {
      const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', { headers });
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
      }
      repos = await res.json();
    } catch (err) {
      throw new Error('Failed to fetch repositories for authenticated user. Please try again.');
    }
  } else {
    // Analyzing a searched developer
    // Fetch profile
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(targetUsername)}`, { headers });
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
      }
      profile = await res.json();
    } catch (err) {
      throw new Error(`Failed to fetch profile for developer "${targetUsername}". Please check username.`);
    }

    // Fetch repos
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(targetUsername)}/repos?per_page=100&sort=updated`, { headers });
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
      }
      repos = await res.json();
    } catch (err) {
      throw new Error(`Failed to fetch repositories for developer "${targetUsername}". Please try again.`);
    }
  }

  return { profile, repos };
}

/**
 * Builds a compact developer context object from the fetched profile and repositories.
 * @param {Object} profile - GitHub user profile
 * @param {Array} repos - GitHub repositories array
 * @returns {Object} Developer context
 */
export function buildDeveloperContext(profile, repos) {
  if (!profile) {
    throw new Error('Profile data is missing.');
  }

  const languageStats = {};
  let totalStars = 0;

  const compactRepos = (repos || []).map(r => {
    if (r.language) {
      languageStats[r.language] = (languageStats[r.language] || 0) + 1;
    }
    totalStars += r.stargazers_count || 0;

    return {
      name: r.name,
      description: r.description || null,
      language: r.language || null,
      topics: r.topics || [],
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      created_at: r.created_at,
      updated_at: r.updated_at,
      homepage: r.homepage || null,
      visibility: r.visibility || null,
      size: r.size
    };
  });

  const topLanguages = Object.entries(languageStats)
    .sort((a, b) => b[1] - a[1])
    .map(entry => `${entry[0]} (${entry[1]} repos)`);

  return {
    profile: {
      login: profile.login,
      name: profile.name || null,
      bio: profile.bio || null,
      company: profile.company || null,
      location: profile.location || null,
      blog: profile.blog || null,
      public_repos: profile.public_repos,
      followers: profile.followers,
      following: profile.following,
      created_at: profile.created_at,
      total_stars_across_repos: totalStars
    },
    aggregated_skills: {
      top_languages: topLanguages,
      total_repositories_analyzed: compactRepos.length
    },
    repositories: compactRepos
  };
}

/**
 * Sends the real developer context to Gemini together with the selected action type.
 * @param {string} actionType - 'summarize'|'repos'|'learning'|'ideas'
 * @param {Object} developerContext - Compact developer context object
 * @returns {Promise<string>} AI-generated response text
 */
export async function generateAIInsight(actionType, developerContext) {
  const geminiKey = await getGeminiKey();
  if (!geminiKey) {
    throw new Error('Gemini API key not found. Please check your key in Settings.');
  }

  const contextJSON = JSON.stringify(developerContext, null, 2);
  
  let taskInstruction = '';
  const type = actionType.toLowerCase();
  
  if (type === 'summarize' || type.includes('profile')) {
    taskInstruction = 'Write a professional developer summary based on their profile bio, followers, repo count, and main languages. Write a concise, insightful 3-sentence summary of this developer\'s career, strengths, and primary focus. Make sure to acknowledge all major languages and backend/frontend capabilities they possess (using aggregated_skills), avoiding pigeonholing them into a single framework or project.';
  } else if (type === 'repos' || type.includes('analyze')) {
    taskInstruction = 'Provide bullet points, explain what kind of developer this person is based on their repositories. Focus on their specialization (what kind of apps/tools they build), their full stack capabilities if they use multiple languages (e.g., JavaScript, TypeScript, Kotlin, etc.), project impact (stars, forks, open issues), and their coding style/activity (topics, update frequency, repository sizes). Ensure you reflect their diverse skill set across all analyzed languages.';
  } else if (type === 'learning' || type.includes('path')) {
    taskInstruction = 'Suggest a personalized 3-step learning path to help them level up. Each step must be specific, actionable, and build on their existing diverse technologies (e.g., bridging their backend and frontend/mobile skills if applicable). Format as numbered steps. Do not focus entirely on one language if they use several.';
  } else if (type === 'ideas' || type.includes('project')) {
    taskInstruction = 'Suggest 3 creative and impactful new project ideas they could build. Each idea must leverage their existing diverse tech stack (combining backend and frontend/mobile if applicable) while introducing a clear new challenge. Format as numbered items with a unique project name and a 2-sentence description.';
  } else {
    taskInstruction = 'Provide a professional analysis of this developer, ensuring you account for their complete aggregated skill set across multiple languages and stacks.';
  }

  const prompt = `You are an expert developer intelligence assistant. You are analyzing a developer's profile and repositories based ONLY on the following real GitHub data context:

${contextJSON}

Task: ${taskInstruction}

Instructions for your response:
1. Generate your output based strictly and exclusively on the provided GitHub data. 
2. If any repository or profile data is missing or empty, explicitly state that the data is missing instead of making up or inventing any details, names, or metrics.
3. Be professional, insightful, and direct. Do not include any meta-commentary, introductory text, or concluding remarks.
4. Return only the final markdown content.
5. NEVER use generic placeholder templates, hardcoded text, or incomplete placeholders (such as "1.", "Primarily a full-", or generic list placeholders).
6. Ensure your response is fully complete and does not end abruptly.

Analyze the context and generate the response now:`;

  return callGemini(prompt, geminiKey);
}
