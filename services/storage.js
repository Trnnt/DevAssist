/**
 * Chrome Storage Service
 * Wraps chrome.storage.local with async/await support.
 * Manages favorites, settings, theme preference, and API keys.
 */

const STORAGE_KEYS = {
  FAVORITES: 'gh_favorites',
  THEME: 'gh_theme',
  GITHUB_TOKEN: 'githubToken',
  GITHUB_PAT_TOKEN: 'githubPatToken',
  GITHUB_OAUTH_TOKEN: 'githubOauthToken',
  GEMINI_KEY: 'geminiApiKey',
  GITHUB_CLIENT_ID: 'githubClientId',
  GITHUB_CLIENT_SECRET: 'githubClientSecret',
  AUTH_METHOD: 'authMethod',
  BACKEND_URL: 'backendUrl',
  SESSION_ACCESS_TOKEN: 'sessionAccessToken',
  SESSION_REFRESH_TOKEN: 'sessionRefreshToken',
  LOGGED_IN_USER: 'loggedInUser',
};

const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

/**
 * Generic getter for chrome.storage.local with localStorage fallback.
 * @param {string} key
 * @param {*} defaultValue
 * @returns {Promise<*>}
 */
function get(key, defaultValue = null) {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] !== undefined ? result[key] : defaultValue);
      });
    } else {
      const val = localStorage.getItem(key);
      if (val === null) {
        resolve(defaultValue);
      } else {
        try {
          resolve(JSON.parse(val));
        } catch {
          resolve(val);
        }
      }
    }
  });
}

/**
 * Generic setter for chrome.storage.local with localStorage fallback.
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
function set(key, value) {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.set({ [key]: value }, resolve);
    } else {
      try {
        localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value);
      } catch (e) {
        localStorage.setItem(key, value);
      }
      resolve();
    }
  });
}

/**
 * Generic remover for chrome.storage.local with localStorage fallback.
 * @param {string} key
 * @returns {Promise<void>}
 */
function remove(key) {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.remove([key], resolve);
    } else {
      localStorage.removeItem(key);
      resolve();
    }
  });
}

/* ─────────────────────────────────────────────
   Favorites API
───────────────────────────────────────────── */

async function isCloudSyncEnabled() {
  const method = await get(STORAGE_KEYS.AUTH_METHOD);
  const sessionToken = await get(STORAGE_KEYS.SESSION_ACCESS_TOKEN);
  return method === 'oauth' && !!sessionToken;
}

/**
 * Saves a developer to favorites.
 * @param {string} username - GitHub username
 * @param {Object} userData - GitHub user profile data
 * @returns {Promise<void>}
 */
export async function saveFavorite(username, userData) {
  const favorites = await getFavorites();
  const favObj = {
    login: userData.login,
    name: userData.name || userData.login,
    avatar_url: userData.avatar_url,
    bio: userData.bio,
    public_repos: userData.public_repos,
    followers: userData.followers,
    savedAt: new Date().toISOString(),
  };
  favorites[username.toLowerCase()] = favObj;
  await set(STORAGE_KEYS.FAVORITES, favorites);

  // Sync to Cloud
  if (await isCloudSyncEnabled()) {
    try {
      const { addCloudFavorite } = await import('./cloudSync.js');
      await addCloudFavorite(userData);
    } catch (err) {
      console.warn('[Sync] Failed to sync added favorite:', err.message);
    }
  }
}

/**
 * Returns all saved favorite developers.
 * @returns {Promise<Object>} Map of username → user data
 */
export async function getFavorites() {
  // If cloud favorites are cached under 'gh_favorites_cloud', we can return that, 
  // otherwise fallback to local favorites.
  const cloudFavs = await get('gh_favorites_cloud');
  if (cloudFavs && Object.keys(cloudFavs).length > 0) {
    return cloudFavs;
  }
  return await get(STORAGE_KEYS.FAVORITES, {});
}

/**
 * Removes a developer from favorites.
 * @param {string} username
 * @returns {Promise<void>}
 */
export async function removeFavorite(username) {
  const favorites = await getFavorites();
  delete favorites[username.toLowerCase()];
  await set(STORAGE_KEYS.FAVORITES, favorites);
  await set('gh_favorites_cloud', favorites); // Sync the cloud cache too

  // Sync to Cloud
  if (await isCloudSyncEnabled()) {
    try {
      const { removeCloudFavorite } = await import('./cloudSync.js');
      await removeCloudFavorite(username);
    } catch (err) {
      console.warn('[Sync] Failed to sync removed favorite:', err.message);
    }
  }
}

/**
 * Checks if a developer is in favorites.
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export async function isFavorite(username) {
  const favorites = await getFavorites();
  return !!favorites[username.toLowerCase()];
}

/* ─────────────────────────────────────────────
   Theme Preference
───────────────────────────────────────────── */

/**
 * Saves the user's theme preference.
 * @param {'dark'|'light'} theme
 */
export async function saveTheme(theme) {
  await set(STORAGE_KEYS.THEME, theme);

  // Sync to Cloud
  if (await isCloudSyncEnabled()) {
    try {
      const { saveCloudSettings } = await import('./cloudSync.js');
      await saveCloudSettings({ theme });
    } catch (err) {
      console.warn('[Sync] Failed to sync theme setting:', err.message);
    }
  }
}

/**
 * Gets the user's saved theme preference.
 * @returns {Promise<'dark'|'light'>}
 */
export async function getTheme() {
  return await get(STORAGE_KEYS.THEME, 'dark');
}

/* ─────────────────────────────────────────────
   Encryption / Decryption Helpers
 ───────────────────────────────────────────── */

const ENCRYPTION_KEY = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)
  ? chrome.runtime.id
  : 'devassist-default-encryption-salt-key';

/**
 * Encrypts cleartext using a key-based XOR cipher and base64 encoding.
 * @param {string} text
 * @param {string} key
 * @returns {string} Encrypted base64 string
 */
function xorEncrypt(text, key) {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

/**
 * Decrypts a base64 encoded XOR cipher string.
 * @param {string} encodedText
 * @param {string} key
 * @returns {string} Decrypted cleartext
 */
function xorDecrypt(encodedText, key) {
  if (!encodedText) return '';
  try {
    const text = atob(encodedText);
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch (e) {
    // Return original if it is not base64 or failed to decrypt (for backwards compatibility)
    return encodedText;
  }
}

/* ─────────────────────────────────────────────
   API Keys
 ───────────────────────────────────────────── */

/**
 * Saves the GitHub Personal Access Token.
 * @param {string} token
 */
export async function saveGithubPatToken(token) {
  const encrypted = xorEncrypt(token.trim(), ENCRYPTION_KEY);
  await set(STORAGE_KEYS.GITHUB_PAT_TOKEN, encrypted);
}

/**
 * Gets the GitHub Personal Access Token.
 * @returns {Promise<string>}
 */
export async function getGithubPatToken() {
  const stored = await get(STORAGE_KEYS.GITHUB_PAT_TOKEN, '');
  return xorDecrypt(stored, ENCRYPTION_KEY);
}

/**
 * Saves the GitHub OAuth token.
 * @param {string} token
 */
export async function saveGithubOauthToken(token) {
  const encrypted = xorEncrypt(token.trim(), ENCRYPTION_KEY);
  await set(STORAGE_KEYS.GITHUB_OAUTH_TOKEN, encrypted);
}

/**
 * Gets the GitHub OAuth token.
 * @returns {Promise<string>}
 */
export async function getGithubOauthToken() {
  const stored = await get(STORAGE_KEYS.GITHUB_OAUTH_TOKEN, '');
  return xorDecrypt(stored, ENCRYPTION_KEY);
}

/**
 * Gets the active GitHub token dynamically based on current authentication method.
 * @returns {Promise<string>}
 */
export async function getGithubToken() {
  const method = await getAuthMethod();
  if (method === 'oauth') {
    return await getGithubOauthToken();
  }
  return await getGithubPatToken();
}

/**
 * Saves the session access token.
 * @param {string} token
 */
export async function saveSessionAccessToken(token) {
  const encrypted = xorEncrypt(token.trim(), ENCRYPTION_KEY);
  await set(STORAGE_KEYS.SESSION_ACCESS_TOKEN, encrypted);
}

/**
 * Gets the session access token.
 * @returns {Promise<string>}
 */
export async function getSessionAccessToken() {
  const stored = await get(STORAGE_KEYS.SESSION_ACCESS_TOKEN, '');
  return xorDecrypt(stored, ENCRYPTION_KEY);
}

/**
 * Saves the session refresh token.
 * @param {string} token
 */
export async function saveSessionRefreshToken(token) {
  const encrypted = xorEncrypt(token.trim(), ENCRYPTION_KEY);
  await set(STORAGE_KEYS.SESSION_REFRESH_TOKEN, encrypted);
}

/**
 * Gets the session refresh token.
 * @returns {Promise<string>}
 */
export async function getSessionRefreshToken() {
  const stored = await get(STORAGE_KEYS.SESSION_REFRESH_TOKEN, '');
  return xorDecrypt(stored, ENCRYPTION_KEY);
}

/**
 * Saves the GitHub Personal Access Token (Legacy fallback / Deprecated).
 * @param {string} token
 */
export async function saveGithubToken(token) {
  const encrypted = xorEncrypt(token.trim(), ENCRYPTION_KEY);
  await set(STORAGE_KEYS.GITHUB_TOKEN, encrypted);
}

/**
 * Migrates any legacy token from 'githubToken' to appropriate storage slot based on auth method.
 */
export async function migrateLegacyToken() {
  const legacy = await get(STORAGE_KEYS.GITHUB_TOKEN, '');
  if (legacy && legacy.trim()) {
    const method = await getAuthMethod();
    if (method === 'oauth') {
      await set(STORAGE_KEYS.GITHUB_OAUTH_TOKEN, legacy);
    } else {
      await set(STORAGE_KEYS.GITHUB_PAT_TOKEN, legacy);
    }
    await remove(STORAGE_KEYS.GITHUB_TOKEN);
    console.log(`[Storage Migration] Successfully migrated legacy token to ${method.toUpperCase()} slot.`);
  }
}

/**
 * Saves the Gemini API key.
 * @param {string} key
 */
export async function saveGeminiKey(key) {
  const encrypted = xorEncrypt(key.trim(), ENCRYPTION_KEY);
  await set(STORAGE_KEYS.GEMINI_KEY, encrypted);
}

/**
 * Gets the Gemini API key.
 * @returns {Promise<string>}
 */
export async function getGeminiKey() {
  const stored = await get(STORAGE_KEYS.GEMINI_KEY, '');
  return xorDecrypt(stored, ENCRYPTION_KEY);
}

/**
 * Saves the GitHub Client ID.
 * @param {string} clientId
 */
export async function saveGithubClientId(clientId) {
  await set(STORAGE_KEYS.GITHUB_CLIENT_ID, clientId.trim());
}

/**
 * Gets the GitHub Client ID.
 * @returns {Promise<string>}
 */
export async function getGithubClientId() {
  let clientId = await get(STORAGE_KEYS.GITHUB_CLIENT_ID, '');
  if (clientId === 'Ov23liOvHUI1MK65i9LM' || clientId === 'Ov23liOvHU1MK65i9LM') {
    clientId = 'Ov23liOvHUl1MK65i9LM';
  }
  return clientId;
}

/**
 * Saves the GitHub Client Secret.
 * @param {string} clientSecret
 */
export async function saveGithubClientSecret(clientSecret) {
  const encrypted = xorEncrypt(clientSecret.trim(), ENCRYPTION_KEY);
  await set(STORAGE_KEYS.GITHUB_CLIENT_SECRET, encrypted);
}

/**
 * Gets the GitHub Client Secret.
 * @returns {Promise<string>}
 */
export async function getGithubClientSecret() {
  const stored = await get(STORAGE_KEYS.GITHUB_CLIENT_SECRET, '');
  return xorDecrypt(stored, ENCRYPTION_KEY);
}

/**
 * Saves the authentication method ('pat' or 'oauth').
 * @param {'pat'|'oauth'} method
 */
export async function saveAuthMethod(method) {
  await set(STORAGE_KEYS.AUTH_METHOD, method);
}

/**
 * Gets the authentication method.
 * @returns {Promise<'pat'|'oauth'>}
 */
export async function getAuthMethod() {
  return await get(STORAGE_KEYS.AUTH_METHOD, 'pat');
}

/**
 * Saves the Backend URL.
 * @param {string} url
 */
export async function saveBackendUrl(url) {
  await set(STORAGE_KEYS.BACKEND_URL, url.trim());
}

/**
 * Gets the Backend URL.
 * @returns {Promise<string>}
 */
export async function getBackendUrl() {
  return await get(STORAGE_KEYS.BACKEND_URL, 'https://devassist-yfli.onrender.com');
}

/* ─────────────────────────────────────────────
   History API
   ───────────────────────────────────────────── */

/**
 * Gets the list of recently searched GitHub usernames.
 * @returns {Promise<Array<string>>}
 */
export async function getHistory() {
  return await get('gh_history', []);
}

/**
 * Saves a username to history.
 * @param {string} username
 */
export async function saveToHistory(username) {
  if (!username) return;
  let history = await get('gh_history', []);
  history = history.filter(u => u.toLowerCase() !== username.toLowerCase());
  history.unshift(username);
  if (history.length > 10) history.pop();
  await set('gh_history', history);

  // Sync to Cloud
  if (await isCloudSyncEnabled()) {
    try {
      const { recordCloudSearch } = await import('./cloudSync.js');
      await recordCloudSearch(username);
    } catch (err) {
      console.warn('[Sync] Failed to sync search history:', err.message);
    }
  }
}

/**
 * Clears search history.
 */
export async function clearHistory() {
  await set('gh_history', []);

  // Sync to Cloud
  if (await isCloudSyncEnabled()) {
    try {
      const { clearCloudHistory } = await import('./cloudSync.js');
      await clearCloudHistory();
    } catch (err) {
      console.warn('[Sync] Failed to sync cleared history:', err.message);
    }
  }
}

/**
 * Gets the repository AI generation history.
 * @returns {Promise<Array<Object>>}
 */
export async function getRepoHistory() {
  return await get('gh_repo_history', []);
}

/**
 * Saves a repository AI generation action to history.
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} action - e.g., 'Generated README', 'Architecture Docs'
 */
export async function saveRepoHistory(owner, repo, action) {
  if (!owner || !repo || !action) return;
  
  let history = await get('gh_repo_history', []);
  const newItem = {
    id: Date.now().toString(),
    owner,
    repo,
    action,
    timestamp: new Date().toISOString()
  };
  
  history.unshift(newItem);
  if (history.length > 20) history.pop(); // Keep up to 20 repo history items
  await set('gh_repo_history', history);
}

/**
 * Removes a specific repository history item by ID.
 * @param {string} id
 */
export async function removeRepoHistory(id) {
  let history = await get('gh_repo_history', []);
  history = history.filter(item => item.id !== id);
  await set('gh_repo_history', history);
}

/* ─────────────────────────────────────────────
   Preferences Sync API
   ───────────────────────────────────────────── */

/**
 * Saves notifications preference and syncs to cloud.
 * @param {boolean} enabled
 */
export async function saveNotificationsEnabled(enabled) {
  await set('gh_notifications_enabled', enabled);

  // Sync to Cloud
  if (await isCloudSyncEnabled()) {
    try {
      const { saveCloudSettings } = await import('./cloudSync.js');
      await saveCloudSettings({ notificationsEnabled: enabled });
    } catch (err) {
      console.warn('[Sync] Failed to sync notifications setting:', err.message);
    }
  }
}

/**
 * Retrieves notifications preference.
 * @returns {Promise<boolean>}
 */
export async function getNotificationsEnabled() {
  return await get('gh_notifications_enabled', true);
}

/**
 * Saves dashboard view preference and syncs to cloud.
 * @param {Object} prefs
 */
export async function saveDashboardPreferences(prefs) {
  await set('gh_dashboard_preferences', prefs);

  // Sync to Cloud
  if (await isCloudSyncEnabled()) {
    try {
      const { saveCloudSettings } = await import('./cloudSync.js');
      await saveCloudSettings({ dashboardPreferences: prefs });
    } catch (err) {
      console.warn('[Sync] Failed to sync dashboard preferences:', err.message);
    }
  }
}

/**
 * Retrieves dashboard view preference.
 * @returns {Promise<Object>}
 */
export async function getDashboardPreferences() {
  return await get('gh_dashboard_preferences', {});
}

/**
 * Saves AI mode preference and syncs to cloud.
 * @param {Object} prefs
 */
export async function saveAIPreferences(prefs) {
  await set('gh_ai_preferences', prefs);

  // Sync to Cloud
  if (await isCloudSyncEnabled()) {
    try {
      const { saveCloudSettings } = await import('./cloudSync.js');
      await saveCloudSettings({ aiPreferences: prefs });
    } catch (err) {
      console.warn('[Sync] Failed to sync AI preferences:', err.message);
    }
  }
}

/**
 * Retrieves AI mode preference.
 * @returns {Promise<Object>}
 */
export async function getAIPreferences() {
  return await get('gh_ai_preferences', {});
}

/**
 * Saves the logged-in user profile details.
 * @param {Object|null} user
 */
export async function saveLoggedInUser(user) {
  await set(STORAGE_KEYS.LOGGED_IN_USER, user);
}

/**
 * Gets the logged-in user profile details.
 * @returns {Promise<Object|null>}
 */
export async function getLoggedInUser() {
  return await get(STORAGE_KEYS.LOGGED_IN_USER, null);
}

/* ─────────────────────────────────────────────
   Phase 4.2.4: Repository Context Cache
   ───────────────────────────────────────────── */

/**
 * Saves repository context to cache.
 * @param {string} owner 
 * @param {string} repo 
 * @param {Object} context 
 */
export async function saveRepoContextCache(owner, repo, context) {
  const CACHE_CAP = 10;
  const newKey = `repoCtx:${owner.toLowerCase()}/${repo.toLowerCase()}`;
  
  // Get all current storage to find existing cached repos
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      let cachedKeys = [];
      for (const key in items) {
        if (key.startsWith('repoCtx:')) {
          cachedKeys.push({ key, timestamp: items[key].timestamp || 0 });
        }
      }
      
      // If we are at or above cap, and this is a new key, we need to evict the oldest
      if (cachedKeys.length >= CACHE_CAP && !items[newKey]) {
        // Sort by oldest first
        cachedKeys.sort((a, b) => a.timestamp - b.timestamp);
        const keysToRemove = cachedKeys.slice(0, cachedKeys.length - CACHE_CAP + 1).map(c => c.key);
        chrome.storage.local.remove(keysToRemove);
      }
      
      chrome.storage.local.set({
        [newKey]: {
          timestamp: Date.now(),
          context: context
        }
      }, () => resolve());
    });
  });
}

/**
 * Retrieves repository context from cache if valid.
 * @param {string} owner 
 * @param {string} repo 
 * @param {number} maxAgeMs Default is 30 minutes (1800000 ms)
 * @returns {Promise<Object|null>}
 */
export async function getRepoContextCache(owner, repo, maxAgeMs = 1800000) {
  const key = `repoCtx:${owner.toLowerCase()}/${repo.toLowerCase()}`;
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const data = result[key];
      if (data && data.timestamp && data.context) {
        const age = Date.now() - data.timestamp;
        if (age <= maxAgeMs) {
          resolve(data.context);
          return;
        } else {
          // Expired, clean it up
          chrome.storage.local.remove([key]);
        }
      }
      resolve(null);
    });
  });
}
