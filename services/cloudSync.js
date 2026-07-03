/**
 * Cloud Sync Service
 * Handles all communication with the DevAssist backend API for:
 *   - Favorites (CRUD)
 *   - Search History (read / record / clear)
 *   - User Settings (read / update)
 *   - User Profile (read)
 *
 * Implements offline-resilient write queuing:
 *   - Failed writes are stored in chrome.storage.local under 'sync_queue'
 *   - The queue is retried on the next successful API call
 */

import {
  getSessionAccessToken,
  getSessionRefreshToken,
  saveSessionAccessToken,
  getBackendUrl,
} from './storage.js';

const hasChromeStorage =
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

function _storageGet(key, def = null) {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.get([key], (r) =>
        resolve(r[key] !== undefined ? r[key] : def)
      );
    } else {
      try { resolve(JSON.parse(localStorage.getItem(key)) ?? def); }
      catch { resolve(def); }
    }
  });
}

function _storageSet(key, value) {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.set({ [key]: value }, resolve);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
      resolve();
    }
  });
}

const QUEUE_KEY = 'devassist_sync_queue';

// ── Token refresh helper ───────────────────────────────────────
async function _refreshAccessToken(backendUrl) {
  const refreshToken = await getSessionRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available.');

  const res = await fetch(`${backendUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) throw new Error('Token refresh failed.');
  const data = await res.json();
  if (data.accessToken) await saveSessionAccessToken(data.accessToken);
  return data.accessToken;
}

// ── Authenticated fetch with auto-refresh ─────────────────────
async function apiFetch(path, options = {}, retried = false) {
  const backendUrl = await getBackendUrl();
  let token = await getSessionAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${backendUrl}${path}`, { ...options, headers });
  } catch (networkErr) {
    // Network unavailable
    throw Object.assign(new Error('Network unavailable'), { type: 'NETWORK_ERROR' });
  }

  // Auto-refresh expired access token once
  if (res.status === 403 && !retried) {
    try {
      await _refreshAccessToken(backendUrl);
      return apiFetch(path, options, true);
    } catch (_) {
      throw Object.assign(new Error('Session expired. Please log in again.'), {
        type: 'AUTH_ERROR',
      });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }

  return res.json();
}

// ── Offline Write Queue ────────────────────────────────────────
async function _enqueue(operation) {
  const queue = await _storageGet(QUEUE_KEY, []);
  queue.push({ ...operation, queuedAt: Date.now() });
  await _storageSet(QUEUE_KEY, queue);
}

async function _drainQueue() {
  const queue = await _storageGet(QUEUE_KEY, []);
  if (!queue.length) return;

  const remaining = [];
  for (const op of queue) {
    try {
      await apiFetch(op.path, op.options);

    } catch (err) {
      if (err.type === 'NETWORK_ERROR') {
        remaining.push(op); // Keep for next retry
      }
      // Auth errors or invalid ops are dropped
    }
  }

  await _storageSet(QUEUE_KEY, remaining);
}

// ── User Profile ──────────────────────────────────────────────

/**
 * Fetches the authenticated user's profile from the backend.
 * @returns {Promise<Object>} User profile
 */
export async function fetchCloudProfile() {
  await _drainQueue();
  return apiFetch('/api/user');
}

// ── Favorites ─────────────────────────────────────────────────

/**
 * Fetches all favorites from the cloud.
 * @returns {Promise<Array>} List of favorite developers
 */
export async function fetchCloudFavorites() {
  await _drainQueue();
  const data = await apiFetch('/api/favorites');
  return data.favorites || [];
}

/**
 * Adds a developer to cloud favorites.
 * Falls back to write queue if offline.
 * @param {Object} userData
 */
export async function addCloudFavorite(userData) {
  const op = {
    path: '/api/favorites',
    options: {
      method: 'POST',
      body: JSON.stringify({
        username: userData.login,
        login: userData.login,
        name: userData.name,
        avatarUrl: userData.avatar_url,
        bio: userData.bio,
        publicRepos: userData.public_repos,
        followers: userData.followers,
      }),
    },
  };

  try {
    await _drainQueue();
    await apiFetch(op.path, op.options);
  } catch (err) {
    if (err.type === 'NETWORK_ERROR') {
      await _enqueue(op);
      console.warn('[CloudSync] Offline — queued addFavorite for:', userData.login);
    } else {
      throw err;
    }
  }
}

/**
 * Removes a developer from cloud favorites.
 * Falls back to write queue if offline.
 * @param {string} username
 */
export async function removeCloudFavorite(username) {
  const op = {
    path: `/api/favorites/${username.toLowerCase()}`,
    options: { method: 'DELETE' },
  };

  try {
    await _drainQueue();
    await apiFetch(op.path, op.options);
  } catch (err) {
    if (err.type === 'NETWORK_ERROR') {
      await _enqueue(op);
      console.warn('[CloudSync] Offline — queued removeFavorite for:', username);
    } else {
      throw err;
    }
  }
}

// ── Search History ─────────────────────────────────────────────

/**
 * Fetches recent search history from the cloud.
 * @param {number} limit Max items to fetch (default 20)
 * @returns {Promise<Array>} List of history items
 */
export async function fetchCloudHistory(limit = 20) {
  await _drainQueue();
  const data = await apiFetch(`/api/history?limit=${limit}`);
  return data.history || [];
}

/**
 * Records a developer search to the cloud.
 * Falls back to write queue if offline.
 * @param {string} searchedUsername
 */
export async function recordCloudSearch(searchedUsername) {
  const op = {
    path: '/api/history',
    options: {
      method: 'POST',
      body: JSON.stringify({ searchedUsername }),
    },
  };

  try {
    await apiFetch(op.path, op.options);
  } catch (err) {
    if (err.type === 'NETWORK_ERROR') {
      await _enqueue(op);
    }
    // Non-critical — don't throw
  }
}

/**
 * Clears all cloud search history.
 */
export async function clearCloudHistory() {
  try {
    await apiFetch('/api/history', { method: 'DELETE' });
  } catch (err) {
    if (err.type === 'NETWORK_ERROR') {
      await _enqueue({ path: '/api/history', options: { method: 'DELETE' } });
    } else {
      throw err;
    }
  }
}

// ── Settings ──────────────────────────────────────────────────

/**
 * Fetches user settings from the cloud.
 * @returns {Promise<Object>} Settings object
 */
export async function fetchCloudSettings() {
  await _drainQueue();
  const data = await apiFetch('/api/settings');
  return data.settings || {};
}

/**
 * Saves a partial settings update to the cloud.
 * Falls back to write queue if offline.
 * @param {Object} partial - Partial settings to update
 */
export async function saveCloudSettings(partial) {
  const op = {
    path: '/api/settings',
    options: {
      method: 'PUT',
      body: JSON.stringify(partial),
    },
  };

  try {
    await _drainQueue();
    await apiFetch(op.path, op.options);
  } catch (err) {
    if (err.type === 'NETWORK_ERROR') {
      await _enqueue(op);
      console.warn('[CloudSync] Offline — queued settings update.');
    } else {
      throw err;
    }
  }
}

// ── Sync-on-Login orchestrator ────────────────────────────────

/**
 * Runs the full sync sequence after a successful login.
 * Fetches all user data and merges it into local storage.
 *
 * @param {Function} onFavoritesLoaded - Called with favorites array
 * @param {Function} onHistoryLoaded - Called with history array
 * @param {Function} onSettingsLoaded - Called with settings object
 */
export async function syncAfterLogin(
  onFavoritesLoaded,
  onHistoryLoaded,
  onSettingsLoaded
) {
  try {
    // Drain any queued writes first
    await _drainQueue();

    const [favorites, history, settings] = await Promise.allSettled([
      fetchCloudFavorites(),
      fetchCloudHistory(),
      fetchCloudSettings(),
    ]);

    if (favorites.status === 'fulfilled') {
      const favMap = {};
      favorites.value.forEach((f) => {
        favMap[f.login?.toLowerCase() || f.id] = f;
      });
      // Merge into local favorites cache
      await _storageSet('gh_favorites_cloud', favMap);
      onFavoritesLoaded?.(favorites.value);
    }

    if (history.status === 'fulfilled') {
      const usernames = history.value.map((h) => h.searchedUsername);
      // Merge into local history (cloud is authoritative)
      await _storageSet('gh_history', usernames);
      onHistoryLoaded?.(usernames);
    }

    if (settings.status === 'fulfilled' && settings.value) {
      // Apply cloud settings locally
      if (settings.value.theme) await _storageSet('gh_theme', settings.value.theme);
      if (settings.value.notificationsEnabled !== undefined) {
        await _storageSet('gh_notifications_enabled', settings.value.notificationsEnabled);
      }
      if (settings.value.dashboardPreferences !== undefined) {
        await _storageSet('gh_dashboard_preferences', settings.value.dashboardPreferences);
      }
      if (settings.value.aiPreferences !== undefined) {
        await _storageSet('gh_ai_preferences', settings.value.aiPreferences);
      }
      onSettingsLoaded?.(settings.value);
    }

  } catch (err) {
    // Non-fatal — extension still works locally
    console.warn('[CloudSync] Sync after login partially failed:', err.message);
  }
}
