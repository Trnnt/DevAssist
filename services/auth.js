/**
 * Authentication and Session Lifecycle Manager
 * Handles login, logout, session validation, active token resolution,
 * user profile retrieval, caching, offline status, and event distribution.
 */

import {
  getAuthMethod,
  saveAuthMethod,
  getGithubPatToken,
  saveGithubPatToken,
  getGithubOauthToken,
  saveGithubOauthToken,
  getGithubToken,
  getGithubClientId,
  saveGithubClientId,
  getGithubClientSecret,
  saveGithubClientSecret,
  saveSessionAccessToken,
  getSessionAccessToken,
  saveSessionRefreshToken,
  getSessionRefreshToken,
  getBackendUrl,
  saveLoggedInUser
} from './storage.js';

import { AUTH_EVENTS, SESSION_STATES, AUTH_METHODS } from './authConstants.js';

const GITHUB_API_BASE = 'https://api.github.com';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Custom Auth Exception class for structured error classification.
 */
export class AuthException extends Error {
  constructor(type, message) {
    super(message);
    this.name = 'AuthException';
    this.type = type; // 'AUTH_ERROR', 'NETWORK_ERROR', 'RATE_LIMIT_ERROR', 'UNKNOWN_ERROR'
  }
}

class AuthStateManagerClass {
  constructor() {
    this._currentUser = null;
    this._cachedAt = null;
    this._authenticatedAt = null;
    this._lastValidatedAt = null;
    this._currentAuthMethod = null;
    this._lastError = null;
    this._listeners = new Set();
  }

  /**
   * Gets the cached authenticated user metadata.
   * @returns {Object|null}
   */
  get currentUser() {
    return this._currentUser;
  }

  /**
   * Sets the cached authenticated user metadata.
   * @param {Object|null} user
   */
  set currentUser(user) {
    this._currentUser = user;
  }

  /**
   * Subscribe to authentication and session state change events.
   * @param {Function} callback - Callback function (event, data)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this.unsubscribe(callback);
  }

  /**
   * Unsubscribe a callback from events.
   * @param {Function} callback
   */
  unsubscribe(callback) {
    this._listeners.delete(callback);
  }

  /**
   * Broadcast authentication events to all subscribers.
   * @param {string} event
   * @param {Object} [data]
   */
  notify(event, data) {
    for (const callback of this._listeners) {
      try {
        callback(event, data);
      } catch (err) {
        console.error('Error in AuthStateManager subscriber callback:', err);
      }
    }
  }

  /**
   * Gets the current active decrypted GitHub access token.
   * @returns {Promise<string>}
   */
  async getToken() {
    try {
      return await getGithubToken();
    } catch (err) {
      throw new AuthException('UNKNOWN_ERROR', 'Failed to retrieve active token: ' + err.message);
    }
  }

  /**
   * Checks if the user is currently logged in (has a non-empty token).
   * @returns {Promise<boolean>}
   */
  async isLoggedIn() {
    const token = await this.getToken();
    return !!token && token.trim().length > 0;
  }

  /**
   * Gets details of the current user session state.
   * @returns {Object}
   */
  getSessionInfo() {
    return {
      isLoggedIn: !!this._currentUser,
      authMethod: this._currentAuthMethod,
      username: this._currentUser ? this._currentUser.login : null,
      authenticatedAt: this._authenticatedAt,
      lastValidatedAt: this._lastValidatedAt,
      cacheAge: this._cachedAt ? (Date.now() - this._cachedAt) : null
    };
  }

  /**
   * Fetches the user profile from GitHub API with error classification.
   * @param {string} token - GitHub Access Token
   * @returns {Promise<Object>} Profile JSON
   * @throws {AuthException}
   */
  async _fetchProfile(token) {
    try {
      const response = await fetch(`${GITHUB_API_BASE}/user`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${token.trim()}`
        }
      });

      if (response.status === 401) {
        throw new AuthException('AUTH_ERROR', 'Unauthorized: Invalid or revoked GitHub token.');
      }
      if (response.status === 403) {
        throw new AuthException('RATE_LIMIT_ERROR', 'GitHub API rate limit exceeded.');
      }
      if (!response.ok) {
        throw new AuthException('UNKNOWN_ERROR', `GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      if (err instanceof AuthException) {
        throw err;
      }
      // Network failures generally throw a TypeError
      throw new AuthException('NETWORK_ERROR', 'Unable to reach GitHub API. Check your internet connection.');
    }
  }

  /**
   * Validates the currently active session.
   * Returns validation result and broadcasts appropriate events.
   * @returns {Promise<string>} 'VALID', 'EXPIRED', or 'OFFLINE'
   */
  async validateSession() {
    const token = await this.getToken();
    if (!token || !token.trim()) {
      this._lastError = new AuthException('AUTH_ERROR', 'No active session token found.');
      this.notify(AUTH_EVENTS.SESSION_EXPIRED, { reason: 'No active session token found.' });
      return SESSION_STATES.EXPIRED;
    }

    try {
      const profile = await this._fetchProfile(token);
      this._lastValidatedAt = Date.now();
      this._currentUser = profile;
      this._cachedAt = Date.now();
      this._currentAuthMethod = await getAuthMethod();
      this._lastError = null;
      await saveLoggedInUser(profile);
      this.notify(AUTH_EVENTS.SESSION_VALID, { user: profile });
      return SESSION_STATES.VALID;
    } catch (err) {
      this._lastError = err;
      if (err.type === 'NETWORK_ERROR') {
        this.notify(AUTH_EVENTS.SESSION_OFFLINE, { error: err.message });
        return SESSION_STATES.OFFLINE;
      }
      this._currentUser = null;
      this._cachedAt = null;
      await saveLoggedInUser(null);
      this.notify(AUTH_EVENTS.SESSION_EXPIRED, { reason: err.message });
      return SESSION_STATES.EXPIRED;
    }
  }

  /**
   * Authenticates the user with PAT or OAuth, validates credentials, and caches profile.
   * @param {string} method - 'pat' or 'oauth'
   * @param {Object} credentials
   * @param {string} credentials.token - Token to authenticate
   * @param {string} [credentials.clientId] - Client ID (OAuth only)
   * @param {string} [credentials.clientSecret] - Client Secret (OAuth only)
   * @returns {Promise<Object>} The authenticated user profile
   * @throws {AuthException}
   */
  async login(method, credentials) {
    if (method !== AUTH_METHODS.PAT && method !== AUTH_METHODS.OAUTH) {
      throw new AuthException('UNKNOWN_ERROR', `Unsupported authentication method: ${method}`);
    }

    try {
      const token = credentials.token || '';
      if (!token || !token.trim()) {
        throw new AuthException('AUTH_ERROR', 'Token is required for login.');
      }

      // 1. Validate token by fetching profile first
      const profile = await this._fetchProfile(token);

      // 2 & 3. Save credentials and active authMethod
      if (method === AUTH_METHODS.PAT) {
        await saveGithubPatToken(token);
      } else {
        await saveGithubOauthToken(token);
        if (credentials.clientId) await saveGithubClientId(credentials.clientId);
        if (credentials.clientSecret) await saveGithubClientSecret(credentials.clientSecret);
        if (credentials.accessToken) await saveSessionAccessToken(credentials.accessToken);
        if (credentials.refreshToken) await saveSessionRefreshToken(credentials.refreshToken);
      }
      await saveAuthMethod(method);
      await saveLoggedInUser(profile);

      // 4, 5, 6. Cache profile and update metadata timestamps
      const now = Date.now();
      this._currentUser = profile;
      this._cachedAt = now;
      this._authenticatedAt = now;
      this._lastValidatedAt = now;
      this._currentAuthMethod = method;
      this._lastError = null;

      // 7. Fire login event
      this.notify(AUTH_EVENTS.LOGIN, { method, user: profile });
      return profile;
    } catch (err) {
      this._lastError = err;
      if (err instanceof AuthException) {
        throw err;
      }
      throw new AuthException('UNKNOWN_ERROR', err.message);
    }
  }

  /**
   * Logs out the user by clearing credentials of the active method and resetting cache.
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      const method = await getAuthMethod();
      if (method === AUTH_METHODS.OAUTH) {
        await saveGithubOauthToken('');
        await saveGithubClientId('');
        await saveGithubClientSecret('');
        await saveSessionAccessToken('');
        await saveSessionRefreshToken('');
      } else {
        await saveGithubPatToken('');
      }
      await saveLoggedInUser(null);

      const oldUser = this._currentUser;
      const oldMethod = method;

      // Reset cache
      this._currentUser = null;
      this._cachedAt = null;
      this._authenticatedAt = null;
      this._lastValidatedAt = null;
      this._currentAuthMethod = null;

      this.notify(AUTH_EVENTS.LOGOUT, { method: oldMethod, user: oldUser });
    } catch (err) {
      throw new AuthException('UNKNOWN_ERROR', 'Logout failed: ' + err.message);
    }
  }

  /**
   * Gets the currently logged-in user profile, utilizing in-memory cache if age < TTL.
   * @returns {Promise<Object|null>} User profile object or null
   */
  async getLoggedInUser() {
    const loggedIn = await this.isLoggedIn();
    if (!loggedIn) {
      return null;
    }

    const now = Date.now();
    const isCacheValid = this._currentUser && this._cachedAt && (now - this._cachedAt < CACHE_TTL);

    if (isCacheValid) {
      return this._currentUser;
    }

    // Cache expired or missing, fetch fresh data
    const token = await this.getToken();
    try {
      const profile = await this._fetchProfile(token);
      this._currentUser = profile;
      this._cachedAt = now;
      this._lastValidatedAt = now;
      this._currentAuthMethod = await getAuthMethod();
      return profile;
    } catch (err) {
      if (err.type === 'NETWORK_ERROR') {
        this.notify(AUTH_EVENTS.SESSION_OFFLINE, { error: err.message });
      } else if (err.type === 'AUTH_ERROR') {
        this._currentUser = null;
        this._cachedAt = null;
        this.notify(AUTH_EVENTS.SESSION_EXPIRED, { reason: err.message });
      }
      throw err;
    }
  }

  /**
   * Refreshes the active session, updating user metadata cache if valid.
   * @returns {Promise<boolean>} True if refresh was successful and session is valid
   */
  async refreshSession() {
    const token = await this.getToken();
    if (!token || !token.trim()) {
      this._currentUser = null;
      this._cachedAt = null;
      this._lastError = new AuthException('AUTH_ERROR', 'No active session token found.');
      this.notify(AUTH_EVENTS.SESSION_EXPIRED, { reason: 'No active session token found.' });
      return false;
    }

    try {
      const profile = await this._fetchProfile(token);
      const now = Date.now();
      this._currentUser = profile;
      this._cachedAt = now;
      this._lastValidatedAt = now;
      this._currentAuthMethod = await getAuthMethod();
      this._lastError = null;

      this.notify(AUTH_EVENTS.SESSION_REFRESHED, { user: profile });
      return true;
    } catch (err) {
      this._lastError = err;
      if (err.type === 'NETWORK_ERROR') {
        this.notify(AUTH_EVENTS.SESSION_OFFLINE, { error: err.message });
      } else {
        this._currentUser = null;
        this._cachedAt = null;
        this.notify(AUTH_EVENTS.SESSION_EXPIRED, { reason: err.message });
      }
      return false;
    }
  }

  /**
   * Refreshes the backend session JWT using the stored refresh token.
   * @returns {Promise<string|null>} The new access token, or null if failed
   */
  async refreshBackendTokens() {
    try {
      const refreshToken = await getSessionRefreshToken();
      if (!refreshToken) {
        console.warn('[Auth] No refresh token found.');
        return null;
      }

      const backendUrl = (await getBackendUrl() || 'http://localhost:3000').replace(/\/$/, '');
      const response = await fetch(`${backendUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) {
        console.error('[Auth] Failed to refresh backend tokens, status:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.accessToken) {
        await saveSessionAccessToken(data.accessToken);
        console.log('[Auth] Backend tokens refreshed successfully.');
        return data.accessToken;
      }
      return null;
    } catch (err) {
      console.error('[Auth] Error refreshing backend tokens:', err.message);
      return null;
    }
  }

  /**
   * Retrieves a valid backend session access token, auto-refreshing if expired.
   * @returns {Promise<string|null>}
   */
  async getValidBackendToken() {
    let accessToken = await getSessionAccessToken();
    if (!accessToken || isTokenExpired(accessToken)) {
      console.log('[Auth] Access token expired or missing. Refreshing...');
      accessToken = await this.refreshBackendTokens();
    }
    return accessToken;
  }
}

/**
 * Checks if a JWT is expired.
 * @param {string} token
 * @returns {boolean}
 */
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
    // Add 10 seconds buffer
    return (payload.exp * 1000) < (Date.now() + 10000);
  } catch {
    return true;
  }
}

// Export singleton instance
export const AuthStateManager = new AuthStateManagerClass();

// Standalone exports wrapping the singleton manager
export async function getToken() {
  return await AuthStateManager.getToken();
}

export async function isLoggedIn() {
  return await AuthStateManager.isLoggedIn();
}

export async function validateSession() {
  return await AuthStateManager.validateSession();
}

export async function login(method, credentials) {
  return await AuthStateManager.login(method, credentials);
}

export async function logout() {
  return await AuthStateManager.logout();
}

export async function getLoggedInUser() {
  return await AuthStateManager.getLoggedInUser();
}

export async function refreshSession() {
  return await AuthStateManager.refreshSession();
}

export function getSessionInfo() {
  return AuthStateManager.getSessionInfo();
}

export async function getValidBackendToken() {
  return await AuthStateManager.getValidBackendToken();
}
