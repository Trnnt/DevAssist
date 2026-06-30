import { getGithubToken } from './storage.js';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Builds request headers, optionally including a GitHub PAT.
 * @returns {Object} Headers object
 */
export async function buildHeaders() {
  const token = await getGithubToken();
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  if (token && token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }
  return headers;
}

/**
 * Fetches a GitHub user's public profile.
 * @param {string} username - GitHub username
 * @returns {Promise<Object>} User profile data
 * @throws {Error} On 404 (not found), 403 (rate limit), or network errors
 */
export async function getUser(username) {
  if (!username || !username.trim()) {
    throw new Error('Username cannot be empty.');
  }

  const sanitized = username.trim().toLowerCase();
  const headers = await buildHeaders();

  let response;
  try {
    response = await fetch(`${GITHUB_API_BASE}/users/${sanitized}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('GitHub API request timed out. Please try again.');
    throw new Error('Network error. Please check your internet connection.');
  }

  // Parse rate limit headers for display
  const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
  const rateLimitTotal = response.headers.get('X-RateLimit-Limit');
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');

  if (response.status === 404) {
    throw new Error(`User "${username}" not found on GitHub.`);
  }

  if (response.status === 403) {
    const resetTime = rateLimitReset
      ? new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString()
      : 'unknown time';
    throw new Error(`GitHub API rate limit exceeded. Resets at ${resetTime}. Add a GitHub token in Settings for higher limits.`);
  }

  if (response.status === 401) {
    throw new Error('Invalid GitHub token. Please check your token in Settings.');
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Attach rate limit info to the response for footer display
  data._rateLimit = {
    remaining: rateLimitRemaining,
    total: rateLimitTotal,
    reset: rateLimitReset,
  };

  return data;
}

/**
 * Fetches all public repositories for a GitHub user.
 * Handles pagination to get all repos (up to GitHub's limit of 100 per page).
 * @param {string} username - GitHub username
 * @returns {Promise<Array>} Array of repository objects
 */
export async function getRepos(username) {
  if (!username || !username.trim()) {
    throw new Error('Username cannot be empty.');
  }

  const sanitized = username.trim().toLowerCase();
  const headers = await buildHeaders();

  let allRepos = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      let response;
      try {
        response = await fetch(
          `${GITHUB_API_BASE}/users/${sanitized}/repos?per_page=${perPage}&page=${page}&sort=updated`,
          { headers, signal: AbortSignal.timeout(10000) }
        );
      } catch (err) {
        if (err.name === 'TimeoutError') throw new Error('GitHub API request timed out. Please try again.');
        throw new Error('Network error. Please check your internet connection.');
      }

      if (response.status === 404) {
        throw new Error(`User "${username}" not found.`);
      }

      if (response.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Add a GitHub token in Settings for higher limits.');
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const repos = await response.json();
      allRepos = allRepos.concat(repos);

      // If fewer than perPage results, we've fetched everything
      if (repos.length < perPage) break;
      page++;

      // Safety limit: max 5 pages (500 repos)
      if (page > 5) break;
    }
  } catch (err) {
    throw err;
  }

  return allRepos;
}

/**
 * Fetches rate limit status from the GitHub API.
 * @returns {Promise<Object>} Rate limit data
 */
export async function getRateLimit() {
  const headers = await buildHeaders();
  try {
    const response = await fetch(`${GITHUB_API_BASE}/rate_limit`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.rate;
  } catch {
    return null;
  }
}

/**
 * Validates a GitHub Personal Access Token (PAT) by calling user profile endpoint.
 * @param {string} token
 * @returns {Promise<boolean>} True if valid, false otherwise
 */
export async function validateToken(token) {
  if (!token || !token.trim()) return false;
  try {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token.trim()}`
      },
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches followers for a GitHub user.
 * @param {string} username - GitHub username
 * @returns {Promise<Array>} Array of follower user objects
 */
export async function getFollowers(username) {
  if (!username || !username.trim()) {
    throw new Error('Username cannot be empty.');
  }
  const sanitized = username.trim().toLowerCase();
  const headers = await buildHeaders();
  const response = await fetch(
    `${GITHUB_API_BASE}/users/${sanitized}/followers?per_page=100`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch followers: ${response.status}`);
  }
  return await response.json();
}

/**
 * Fetches users followed by a GitHub user.
 * @param {string} username - GitHub username
 * @returns {Promise<Array>} Array of user objects
 */
export async function getFollowing(username) {
  if (!username || !username.trim()) {
    throw new Error('Username cannot be empty.');
  }
  const sanitized = username.trim().toLowerCase();
  const headers = await buildHeaders();
  const response = await fetch(
    `${GITHUB_API_BASE}/users/${sanitized}/following?per_page=100`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch following: ${response.status}`);
  }
  return await response.json();
}

/**
 * Fetches repository metadata.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} Repository metadata
 */
export async function getRepoDetails(owner, repo) {
  if (!owner || !repo) throw new Error('Owner and repo are required.');
  const headers = await buildHeaders();
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Failed to fetch repo details: ${response.status}`);
  return await response.json();
}

/**
 * Fetches the git tree of a repository recursively.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} sha - Branch name or commit SHA
 * @returns {Promise<Object>} The repository tree
 */
export async function getRepoTree(owner, repo, sha) {
  if (!owner || !repo || !sha) throw new Error('Owner, repo, and sha are required.');
  const headers = await buildHeaders();
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, {
    headers, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Failed to fetch repo tree: ${response.status}`);
  return await response.json();
}

/**
 * Fetches the content of a file from the repository.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path
 * @param {string} sha - Branch name or commit SHA
 * @returns {Promise<string>} The decoded file content
 */
export async function getFileContent(owner, repo, path, sha) {
  const headers = await buildHeaders();
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${sha}`, {
    headers, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Failed to fetch file content: ${response.status}`);
  const data = await response.json();
  if (data.content && data.encoding === 'base64') {
    return decodeURIComponent(escape(atob(data.content)));
  }
  return '';
}
