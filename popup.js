/**
 * Popup.js — Main Controller
 * Orchestrates all tabs, components, and user interactions.
 * Entry point for the GitHub Developer Assistant extension.
 */

import { getUser, getRepos, getRateLimit, validateToken } from './services/github.js';
import { renderProfile, renderProfileSkeleton } from './components/profile.js';
import { renderRepos, renderReposSkeleton } from './components/repos.js';
import { renderDashboard } from './components/dashboard.js';
import { renderFavorites } from './components/favorites.js';
import {
  getTheme, saveTheme,
  saveGithubToken, getGithubToken,
  saveGithubPatToken, getGithubPatToken,
  saveGithubOauthToken, getGithubOauthToken,
  saveGeminiKey, getGeminiKey,
  saveToHistory, getHistory,
  getGithubClientId, saveGithubClientId,
  getGithubClientSecret, saveGithubClientSecret,
  getAuthMethod, saveAuthMethod,
  getFavorites,
  migrateLegacyToken,
  saveBackendUrl, getBackendUrl,
  getNotificationsEnabled, saveNotificationsEnabled,
  getDashboardPreferences, saveDashboardPreferences,
  getAIPreferences, saveAIPreferences,
  getSessionAccessToken, getLoggedInUser,
  saveRepoContextCache, getRepoContextCache,
  saveRepoHistory, getRepoHistory
} from './services/storage.js';
import { renderHistory } from './components/history.js';
import { AuthStateManager } from './services/auth.js';
import { AUTH_EVENTS, SESSION_STATES, AUTH_METHODS } from './services/authConstants.js';
import { UserMenu } from './components/userMenu.js';
import {
  fetchDeveloperGitHubData,
  buildDeveloperContext,
  generateAIInsight,
  validateApiKey,
} from './services/ai.js';
import { parseMarkdownToDOM, escapeHTML } from './services/utils.js';

// ─── Phase 4.2.3: Repository Mode wiring ───
import { fetchRepoIntelligence, serializeContext } from './services/repoIntelligence.js';
import { tryResumeLastFolder, scanLocalFolder, getStoredHandle } from './services/localProjectScanner.js';
import {
  generateReadme,
  generateArchitectureDocs,
  generateRoadmap,
  generateCodeReview,
  generateSecurityReview,
  generateCommitMessage,
  generatePRDescription
} from './services/aiStudio.js';
import { publishToGitHub } from './services/githubPublisher.js';
let currentRepoContext = null;
// ───────────────────────────────────────────

/** Default OAuth Client ID for the DevAssist GitHub OAuth App. */
const DEFAULT_OAUTH_CLIENT_ID = 'Ov23liOvHUl1MK65i9LM';

/* ─────────────────────────────────────────────
   Real-Time Notification System
   ───────────────────────────────────────────── */
const NotificationManager = {
  async getNotifications() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['notifications'], (res) => {
          resolve(res.notifications || []);
        });
      } else {
        try {
          const list = JSON.parse(localStorage.getItem('notifications') || '[]');
          resolve(list);
        } catch {
          resolve([]);
        }
      }
    });
  },

  async saveNotifications(list) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ notifications: list }, resolve);
      } else {
        localStorage.setItem('notifications', JSON.stringify(list));
        resolve();
      }
    });
  },

  async pushNotification(title, message, type = 'info') {
    const list = await this.getNotifications();
    const newNotif = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title,
      message,
      type,
      timestamp: new Date().toISOString(),
      read: false
    };
    list.unshift(newNotif);
    if (list.length > 50) list.pop();
    await this.saveNotifications(list);
    
    this.showToast(message, type);
    this.updateBadge();
    this.renderPanel();
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--accent-green);flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--accent-orange);flex-shrink:0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--accent-red);flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--accent-color);flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    
    toast.innerHTML = `
      ${iconSvg}
      <span class="toast-text">${message}</span>
      <span class="toast-close" style="margin-left:8px; cursor:pointer; display:flex; align-items:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;color:var(--text-muted);"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </span>
    `;
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 200);
    });
    
    container.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 200);
      }
    }, 4000);
  },

  async updateBadge() {
    const list = await this.getNotifications();
    const unreadCount = list.filter(n => !n.read).length;
    const badge = document.getElementById('notification-badge');
    if (badge) {
      if (unreadCount > 0) {
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  },

  async markAllRead() {
    const list = await this.getNotifications();
    list.forEach(n => n.read = true);
    await this.saveNotifications(list);
    this.updateBadge();
    this.renderPanel();
  },

  async clearAll() {
    await this.saveNotifications([]);
    this.updateBadge();
    this.renderPanel();
  },

  async renderPanel() {
    const panelBody = document.querySelector('#notifications-panel .notifications-body');
    if (!panelBody) return;
    
    const list = await this.getNotifications();
    if (list.length === 0) {
      panelBody.innerHTML = `
        <div class="empty-state notification-empty">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
          <p>All caught up!</p>
          <span>No new notifications at this time.</span>
        </div>
      `;
      const header = document.querySelector('.notifications-header');
      const clearBtn = header?.querySelector('.clear-all-btn');
      if (clearBtn) clearBtn.remove();
      return;
    }

    const header = document.querySelector('.notifications-header');
    if (header && !header.querySelector('.clear-all-btn')) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'clear-all-btn';
      clearBtn.textContent = 'Clear All';
      clearBtn.addEventListener('click', () => this.clearAll());
      header.appendChild(clearBtn);
    }

    let html = '<div class="notifications-list" style="display:flex; flex-direction:column; gap:8px; width: 100%;">';
    
    list.forEach((n) => {
      let iconSvg = '';
      if (n.type === 'success') {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--accent-green);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      } else if (n.type === 'warning') {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--accent-orange);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      } else if (n.type === 'error') {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--accent-red);"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      } else {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--accent-color);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      }

      const dateText = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      html += `
        <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
          <div class="notification-icon">${iconSvg}</div>
          <div class="notification-content">
            <div class="notification-title">${escapeHTML(n.title)}</div>
            <div class="notification-message">${escapeHTML(n.message)}</div>
            <div class="notification-time">${dateText}</div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    panelBody.innerHTML = html;
  }
};


/* ─────────────────────────────────────────────
   App State
   ───────────────────────────────────────────── */
const state = {
  currentUser: null,
  currentRepos: [],
  currentTab: 'profile',
  isLoading: false,
  reposFilters: {
    search: '',
    sort: 'updated',
    language: '',
  },
  reposDisplayedCount: 20,
};

/* ─────────────────────────────────────────────
   DOM Element References
───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const searchInput = $('search-input');
const searchBtn = $('search-btn');
const errorEl = $('error-message');
const tabBtns = document.querySelectorAll('.tab-btn');

// Tab content containers
const profileTab = $('tab-profile');
const reposTab = $('tab-repos');
const dashboardTab = $('tab-dashboard');
const favoritesTab = $('tab-favorites');
const aiTab = $('tab-ai');
const historyTab = $('tab-history');

// Profile sub-sections
const profileContainer = $('profile-container');
const aiInsightsContainer = $('ai-insights-container');

// Settings panel
const settingsBtn = $('settings-btn');
const settingsPanel = $('settings-panel');
const saveSettingsBtn = $('save-settings-btn');
const githubTokenInput = $('github-token-input');

// Theme toggle
const themeToggleBtn = $('theme-toggle-btn');

// Page Title
const pageTitleEl = $('page-title');

// Footer
const rateLimitEl = $('rate-limit-display');

/* ─────────────────────────────────────────────
   Welcome Dashboard (Utility-First)
───────────────────────────────────────────── */
async function renderWelcomeDashboard() {
  if (state.currentUser) return;

  const profileContainer = $('profile-container');
  if (!profileContainer) return;

  profileContainer.innerHTML = `
    <div class="welcome-state" id="welcome-state">
      <div class="welcome-dashboard">
        <div class="welcome-dashboard-header">
          <div class="welcome-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
              <path d="M9 18c-4.51 2-5-2-7-2"/>
            </svg>
          </div>
          <h2 class="welcome-greeting">Welcome Back</h2>
          <p class="welcome-subtitle">Use the search bar above to look up any GitHub developer.</p>
        </div>

        <!-- Compact Tips Section -->
        <div class="db-tips-panel">
          <svg viewBox="0 0 24 24" class="tip-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span class="tip-text">Pro Tip — Add a GitHub token in Settings for 5,000 req/hr.</span>
        </div>
      </div>
    </div>
  `;
}



/* ─────────────────────────────────────────────
   Initialization
───────────────────────────────────────────── */
async function init() {
  // Show loading overlay with custom text on startup
  const loadingOverlay = $('login-loading-overlay');
  const loadingText = $('login-loading-text');
  if (loadingOverlay) loadingOverlay.style.display = 'flex';
  if (loadingText) loadingText.textContent = 'Initializing DevAssist...';

  // Hide layouts to prevent flashes/layout shifts
  const sidebar = $('popup-sidebar');
  const mainLayout = $('main-layout');
  const unauthContainer = $('unauth-container');
  if (sidebar) sidebar.style.display = 'none';
  if (mainLayout) mainLayout.style.display = 'none';
  if (unauthContainer) unauthContainer.style.display = 'none';

  // Initialize UserMenu
  let userMenu;
  try {
    userMenu = new UserMenu(
      'user-menu-dropdown',
      'header-avatar-container',
      'confirm-modal',
      loadProfile
    );
  } catch (err) {
    console.error('Failed to initialize UserMenu:', err);
  }

  // Attach all event listeners early to guarantee UI responsiveness
  try {
    attachEventListeners(userMenu);
  } catch (err) {
    console.error('Failed to attach event listeners:', err);
  }

  // Focus search input early
  if (searchInput) searchInput.focus();

  // Run the remaining asynchronous settings/auth setup inside a try-catch to prevent startup blockages
  try {
    // 1. Run legacy token migration
    await migrateLegacyToken();

    // Apply saved theme
    const savedTheme = await getTheme();
    applyTheme(savedTheme);

    // 2. Restore settings inputs
    const patToken = await getGithubPatToken();
    const backendUrl = await getBackendUrl();
    // geminiKey managed via AI Workspace setup card — no input to populate

    const backendUrlInput = $('backend-url-input');
    if (backendUrlInput) backendUrlInput.value = backendUrl;

    const unauthBackendUrlInput = $('unauth-backend-url-input');
    if (unauthBackendUrlInput) unauthBackendUrlInput.value = backendUrl;


    // 2b. Restore preferences inputs
    const notifsEnabled = await getNotificationsEnabled();
    const dbPrefs = await getDashboardPreferences();
    const aiPrefs = await getAIPreferences();
    
    const notifsCheckbox = $('notifications-enabled-checkbox');
    const dbSelect = $('dashboard-layout-select');
    const aiSelect = $('ai-mode-select');
    
    if (notifsCheckbox) notifsCheckbox.checked = notifsEnabled;
    if (dbSelect && dbPrefs.layout) dbSelect.value = dbPrefs.layout;
    if (aiSelect && aiPrefs.mode) aiSelect.value = aiPrefs.mode;

    // Restore OAuth inputs and active tab preference
    const authMethod = await getAuthMethod();
    let clientId = await getGithubClientId();
    const clientSecret = await getGithubClientSecret();

    // Sanitize client ID typos (e.g. capital I or missing lower-case l)
    if (clientId === 'Ov23liOvHUI1MK65i9LM' || clientId === 'Ov23liOvHU1MK65i9LM') {
      clientId = 'Ov23liOvHUl1MK65i9LM';
      await saveGithubClientId(clientId);
    }

    const clientIdInput = $('github-client-id-input');
    const clientSecretInput = $('github-client-secret-input');
    if (clientIdInput && clientId) clientIdInput.value = clientId;
    if (clientSecretInput && clientSecret) clientSecretInput.value = clientSecret;

    // Set the Redirect URI dynamically in Settings
    const redirectUriInput = $('oauth-redirect-uri');
    if (redirectUriInput && typeof chrome !== 'undefined' && chrome.identity) {
      redirectUriInput.value = chrome.identity.getRedirectURL();
    } else if (redirectUriInput) {
      redirectUriInput.value = 'https://' + (typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.id : 'molpopfmailbhafmchpiheblifhkloll') + '.chromiumapp.org/';
    }

    // Subscribe to authentication changes
    AuthStateManager.subscribe((event, data) => {
      syncAuthUI();
      handleBannerAlert(event, data);

      if (event === AUTH_EVENTS.LOGIN) {
        NotificationManager.pushNotification('GitHub Connected', `Logged in successfully as ${data?.user?.login || 'user'}.`, 'success');
        triggerCloudSync();
      } else if (event === AUTH_EVENTS.LOGOUT) {
        NotificationManager.pushNotification('GitHub Disconnected', 'Logged out of your GitHub session.', 'info');
      } else if (event === AUTH_EVENTS.SESSION_EXPIRED) {
        NotificationManager.pushNotification('Authentication Expired', 'Session expired. Please sign in again.', 'warning');
      } else if (event === AUTH_EVENTS.SESSION_VALID) {
        triggerCloudSync();
      }
    });

    async function triggerCloudSync() {
      const method = await getAuthMethod();
      const sessionToken = await getSessionAccessToken();
      if (method !== 'oauth' || !sessionToken) return;

      try {
        const { syncAfterLogin } = await import('./services/cloudSync.js');
        await syncAfterLogin(
          async (favorites) => {
            if (state.currentTab === 'favorites') {
              renderFavorites(favoritesTab, loadProfile, null);
            }
          },
          async (history) => {
            if (state.currentTab === 'history') {
              renderHistory(historyTab, loadProfile);
            }
          },
          async (settings) => {
            if (settings.theme) {
              applyTheme(settings.theme);
              // Update theme switcher UI
              const darkRadio = $('theme-dark-radio');
              const lightRadio = $('theme-light-radio');
              if (darkRadio && lightRadio) {
                darkRadio.checked = settings.theme === 'dark';
                lightRadio.checked = settings.theme === 'light';
              }
            }
            if (settings.notificationsEnabled !== undefined) {
              await saveNotificationsEnabled(settings.notificationsEnabled);
              const chk = $('notifications-enabled-checkbox');
              if (chk) chk.checked = settings.notificationsEnabled;
            }
            if (settings.dashboardPreferences !== undefined) {
              await saveDashboardPreferences(settings.dashboardPreferences);
              const sel = $('dashboard-layout-select');
              if (sel && settings.dashboardPreferences.layout) {
                sel.value = settings.dashboardPreferences.layout;
              }
            }
            if (settings.aiPreferences !== undefined) {
              await saveAIPreferences(settings.aiPreferences);
              const sel = $('ai-mode-select');
              if (sel && settings.aiPreferences.mode) {
                sel.value = settings.aiPreferences.mode;
              }
            }
          }
        );
      } catch (err) {
        console.warn('[Sync] Post-login sync failed:', err);
      }
    }

    // Determine initial state from cached info
    const cachedUser = await getLoggedInUser();
    const token = authMethod === 'oauth' ? await getGithubOauthToken() : await getGithubPatToken();
    const hasToken = !!(token && token.trim());

    if (cachedUser && hasToken) {
      // Synchronously set the current user in memory to prevent layout shifts on render
      AuthStateManager.currentUser = cachedUser;
      state.currentUser = cachedUser;
      
      // Update the UI layouts to show the authenticated shell
      await syncAuthUI();
      
      if (searchInput) searchInput.value = '';
      switchTab('profile');
      
      // Render the cached profile immediately
      await renderProfile(cachedUser, profileContainer, () => {}, loadProfile);
      
      // Hide the initial loading overlay
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      
      // Run validation & fetch fresh repo data in the background
      (async () => {
        try {
          const sessionStatus = await AuthStateManager.validateSession();
          if (sessionStatus === SESSION_STATES.VALID) {
            const freshUser = AuthStateManager.currentUser;
            if (freshUser && freshUser.login) {
              state.currentUser = freshUser;
              
              // Fetch repos & re-render profile & repos with fresh data
              const repos = await getRepos(freshUser.login);
              state.currentRepos = repos;
              
              await renderProfile(freshUser, profileContainer, () => {}, loadProfile);
              reposTab.innerHTML = '';
              updateReposList();
              
              if (state.currentTab === 'dashboard') {
                renderDashboard(freshUser, repos, dashboardTab);
              } else {
                dashboardTab.dataset.needsRender = 'true';
              }
              renderAIPanel();
            }
          }
        } catch (err) {
          console.error('[DevAssist] Background session validation/update failed:', err);
        }
      })();
    } else if (hasToken) {
      // We have a token but no cached user details. Validate before showing the dashboard.
      if (loadingText) loadingText.textContent = 'Verifying GitHub session...';
      
      try {
        const sessionStatus = await AuthStateManager.validateSession();
        if (sessionStatus === SESSION_STATES.VALID) {
          const freshUser = AuthStateManager.currentUser;
          if (freshUser && freshUser.login) {
            state.currentUser = freshUser;
            await syncAuthUI();
            
            if (searchInput) searchInput.value = '';
            switchTab('profile');
            
            const repos = await getRepos(freshUser.login);
            state.currentRepos = repos;
            
            await renderProfile(freshUser, profileContainer, () => {}, loadProfile);
            reposTab.innerHTML = '';
            updateReposList();
            
            if (state.currentTab === 'dashboard') {
              renderDashboard(freshUser, repos, dashboardTab);
            } else {
              dashboardTab.dataset.needsRender = 'true';
            }
            renderAIPanel();
          }
        } else {
          // Token is invalid/expired
          if (unauthContainer) unauthContainer.style.display = 'flex';
          await renderWelcomeDashboard();
        }
      } catch (err) {
        console.error('[DevAssist] Initial validation failed:', err);
        if (unauthContainer) unauthContainer.style.display = 'flex';
        await renderWelcomeDashboard();
      } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      }
    } else {
      // No token at all. Start in unauthenticated state.
      if (unauthContainer) unauthContainer.style.display = 'flex';
      await renderWelcomeDashboard();
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  } catch (err) {
    console.error('Initialization error during startup settings/auth recovery:', err);
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }

  // Update initial auth UI
  try {
    await syncAuthUI();
  } catch (err) {
    console.error('Failed to sync auth UI:', err);
  }

  // Update rate limit display
  try {
    updateRateLimit();
  } catch (err) {
    console.error('Failed to update rate limit:', err);
  }

  // Initialize notifications
  try {
    await NotificationManager.updateBadge();
    await NotificationManager.renderPanel();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.notifications) {
          NotificationManager.updateBadge();
          NotificationManager.renderPanel();
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'PUSH_NOTIFICATION') {
          NotificationManager.showToast(message.message, message.notificationType || 'info');
        }
      });
    }
  } catch (err) {
    console.error('Failed to initialize notifications:', err);
  }

  // Verify background service worker connectivity (silent check)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'PING' }, () => {
      // Intentional no-op: simply confirms the service worker is alive.
      void chrome.runtime.lastError;
    });
  }
}

/* ─────────────────────────────────────────────
   Event Listeners
───────────────────────────────────────────── */
function attachEventListeners(userMenu) {
  // Search
  searchBtn?.addEventListener('click', handleSearch);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  // Tabs
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings panel toggle
  settingsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    userMenu?.close();
    settingsPanel?.classList.toggle('visible');
    $('notifications-panel')?.classList.remove('visible');
  });

  // Settings close button click
  $('close-settings-panel-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel?.classList.remove('visible');
  });

  // Notifications panel toggle
  const notificationsBtn = $('notifications-btn');
  const notificationsPanel = $('notifications-panel');
  notificationsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isNowVisible = !notificationsPanel?.classList.contains('visible');
    notificationsPanel?.classList.toggle('visible');
    settingsPanel?.classList.remove('visible');
    if (isNowVisible) {
      NotificationManager.markAllRead();
    }
  });

  // Close settings and notifications on outside click
  document.addEventListener('click', (e) => {
    if (settingsPanel?.classList.contains('visible') && !settingsPanel.contains(e.target) && e.target !== settingsBtn) {
      settingsPanel.classList.remove('visible');
    }
    if (notificationsPanel?.classList.contains('visible') && !notificationsPanel.contains(e.target) && e.target !== notificationsBtn) {
      notificationsPanel.classList.remove('visible');
    }
  });

  // Save settings button
  saveSettingsBtn?.addEventListener('click', async () => {
    // Gemini key is managed exclusively via the AI Workspace setup card and AI Settings panel.
    const backendUrl = $('backend-url-input')?.value.trim() || 'https://devassist-yfli.onrender.com';
    const notifsCheckbox = $('notifications-enabled-checkbox');
    const dbSelect = $('dashboard-layout-select');
    const aiSelect = $('ai-mode-select');

    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = 'Saving...';
    saveSettingsBtn.style.background = 'var(--accent-blue)';

    try {
      await saveBackendUrl(backendUrl);
      const unauthBackendInput = $('unauth-backend-url-input');
      if (unauthBackendInput) unauthBackendInput.value = backendUrl;


      if (notifsCheckbox) await saveNotificationsEnabled(notifsCheckbox.checked);
      if (dbSelect) await saveDashboardPreferences({ layout: dbSelect.value });
      if (aiSelect) await saveAIPreferences({ mode: aiSelect.value });

      saveSettingsBtn.textContent = '✓ Saved!';
      saveSettingsBtn.style.background = 'var(--accent-green)';
      NotificationManager.pushNotification('Settings Saved', 'Configurations updated successfully.', 'success');
      setTimeout(() => {
        saveSettingsBtn.textContent = 'Save Settings';
        saveSettingsBtn.style.background = '';
        saveSettingsBtn.disabled = false;
      }, 1500);

      settingsPanel?.classList.remove('visible');
      hideError();
    } catch (err) {
      showError('Save failed: ' + err.message);
      NotificationManager.pushNotification('Settings Error', err.message || 'Failed to save settings.', 'error');
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = 'Save Settings';
      saveSettingsBtn.style.background = '';
    }
  });


  // Switcher radio listeners to dynamically change the active authentication method
  const patRadio = $('auth-method-pat-radio');
  const oauthRadio = $('auth-method-oauth-radio');

  const handleAuthMethodSwitch = async (method) => {
    try {
      await saveAuthMethod(method);
      await AuthStateManager.validateSession();
      await syncAuthUI();
      updateRateLimit();
    } catch (err) {
      console.error('Failed to switch auth method:', err);
    }
  };

  patRadio?.addEventListener('change', () => {
    if (patRadio.checked) handleAuthMethodSwitch('pat');
  });

  oauthRadio?.addEventListener('change', () => {
    if (oauthRadio.checked) handleAuthMethodSwitch('oauth');
  });

  // Disconnect PAT button listener
  $('pat-disconnect-btn')?.addEventListener('click', async () => {
    try {
      const activeMethod = await getAuthMethod();
      await saveGithubPatToken('');
      if (activeMethod === 'pat') {
        await AuthStateManager.logout();
      }
      
      const patTokenInput = $('github-token-input');
      if (patTokenInput) patTokenInput.value = '';
      
      showSuccessToast('PAT Disconnected.');
      await syncAuthUI();
      updateRateLimit();
    } catch (err) {
      showError('Failed to disconnect PAT: ' + err.message);
    }
  });

  // Validate & Save PAT button listener
  $('pat-validate-btn')?.addEventListener('click', async () => {
    const token = $('github-token-input')?.value.trim() || '';
    if (!token) {
      showError('Please enter a GitHub PAT.');
      return;
    }

    const validateBtn = $('pat-validate-btn');
    if (validateBtn) {
      validateBtn.disabled = true;
      validateBtn.textContent = 'Validating...';
    }

    try {
      // Try logging in using AuthStateManager which fetches profile and validates
      const loggedInUser = await AuthStateManager.login('pat', { token });
      
      // Auto-set the active method to 'pat' on successful login
      await saveAuthMethod('pat');
      if (patRadio) patRadio.checked = true;

      showSuccessToast('PAT Connected successfully.');
      await syncAuthUI();
      updateRateLimit();
      hideError();

      if (loggedInUser && loggedInUser.login) {
        await loadProfile(loggedInUser.login);
      }
    } catch (err) {
      showError('PAT Validation failed: ' + err.message);
      
      // Set status card indicator to Invalid Token explicitly
      const badge = $('pat-status-badge');
      const text = $('pat-status-text');
      if (badge && text) {
        badge.className = 'auth-status-badge invalid';
        text.textContent = 'Invalid Token';
      }
    } finally {
      if (validateBtn) {
        validateBtn.disabled = false;
        validateBtn.textContent = 'Validate & Save';
      }
    }
  });

  // Disconnect OAuth button listener
  $('oauth-disconnect-btn')?.addEventListener('click', async () => {
    try {
      const activeMethod = await getAuthMethod();
      await saveGithubOauthToken('');
      await saveGithubClientId('');
      await saveGithubClientSecret('');
      
      if (activeMethod === 'oauth') {
        await AuthStateManager.logout();
      }

      const clientIdInput = $('github-client-id-input');
      const clientSecretInput = $('github-client-secret-input');
      if (clientIdInput) clientIdInput.value = '';
      if (clientSecretInput) clientSecretInput.value = '';

      showSuccessToast('OAuth credentials disconnected.');
      await syncAuthUI();
      updateRateLimit();
    } catch (err) {
      showError('Failed to disconnect OAuth: ' + err.message);
    }
  });

  // Copy redirect URI listener
  $('copy-redirect-uri-btn')?.addEventListener('click', () => {
    const copyVal = $('oauth-redirect-uri')?.value || '';
    if (copyVal) {
      navigator.clipboard.writeText(copyVal).then(() => {
        const copyBtn = $('copy-redirect-uri-btn');
        if (copyBtn) {
          copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`;
          }, 1500);
        }
      }).catch(err => {
        console.error('Copy failed:', err);
      });
    }
  });

  // Connect OAuth button listener (Settings panel)
  const connectOauthBtn = $('connect-oauth-btn');
  connectOauthBtn?.addEventListener('click', async () => {
    const customClientId     = $('github-client-id-input')?.value.trim() || '';
    const customClientSecret = $('github-client-secret-input')?.value.trim() || '';
    const clientId     = customClientId || DEFAULT_OAUTH_CLIENT_ID;

    connectOauthBtn.disabled = true;
    connectOauthBtn.textContent = 'Connecting...';

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { type: 'START_OAUTH', clientId, clientSecret },
        async (bgResponse) => {
          if (chrome.runtime.lastError) {
            showError('OAuth failed: ' + chrome.runtime.lastError.message);
            connectOauthBtn.disabled = false;
            connectOauthBtn.textContent = 'Connect via OAuth';
            return;
          }

          let response = bgResponse;
          if (bgResponse && bgResponse.status === 'CODE_READY') {
            try {
              response = await performTokenExchange({ ...bgResponse, clientSecret });
            } catch (exchErr) {
              showError('Token exchange failed: ' + exchErr.message);
              connectOauthBtn.disabled = false;
              connectOauthBtn.textContent = 'Connect via OAuth';
              return;
            }
          }

          if (response && response.status === 'SUCCESS') {
            try {
              const loggedInUser = await AuthStateManager.login('oauth', {
                token: response.token,
                clientId,
                clientSecret
              });

              await saveAuthMethod('oauth');
              if (oauthRadio) oauthRadio.checked = true;

              showSuccessToast('OAuth connected successfully.');
              await syncAuthUI();
              updateRateLimit();
              hideError();

              if (loggedInUser && loggedInUser.login) {
                await loadProfile(loggedInUser.login);
              }

              connectOauthBtn.textContent = '✓ Connected!';
              connectOauthBtn.style.backgroundColor = 'var(--accent-green)';
              setTimeout(() => {
                connectOauthBtn.disabled = false;
                connectOauthBtn.textContent = 'Connect via OAuth';
                connectOauthBtn.style.backgroundColor = '';
              }, 1500);
            } catch (loginErr) {
              showError('OAuth Login failed: ' + loginErr.message);
              connectOauthBtn.disabled = false;
              connectOauthBtn.textContent = 'Connect via OAuth';
              connectOauthBtn.style.backgroundColor = '';
            }
          } else {
            showError(response?.error || 'OAuth authentication failed.');
            connectOauthBtn.disabled = false;
            connectOauthBtn.textContent = 'Connect via OAuth';
            connectOauthBtn.style.backgroundColor = '';
          }
        }
      );
    } else {
      showError('Chrome extension runtime not available.');
      connectOauthBtn.disabled = false;
      connectOauthBtn.textContent = 'Connect via OAuth';
    }
  });

  // ── Unauthenticated Screen Event Listeners ──

  // Collapsible Advanced Authentication toggle
  const advancedTrigger = $('advanced-trigger-btn');
  const advancedContent = $('advanced-content');
  advancedTrigger?.addEventListener('click', () => {
    const isExpanded = advancedTrigger.getAttribute('aria-expanded') === 'true';
    advancedTrigger.setAttribute('aria-expanded', !isExpanded);
    if (advancedContent) {
      if (isExpanded) {
        advancedContent.classList.remove('expanded');
        advancedContent.style.maxHeight = '0px';
      } else {
        advancedContent.classList.add('expanded');
        advancedContent.style.maxHeight = '1000px'; // sufficiently large
      }
    }
  });

  // Copy redirect URI for unauth panel
  $('unauth-copy-redirect-uri-btn')?.addEventListener('click', () => {
    const copyVal = $('unauth-oauth-redirect-uri')?.value || '';
    if (copyVal) {
      navigator.clipboard.writeText(copyVal).then(() => {
        const copyBtn = $('unauth-copy-redirect-uri-btn');
        if (copyBtn) {
          copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`;
          }, 1500);
        }
      }).catch(err => {
        console.error('Copy failed:', err);
      });
    }
  });

  // Unauth OAuth validation button ("Continue with GitHub")
  const unauthOauthBtn = $('unauth-oauth-btn');
  const loadingOverlay = $('login-loading-overlay');
  
  const showLoginLoading = (message) => {
    const textEl = $('login-loading-text');
    if (textEl) textEl.textContent = message;
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
  };

  const hideLoginLoading = () => {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  };

  const showUnauthError = (msg) => {
    const el = $('unauth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    showError(msg);
  };

  // ── Setup Checklist: populate redirect URL & check backend ──
  (async () => {
    // 1. Get the chromiumapp redirect URL from the background
    const redirectEl = $('display-redirect-uri');
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_REDIRECT_URL' }, (res) => {
        if (!chrome.runtime.lastError && res?.redirectUrl && redirectEl) {
          redirectEl.textContent = res.redirectUrl;
        } else if (redirectEl) {
          // Fallback: construct it from the extension ID
          const extId = chrome.runtime?.id || 'molpopfmailbhafmchpiheblifhkloll';
          redirectEl.textContent = `https://${extId}.chromiumapp.org/`;
        }
      });
    } else if (redirectEl) {
      redirectEl.textContent = 'https://molpopfmailbhafmchpiheblifhkloll.chromiumapp.org/';
    }

    // 2. Copy redirect URL button
    $('copy-display-redirect-uri')?.addEventListener('click', () => {
      const uri = $('display-redirect-uri')?.textContent || '';
      if (!uri || uri === 'loading…') return;
      navigator.clipboard.writeText(uri).then(() => {
        const btn = $('copy-display-redirect-uri');
        if (btn) {
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
          setTimeout(() => {
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
          }, 1500);
        }
      }).catch(() => {});
    });

    // 3. Initial check backend health


  })();

/* ─────────────────────────────────────────────
   OAuth Exchange Helper (Shared)
───────────────────────────────────────────── */
/**
 * Performs the backend OAuth code exchange when the background returns CODE_READY.
 * @param {Object} bgResponse - The message from the background service worker
 * @returns {Promise<Object>} Normalized response with status 'SUCCESS' or throws
 */
async function performTokenExchange(bgResponse) {
  const clientId = bgResponse.clientId || 'Ov23liOvHUl1MK65i9LM';
  const clientSecret = bgResponse.clientSecret || '';

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: bgResponse.code,
      redirect_uri: bgResponse.redirectUrl,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error_description || errBody.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return {
    status:       'SUCCESS',
    token:        data.access_token,
    accessToken:  null,
    refreshToken: null,
  };
}

unauthOauthBtn?.addEventListener('click', async () => {
  const errEl = $('unauth-error');
  if (errEl) errEl.style.display = 'none';
  hideError();

  // Use custom credentials if provided; otherwise fall back to default client ID.
  const customClientId     = $('unauth-oauth-client-id-input')?.value.trim() || '';
  const customClientSecret = $('unauth-oauth-client-secret-input')?.value.trim() || '';
  const targetClientId     = customClientId     || DEFAULT_OAUTH_CLIENT_ID;
  const targetClientSecret = customClientSecret || '';

  showLoginLoading('Opening GitHub authorization…');
  unauthOauthBtn.disabled = true;

  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    showUnauthError('Chrome extension runtime not available. Reload the popup.');
    unauthOauthBtn.disabled = false;
    hideLoginLoading();
    return;
  }

  chrome.runtime.sendMessage(
    { type: 'START_OAUTH', clientId: targetClientId },
    async (bgResponse) => {
      if (chrome.runtime.lastError) {
        showUnauthError('Extension error: ' + chrome.runtime.lastError.message);
        unauthOauthBtn.disabled = false;
        hideLoginLoading();
        return;
      }

      let response = bgResponse;
      if (bgResponse && bgResponse.status === 'CODE_READY') {
        showLoginLoading('Exchanging token with backend…');
        try {
          response = await performTokenExchange({ ...bgResponse, clientSecret: targetClientSecret });
        } catch (exchErr) {
          showUnauthError('Token exchange failed: ' + exchErr.message);
          unauthOauthBtn.disabled = false;
          hideLoginLoading();
          return;
        }
      }

      if (response && response.status === 'SUCCESS') {
        try {
          showLoginLoading('Verifying your account…');
          const loggedInUser = await AuthStateManager.login('oauth', {
            token:        response.token,
            clientId:     targetClientId,
            clientSecret: targetClientSecret,
            accessToken:  response.accessToken,
            refreshToken: response.refreshToken,
          });

          await saveGithubClientId(targetClientId);
          await saveGithubClientSecret(targetClientSecret);
          await saveAuthMethod('oauth');

          showLoginLoading('Login successful! Loading your dashboard…');
          await syncAuthUI();
          updateRateLimit();
          hideError();
          if (loggedInUser && loggedInUser.login) {
            await loadProfile(loggedInUser.login);
          }
          hideLoginLoading();
          return;
        } catch (loginErr) {
          showUnauthError('Login failed: ' + loginErr.message);
        }
      } else {
        showUnauthError(response?.error || 'OAuth authentication failed.');
      }
      unauthOauthBtn.disabled = false;
      hideLoginLoading();
    }
  );
});


  // Unauth PAT validation button
  const unauthPatValidateBtn = $('unauth-pat-validate-btn');
  unauthPatValidateBtn?.addEventListener('click', async () => {
    const token = $('unauth-pat-token-input')?.value.trim() || '';
    if (!token) {
      showError('Please enter a GitHub PAT.');
      return;
    }

    showLoginLoading('Validating PAT...');
    unauthPatValidateBtn.disabled = true;

    try {
      const loggedInUser = await AuthStateManager.login('pat', { token });
      await saveAuthMethod('pat');

      showSuccessToast('Successfully logged in.');
      await syncAuthUI();
      updateRateLimit();
      hideError();

      if (loggedInUser && loggedInUser.login) {
        await loadProfile(loggedInUser.login);
      }
    } catch (err) {
      showError('PAT Validation failed: ' + err.message);
      
      // Update unauth pat status card explicitly
      const card = $('unauth-pat-status-card');
      const badge = $('unauth-pat-status-badge');
      const text = $('unauth-pat-status-text');
      if (card && badge && text) {
        card.style.display = 'flex';
        badge.className = 'auth-status-badge invalid';
        text.textContent = 'Invalid Token';
      }
    } finally {
      unauthPatValidateBtn.disabled = false;
      hideLoginLoading();
    }
  });

  // Theme toggle
  themeToggleBtn?.addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await saveTheme(next);
    // Re-render dashboard charts if on that tab (charts use theme colors)
    if (state.currentTab === 'dashboard' && state.currentUser && state.currentRepos.length > 0) {
      renderDashboard(state.currentUser, state.currentRepos, dashboardTab);
    }
  });

  // AI Insight buttons
  $('ai-summarize')?.addEventListener('click', () => runAI('summarize'));
  $('ai-repos')?.addEventListener('click', () => runAI('repos'));
  $('ai-learning')?.addEventListener('click', () => runAI('learning'));
  $('ai-ideas')?.addEventListener('click', () => runAI('ideas'));

  // ─── Phase 4.2.3: Repository Mode wiring ───
  const modeTabs = document.querySelectorAll('.ai-mode-tab');
  const devModeContainer = $('ai-developer-mode');
  const repoModeContainer = $('ai-repository-mode');
  
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      modeTabs.forEach(t => {
        const isActive = t.dataset.mode === mode;
        t.style.background = isActive ? 'var(--bg-secondary)' : 'transparent';
        t.style.color = isActive ? 'var(--text-primary)' : 'var(--text-muted)';
        t.style.borderColor = isActive ? 'var(--accent-color)' : 'var(--border-color)';
      });

      if (mode === 'developer') {
        if (devModeContainer) devModeContainer.style.display = 'block';
        if (repoModeContainer) repoModeContainer.style.display = 'none';
      } else {
        if (devModeContainer) devModeContainer.style.display = 'none';
        if (repoModeContainer) repoModeContainer.style.display = 'block';
        initializeLocalFolderResume(); // Check resume on Repository Mode activation
      }
      
      const responseEl = $('ai-response-area');
      if (responseEl) responseEl.innerHTML = '';
    });
  });

  // Input Path Toggle Logic (GitHub URL vs Local Folder vs Publish)
  const pathTabs = document.querySelectorAll('.ai-path-tab');
  const repoUrlRow = $('ai-repo-url-row');
  const repoLocalRow = $('ai-repo-local-row');
  const repoPublishRow = $('ai-repo-publish-row');
  const repoHintMsg = $('ai-repo-hint-msg');

  pathTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const path = tab.dataset.path;
      pathTabs.forEach(t => {
        const isActive = t.dataset.path === path;
        t.classList.toggle('active', isActive);
        t.style.background = isActive ? 'var(--bg-secondary)' : 'transparent';
        t.style.color = isActive ? 'var(--text-primary)' : 'var(--text-muted)';
      });

      if (repoUrlRow) repoUrlRow.style.display = 'none';
      if (repoLocalRow) repoLocalRow.style.display = 'none';
      if (repoPublishRow) repoPublishRow.style.display = 'none';

      if (path === 'github') {
        if (repoUrlRow) repoUrlRow.style.display = 'flex';
        if (repoHintMsg) repoHintMsg.textContent = 'Enter a repository to analyze its architecture, code, and security.';
      } else if (path === 'local') {
        if (repoLocalRow) repoLocalRow.style.display = 'flex';
        if (repoHintMsg) repoHintMsg.textContent = 'Select a folder on your local device to scan and analyze.';
        initializeLocalFolderResume();
      } else if (path === 'publish') {
        if (repoPublishRow) repoPublishRow.style.display = 'flex';
        if (repoHintMsg) repoHintMsg.textContent = 'Instantly publish a local folder as a new GitHub repository.';
      }
    });
  });

  async function initializeLocalFolderResume() {
    const resumePanel = $('ai-repo-resume-panel');
    const resumeText = $('ai-repo-resume-text');
    try {
      const storedHandle = await tryResumeLastFolder();
      if (storedHandle) {
        if (resumeText) resumeText.textContent = `Continue with folder: ${storedHandle.name}?`;
        if (resumePanel) resumePanel.style.display = 'flex';
      } else {
        if (resumePanel) resumePanel.style.display = 'none';
      }
    } catch (e) {
      if (resumePanel) resumePanel.style.display = 'none';
    }
  }

  // Local Folder Scan Handler
  async function handleLocalFolderScan(existingHandle = null) {
    const progressEl = $('ai-repo-progress');
    const progressMsg = $('ai-repo-progress-msg');
    const featuresEl = $('ai-repo-features');
    const contextCard = $('ai-repo-context-card');
    const responseEl = $('ai-response-area');
    const selectFolderBtn = $('ai-repo-select-folder-btn');

    if (progressEl) progressEl.style.display = 'flex';
    if (progressMsg) progressMsg.textContent = 'Initializing local folder scan...';
    if (featuresEl) featuresEl.style.display = 'none';
    if (contextCard) contextCard.style.display = 'none';
    if (responseEl) responseEl.innerHTML = '';
    hideError();

    if (selectFolderBtn) selectFolderBtn.disabled = true;

    try {
      const ctx = await scanLocalFolder((msg) => {
        if (progressMsg) progressMsg.textContent = msg;
      }, existingHandle);

      currentRepoContext = ctx;
      await renderRepoContextCard(ctx);
      await initializeLocalFolderResume();

    } catch (err) {
      showAIError(err.message || 'Failed to scan local folder.');
    } finally {
      if (progressEl) progressEl.style.display = 'none';
      if (selectFolderBtn) selectFolderBtn.disabled = false;
    }
  }

  $('ai-repo-select-folder-btn')?.addEventListener('click', () => handleLocalFolderScan());
  $('ai-repo-resume-btn')?.addEventListener('click', async () => {
    const storedHandle = await tryResumeLastFolder();
    if (storedHandle) {
      await handleLocalFolderScan(storedHandle);
    }
  });

  const repoAnalyzeBtn = $('ai-repo-analyze-btn');
  const repoInput = $('ai-repo-input');
  
  repoAnalyzeBtn?.addEventListener('click', async () => {
    const inputVal = repoInput?.value.trim() || '';
    if (!inputVal) {
      showError('Please enter a repository.');
      return;
    }
    
    let owner, repo;
    try {
      let cleanVal = inputVal.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
      cleanVal = cleanVal.replace(/\/$/, '').replace(/\.git$/i, '');
      const parts = cleanVal.split('/');
      if (parts.length >= 2) {
        owner = parts[0];
        repo = parts[1];
      } else {
        throw new Error('Invalid format');
      }
    } catch (e) {
      showError('Invalid format. Use owner/repo or a GitHub URL.');
      return;
    }
    
    repoAnalyzeBtn.disabled = true;
    repoInput.disabled = true;
    
    const progressEl = $('ai-repo-progress');
    const progressMsg = $('ai-repo-progress-msg');
    const featuresEl = $('ai-repo-features');
    const contextCard = $('ai-repo-context-card');
    const responseEl = $('ai-response-area');
    
    if (progressEl) progressEl.style.display = 'flex';
    if (progressMsg) progressMsg.textContent = 'Initializing analysis...';
    if (featuresEl) featuresEl.style.display = 'none';
    if (contextCard) contextCard.style.display = 'none';
    if (responseEl) responseEl.innerHTML = '';
    hideError();

    try {
      const authMethod = await getAuthMethod();
      const token = authMethod === 'oauth' ? await getGithubOauthToken() : await getGithubPatToken();
      
      let ctx = await getRepoContextCache(owner, repo);
      const isCached = !!ctx;
      
      if (!ctx) {
        ctx = await fetchRepoIntelligence(owner, repo, token, (msg) => {
          if (progressMsg) progressMsg.textContent = msg;
        });
        await saveRepoContextCache(owner, repo, ctx);
      }
      
      if (isCached) {
        ctx.isCached = true;
      }
      
      currentRepoContext = ctx;
      await renderRepoContextCard(ctx);
      
    } catch (err) {
      showAIError(err.message || 'Failed to analyze repository.');
    } finally {
      if (progressEl) progressEl.style.display = 'none';
      repoAnalyzeBtn.disabled = false;
      repoInput.disabled = false;
    }
  });

  async function renderRepoContextCard(ctx) {
    const featuresEl = $('ai-repo-features');
    const contextCard = $('ai-repo-context-card');
    const nameEl = $('ai-repo-context-name');
    const metaEl = $('ai-repo-context-meta');

    if (nameEl) {
      if (ctx.isLocal) {
        nameEl.textContent = `${ctx.metadata.name} (Local)`;
      } else {
        nameEl.textContent = `${ctx.owner}/${ctx.metadata.name}`;
      }
    }

    if (metaEl) {
      if (ctx.isLocal) {
        metaEl.textContent = `${ctx.metadata.fileCount} files • ${ctx.metadata.folderCount} folders`;
      } else {
        metaEl.textContent = `${ctx.metadata.stars} stars • ${ctx.metadata.forks} forks • ${ctx.metadata.defaultBranch} branch${ctx.isCached ? ' (cached)' : ''}`;
      }
    }

    const tagsContainer = $('ai-repo-context-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = '';
      const archTags = [];
      if (ctx.architecture) {
        if (ctx.architecture.isMonorepo) archTags.push('Monorepo');
        if (ctx.architecture.hasDocker) archTags.push('Docker');
        if (ctx.architecture.hasTestSuite) archTags.push('Tests');
        if (ctx.architecture.hasCI) archTags.push('CI/CD');
        if (ctx.architecture.isSSR) archTags.push('SSR');
      }
      const tags = [...(ctx.frameworks || []), ...archTags];
      tags.forEach(tag => {
        const pill = document.createElement('span');
        pill.style.cssText = 'font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--bg-hover); border: 1px solid var(--border-color); color: var(--text-muted);';
        pill.textContent = tag;
        tagsContainer.appendChild(pill);
      });
    }

    if (contextCard) contextCard.style.display = 'block';
    if (featuresEl) featuresEl.style.display = 'block';

    await updateGitAssistantState(ctx);
  }

  async function updateGitAssistantState(ctx) {
    const commitInput = $('ai-commit-input');
    const commitBtn = document.querySelector('[data-repo-action="commit"]');
    const prInput = $('ai-pr-summary-input');
    const prBtn = document.querySelector('[data-repo-action="pr"]');

    let explanationEl = $('ai-git-assistant-explanation');
    if (!explanationEl) {
      explanationEl = document.createElement('p');
      explanationEl.id = 'ai-git-assistant-explanation';
      explanationEl.style.cssText = 'font-size: 12px; color: var(--text-secondary); margin: 12px 0 0 0; padding: 10px 12px; background: rgba(139, 148, 158, 0.1); border: 1px solid var(--border-color); border-radius: 6px; line-height: 1.4; display: flex; align-items: flex-start; gap: 8px;';
      
      const gitAssistantHeader = Array.from(document.querySelectorAll('h4')).find(el => el.textContent === 'Git Assistant');
      if (gitAssistantHeader) {
        const gitContainer = gitAssistantHeader.nextElementSibling;
        if (gitContainer) {
          gitContainer.appendChild(explanationEl);
        }
      }
    }

    const user = AuthStateManager.currentUser;
    const loggedInUsername = user ? user.login : null;
    const owner = ctx.owner;

    const isOwner = owner && loggedInUsername && owner.toLowerCase() === loggedInUsername.toLowerCase();
    
    const publishBtn = $('publish-github-btn');
    if (publishBtn) {
      publishBtn.style.display = ctx.isLocal ? 'flex' : 'none';
    }

    if (ctx.isLocal || isOwner) {
      if (commitInput) { commitInput.disabled = false; commitInput.placeholder = "What did you change?"; }
      if (commitBtn) commitBtn.disabled = false;
      if (prInput) { prInput.disabled = false; prInput.placeholder = "Summary of branch/PR changes"; }
      if (prBtn) prBtn.disabled = false;
      explanationEl.style.display = 'none';
    } else {
      if (commitInput) { commitInput.disabled = true; commitInput.placeholder = "Git Assistant disabled"; }
      if (commitBtn) commitBtn.disabled = true;
      if (prInput) { prInput.disabled = true; prInput.placeholder = "Git Assistant disabled"; }
      if (prBtn) prBtn.disabled = true;
      explanationEl.textContent = 'Only available for local folders or your own repositories.';
      explanationEl.style.display = 'block';
    }
  }

  $('ai-repo-context-clear')?.addEventListener('click', () => {
    currentRepoContext = null;
    const contextCard = $('ai-repo-context-card');
    const featuresEl = $('ai-repo-features');
    if (contextCard) contextCard.style.display = 'none';
    if (featuresEl) featuresEl.style.display = 'none';
    if (repoInput) repoInput.value = '';
    const responseEl = $('ai-response-area');
    if (responseEl) responseEl.innerHTML = '';
    const explanationEl = $('ai-git-assistant-explanation');
    if (explanationEl) explanationEl.style.display = 'none';
  });

  const repoActionBtns = document.querySelectorAll('[data-repo-action]');
  repoActionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentRepoContext) {
        showError('Analyze a repository first.');
        return;
      }
      
      const geminiKey = await getGeminiKey();
      if (!geminiKey) {
        await updateAITabState();
        return;
      }
      
      const action = btn.dataset.repoAction;
      let extraInput = '';
      
      if (action === 'commit') {
        extraInput = $('ai-commit-input')?.value.trim();
        if (!extraInput) {
          showError('Please enter what you changed.');
          return;
        }
      } else if (action === 'pr') {
        extraInput = $('ai-pr-summary-input')?.value.trim();
        if (!extraInput) {
          showError('Please enter a summary of branch/PR changes.');
          return;
        }
      }
      
      disableAIButtonsForRepoMode(btn);
      showAILoading('Analyzing repository and generating insights...');
      
      try {
        let result = '';
        let options = { filename: 'output.md', allowEdit: false, allowDownload: false };
        
        if (action === 'readme') {
          result = await generateReadme(currentRepoContext, geminiKey);
          options = { filename: 'README.md', allowEdit: true, allowDownload: true };
        } else if (action === 'architecture') {
          result = await generateArchitectureDocs(currentRepoContext, geminiKey);
          options = { filename: 'ARCHITECTURE.md', allowEdit: true, allowDownload: true };
        } else if (action === 'roadmap') {
          result = await generateRoadmap(currentRepoContext, geminiKey);
          options = { filename: 'ROADMAP.md', allowEdit: true, allowDownload: true };
        } else if (action === 'codereview') {
          result = await generateCodeReview(currentRepoContext, geminiKey);
          options = { filename: 'CODE_REVIEW.md', allowEdit: false, allowDownload: true };
        } else if (action === 'security') {
          result = await generateSecurityReview(currentRepoContext, geminiKey);
          options = { filename: 'SECURITY_REVIEW.md', allowEdit: false, allowDownload: true };
        } else if (action === 'commit') {
          result = await generateCommitMessage(currentRepoContext, extraInput, geminiKey);
          options = { filename: 'commit.txt', allowEdit: false, allowDownload: false };
        } else if (action === 'pr') {
          result = await generatePRDescription(currentRepoContext, extraInput, geminiKey);
          options = { filename: 'pr_description.md', allowEdit: false, allowDownload: false };
        }
        
        const actionLabels = {
          readme: 'Generated README',
          architecture: 'Generated Architecture Docs',
          roadmap: 'Generated Roadmap',
          codereview: 'Generated Code Review',
          security: 'Generated Security Review',
          commit: 'Generated Commit Message',
          pr: 'Generated PR Description'
        };
        const ownerName = currentRepoContext.owner || 'local';
        await saveRepoHistory(ownerName, currentRepoContext.metadata.name, actionLabels[action] || action);
        
        renderEditableResult(result, options);
      } catch (err) {
        showAIError(err.message || 'An error occurred during generation.');
      } finally {
        enableAIButtonsForRepoMode();
      }
    });
  });
  // ───────────────────────────────────────────
  // --- Publish to GitHub Interactions ---
  const publishGithubBtn = $('publish-github-btn');
  const publishModal = $('publish-modal');
  const publishCancelBtn = $('publish-cancel-btn');
  const publishConfirmBtn = $('publish-confirm-btn');

  if (publishGithubBtn) {
    publishGithubBtn.addEventListener('click', () => {
      if (!currentRepoContext || !currentRepoContext.isLocal) {
        showError('Publishing is only available for local folders.');
        return;
      }
      $('publish-repo-name').value = currentRepoContext.metadata.name || '';
      $('publish-repo-desc').value = '';
      $('publish-repo-visibility').value = 'public';
      $('publish-repo-license').value = '';
      publishModal.style.display = 'flex';
    });
  }

  const publishDirectBtn = $('ai-repo-publish-folder-btn');
  if (publishDirectBtn) {
    publishDirectBtn.addEventListener('click', async () => {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        window.__publishDirHandle = dirHandle;
        
        $('publish-repo-name').value = dirHandle.name;
        $('publish-repo-desc').value = '';
        $('publish-repo-visibility').value = 'public';
        $('publish-repo-license').value = '';
        
        const readmeToggle = $('publish-repo-readme');
        if (readmeToggle) readmeToggle.checked = true;
        
        publishModal.style.display = 'flex';
      } catch (e) {
        // user cancelled
      }
    });
  }

  if (publishCancelBtn) {
    publishCancelBtn.addEventListener('click', () => {
      publishModal.style.display = 'none';
      window.__publishDirHandle = null;
    });
  }

  if (publishConfirmBtn) {
    publishConfirmBtn.addEventListener('click', async () => {
      const name = $('publish-repo-name').value.trim();
      const description = $('publish-repo-desc').value.trim();
      const isPrivate = $('publish-repo-visibility').value === 'private';
      const license = $('publish-repo-license').value;
      const generateReadmeFlag = $('publish-repo-readme')?.checked;

      if (!name) {
        showError('Repository name is required.');
        return;
      }

      publishModal.style.display = 'none';
      showAILoading('Preparing to publish...');

      try {
        const dirHandle = window.__publishDirHandle || await getStoredHandle();
        if (!dirHandle) {
          throw new Error('Local directory handle lost. Please re-select the folder.');
        }

        let readmeContent = '';
        if (generateReadmeFlag) {
          const ctx = await scanLocalFolder((msg) => {
            const progressMsg = $('ai-repo-progress-msg');
            if (progressMsg) progressMsg.textContent = msg;
          }, dirHandle);
          
          showAILoading('Generating AI README...');
          const geminiKey = await getGeminiKey();
          if (geminiKey) {
            readmeContent = await generateReadme(ctx, geminiKey);
          }
        }


        const url = await publishToGitHub(dirHandle, {
          name,
          description,
          private: isPrivate,
          license_template: license || undefined,
          readmeContent
        }, (msg) => {
          const progressMsg = $('ai-repo-progress-msg');
          if (progressMsg) progressMsg.textContent = msg;
        });

        // Show success in UI
        renderEditableResult(`**Successfully published to GitHub!**\n\nRepository URL: [${url}](${url})`, { filename: 'publish.md' });
      } catch (err) {
        showAIError(err.message || 'An error occurred during publishing.');
      } finally {
        enableAIButtonsForRepoMode();
      }
    });
  }
  // ───────────────────────────────────────────

  // Network online/offline detection
  window.addEventListener('online', () => hideError());
  window.addEventListener('offline', () =>
    showError('You are offline. Please check your internet connection.')
  );

  // Toggle settings inputs visibility (moved from inline HTML script)
  document.querySelectorAll('.toggle-visibility-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = $(targetId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  // Initialize Gemini Key Management
  initGeminiKeyManagement();
}


/* ─────────────────────────────────────────────
   Search Handler
───────────────────────────────────────────── */
async function handleSearch() {
  const username = searchInput?.value.trim();
  if (!username) {
    showError('Please enter a GitHub username.');
    searchInput?.focus();
    return;
  }

  // Validate username format
  if (!/^[a-zA-Z0-9_-]{1,39}$/.test(username)) {
    showError('Invalid GitHub username format.');
    return;
  }

  await searchUser(username);
}

/**
 * Core profile fetch + render logic, decoupled from the search bar.
 * @param {string} username
 */
async function searchUser(username) {
  if (state.isLoading) return;

  hideError();
  setLoading(true);

  // Show skeleton immediately
  renderProfileSkeleton(profileContainer);
  renderReposSkeleton(reposTab);

  // Switch to profile tab
  switchTab('profile');

  try {
    // Fetch user data
    const user = await getUser(username);
    state.currentUser = user;

    // Update rate limit from response headers
    if (user._rateLimit) {
      updateRateLimitDisplay(user._rateLimit.remaining, user._rateLimit.total);
    }

    await renderProfile(user, profileContainer, () => {
      if (state.currentTab === 'favorites') {
        renderFavorites(favoritesTab, loadProfile, null);
      }
    }, loadProfile);

    // Save search history
    await saveToHistory(user.login);

    // Reset filters for new search
    state.reposFilters = {
      search: '',
      sort: 'updated',
      language: '',
    };
    state.reposDisplayedCount = 20;

    // Fetch repos
    const repos = await getRepos(username);
    state.currentRepos = repos;

    // Render repos
    reposTab.innerHTML = '';
    updateReposList();

    // Render dashboard (lazy — only if tab is active)
    if (state.currentTab === 'dashboard') {
      renderDashboard(user, repos, dashboardTab);
    } else {
      dashboardTab.dataset.needsRender = 'true';
    }

    // Clear and show AI insights panel
    renderAIPanel();

  } catch (err) {
    showError(err.message);
    NotificationManager.pushNotification('Profile Load Failed', `Failed to load @${username}: ${err.message}`, 'error');
    // Clear skeleton and restore welcome dashboard on error
    profileContainer.innerHTML = '';
    await renderWelcomeDashboard();
    reposTab.innerHTML = '';
    const aiEmptyState = $('ai-empty-state');
    if (aiEmptyState) aiEmptyState.style.display = 'flex';
    if (aiInsightsContainer) aiInsightsContainer.style.display = 'none';
  } finally {
    setLoading(false);
  }
}

/* ─────────────────────────────────────────────
   Repositories Management (State-Driven)
───────────────────────────────────────────── */
function getFilteredRepos() {
  const searchVal = state.reposFilters.search.toLowerCase();
  const sortVal = state.reposFilters.sort;
  const langVal = state.reposFilters.language;

  let filtered = state.currentRepos.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(searchVal) ||
      (r.description || '').toLowerCase().includes(searchVal);
    const matchesLang = !langVal || r.language === langVal;
    return matchesSearch && matchesLang;
  });

  filtered.sort((a, b) => {
    if (sortVal === 'stars') return b.stargazers_count - a.stargazers_count;
    if (sortVal === 'name') return a.name.localeCompare(b.name);
    if (sortVal === 'forks') return b.forks_count - a.forks_count;
    // Default: updated
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  return filtered;
}

let searchDebounce;
function handleRepoFilterChange(key, value) {
  state.reposFilters[key] = value;
  
  if (key === 'search') {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.reposDisplayedCount = 20; // reset pagination
      updateReposList();
    }, 300); // 300ms debounce
  } else {
    state.reposDisplayedCount = 20; // reset pagination
    updateReposList();
  }
}

function handleRepoLoadMore() {
  state.reposDisplayedCount += 20;
  updateReposList();
}

function updateReposList() {
  if (!state.currentUser) return;
  
  const filtered = getFilteredRepos();
  const uniqueLanguages = [...new Set(state.currentRepos.map((r) => r.language).filter(Boolean))].sort();

  renderRepos(reposTab, {
    repos: filtered,
    totalCount: filtered.length,
    allCount: state.currentRepos.length,
    displayedCount: state.reposDisplayedCount,
    languages: uniqueLanguages,
    filters: state.reposFilters,
    onFilterChange: handleRepoFilterChange,
    onLoadMore: handleRepoLoadMore,
  });
}


/**
 * Loads a developer's profile (used from favorites/login).
 * Does NOT modify the search bar.
 * @param {string} username
 */
async function loadProfile(username) {
  switchTab('profile');
  await searchUser(username);
}

/* ─────────────────────────────────────────────
   Tab Management
───────────────────────────────────────────── */
function switchTab(tabName) {
  state.currentTab = tabName;

  // Update tab buttons
  tabBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
    btn.setAttribute('aria-selected', btn.dataset.tab === tabName);
  });

  // Dynamically update the header page title
  if (pageTitleEl) {
    const titles = {
      profile: 'Dashboard',
      repos: 'Repositories',
      ai: 'AI Workspace',
      dashboard: 'Analytics',
      favorites: 'Favorites',
      history: 'History'
    };
    pageTitleEl.textContent = titles[tabName] || 'Dashboard';
  }

  // Show/hide tab content
  const allTabs = [profileTab, reposTab, dashboardTab, favoritesTab, aiTab, historyTab];
  allTabs.forEach((tab) => {
    if (!tab) return;
    tab.classList.remove('tab-active');
  });

  let activeTab = null;
  if (tabName === 'profile') activeTab = profileTab;
  else if (tabName === 'repos') activeTab = reposTab;
  else if (tabName === 'dashboard') activeTab = dashboardTab;
  else if (tabName === 'favorites') activeTab = favoritesTab;
  else if (tabName === 'ai') activeTab = aiTab;
  else if (tabName === 'history') activeTab = historyTab;

  if (activeTab) {
    activeTab.classList.add('tab-active');
  }

  // Lazy-render dashboard when first accessed
  if (tabName === 'dashboard' && dashboardTab?.dataset.needsRender === 'true' && state.currentUser) {
    dashboardTab.dataset.needsRender = 'false';
    renderDashboard(state.currentUser, state.currentRepos, dashboardTab);
  }

  if (tabName === 'profile' && !state.currentUser) {
    renderWelcomeDashboard();
  }

  if (tabName === 'ai') {
    updateAITabState();
  }


  // Refresh repository view on tab switch to ensure DOM controls match state
  if (tabName === 'repos' && state.currentUser) {
    updateReposList();
  }

  // Re-render favorites when tab is opened
  if (tabName === 'favorites') {
    renderFavorites(favoritesTab, loadProfile, null);
  }

  // Re-render history when tab is opened
  if (tabName === 'history') {
    renderHistory(historyTab, loadProfile, (owner, repo) => {
      const aiTabBtn = document.querySelector('[data-tab="ai"]');
      if (aiTabBtn) {
        aiTabBtn.click();
      }
      
      const repoModeTab = document.querySelector('[data-mode="repository"]');
      if (repoModeTab) {
        repoModeTab.click();
      }
      
      if (owner === 'local') {
        const localPathTab = document.querySelector('[data-path="local"]');
        if (localPathTab) {
          localPathTab.click();
        }
        
        // Wait briefly for UI to update, then click resume/select
        setTimeout(() => {
          const resumeBtn = document.getElementById('ai-repo-resume-btn');
          const resumePanel = document.getElementById('ai-repo-resume-panel');
          if (resumeBtn && resumePanel && window.getComputedStyle(resumePanel).display !== 'none') {
            resumeBtn.click();
          } else {
            const selectBtn = document.getElementById('ai-repo-select-folder-btn');
            if (selectBtn) {
              selectBtn.click();
            }
          }
        }, 100);
      } else {
        const githubPathTab = document.querySelector('[data-path="github"]');
        if (githubPathTab) {
          githubPathTab.click();
        }
        
        setTimeout(() => {
          const repoInput = document.getElementById('ai-repo-input');
          if (repoInput) {
            repoInput.value = `${owner}/${repo}`;
          }
          const repoAnalyzeBtn = document.getElementById('ai-repo-analyze-btn');
          if (repoAnalyzeBtn) {
            repoAnalyzeBtn.click();
          }
        }, 100);
      }
    });
  }
}

/* ─────────────────────────────────────────────
   AI Insights Panel
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   Gemini API Key Management
─────────────────────────────────────────────── */

/**
 * Updates the AI tab visibility between: setup card, workspace, or empty state.
 * Called on tab switch and after key changes.
 */
async function updateAITabState() {
  const geminiKey = await getGeminiKey();
  const hasKey = !!(geminiKey && geminiKey.trim());
  const hasUser = !!state.currentUser;

  const setupCard = $('ai-setup-card');
  const workspace = $('ai-insights-container');
  const emptyState = $('ai-empty-state');

  if (!hasKey) {
    // No key — show setup card, hide everything else
    if (setupCard) setupCard.style.display = 'flex';
    if (workspace) workspace.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
  } else if (!hasUser) {
    // Key exists but no developer loaded — show empty state
    if (setupCard) setupCard.style.display = 'none';
    if (workspace) workspace.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
  } else {
    // Key + user loaded — show workspace
    if (setupCard) setupCard.style.display = 'none';
    if (workspace) workspace.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
  }

  // Update settings panel connection status
  updateAISettingsStatus(hasKey);
}

/**
 * Updates the AI Settings panel in the settings sidebar to reflect current key state.
 */
function updateAISettingsStatus(hasKey) {
  const dot = $('ai-settings-status-dot');
  const label = $('ai-settings-status-label');
  const hint = $('ai-settings-status-hint');
  const keyActions = $('ai-settings-key-actions');
  const setupRow = $('ai-settings-setup-row');

  if (hasKey) {
    if (dot) { dot.className = 'ai-settings-status-dot connected'; }
    if (label) label.textContent = 'Gemini Connected';
    if (hint) hint.textContent = 'AI features are active';
    if (keyActions) keyActions.style.display = 'flex';
    if (setupRow) setupRow.style.display = 'none';
  } else {
    if (dot) { dot.className = 'ai-settings-status-dot'; }
    if (label) label.textContent = 'Not Connected';
    if (hint) hint.textContent = 'No API key configured';
    if (keyActions) keyActions.style.display = 'none';
    if (setupRow) setupRow.style.display = 'flex';
  }
}

/**
 * Wires up all Gemini key management interactions:
 * – Setup card activation
 * – Settings: Replace Key
 * – Settings: Delete Key
 */
function initGeminiKeyManagement() {
  // ── 1. Setup card: Activate button ──
  const activateBtn = $('ai-setup-activate-btn');
  const setupInput = $('ai-setup-key-input');
  const setupErrorEl = $('ai-setup-error');

  activateBtn?.addEventListener('click', async () => {
    const key = setupInput?.value.trim() || '';
    if (!key) {
      if (setupErrorEl) { setupErrorEl.textContent = 'Please enter an API key.'; setupErrorEl.style.display = 'block'; }
      setupInput?.focus();
      return;
    }

    // Basic format sanity check (Gemini keys start with "AIza" and are ~39 chars)
    if (!key.startsWith('AIza') || key.length < 20) {
      if (setupErrorEl) { setupErrorEl.textContent = 'This does not look like a valid Gemini API key. Keys start with "AIza".'; setupErrorEl.style.display = 'block'; }
      setupInput?.focus();
      return;
    }

    activateBtn.disabled = true;
    activateBtn.innerHTML = `<span class="spinner-sm"></span> Saving…`;
    if (setupErrorEl) setupErrorEl.style.display = 'none';

    await saveGeminiKey(key);
    if (setupInput) setupInput.value = '';
    NotificationManager.pushNotification('AI Activated', 'Gemini API Key saved. AI features are now unlocked.', 'success');
    await updateAITabState();
  });

  // Allow Enter key on setup input
  setupInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') activateBtn?.click();
  });

  // ── 2. Settings: Replace Key button ──
  const replaceBtn = $('ai-settings-replace-btn');
  const replaceInput = $('ai-settings-new-key-input');

  replaceBtn?.addEventListener('click', async () => {
    const key = replaceInput?.value.trim() || '';
    if (!key) {
      showError('Please enter the new API key.');
      replaceInput?.focus();
      return;
    }

    if (!key.startsWith('AIza') || key.length < 20) {
      showError('This does not look like a valid Gemini API key. Keys start with "AIza".');
      replaceInput?.focus();
      return;
    }

    replaceBtn.disabled = true;
    replaceBtn.textContent = 'Saving…';

    await saveGeminiKey(key);
    if (replaceInput) replaceInput.value = '';
    NotificationManager.pushNotification('API Key Replaced', 'Your Gemini API key has been updated.', 'success');
    await updateAITabState();

    replaceBtn.disabled = false;
    replaceBtn.textContent = 'Replace Key';
  });

  // ── 3. Settings: Delete Key button ──
  const deleteBtn = $('ai-settings-delete-btn');

  deleteBtn?.addEventListener('click', async () => {
    deleteBtn.disabled = true;
    await saveGeminiKey('');
    NotificationManager.showToast('API Key removed successfully.', 'success');
    await updateAITabState();
    deleteBtn.disabled = false;
  });

  // Initialize state on load
  updateAITabState();

  // ── 4. Workspace: Manage Key Shortcut ──
  const manageKeyBtn = $('ai-manage-key-btn');
  manageKeyBtn?.addEventListener('click', () => {
    // Open settings panel
    const settingsPanel = $('settings-panel');
    if (settingsPanel) {
      settingsPanel.classList.add('visible');
      // Scroll to the AI settings row
      const aiRow = $('ai-settings-status-row');
      if (aiRow) {
        aiRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Focus the input
      setTimeout(() => {
        if (replaceInput) replaceInput.focus();
      }, 300);
    }
  });
}

/* ─────────────────────────────────────────────
   AI Insights Panel
─────────────────────────────────────────────── */
function renderAIPanel() {
  // Delegates to the state-driven updateAITabState
  updateAITabState();

  // Clear any previous response output
  const responseEl = $('ai-response-area');
  if (responseEl) responseEl.innerHTML = '';
}

/**
 * Runs an AI insight analysis.
 * @param {'summarize'|'repos'|'learning'|'ideas'} type
 */
async function runAI(type) {
  if (!state.currentUser) {
    showError('Please search for a developer first.');
    return;
  }

  const geminiKey = await getGeminiKey();
  if (!geminiKey) {
    // Key was deleted externally — refresh tab state
    await updateAITabState();
    return;
  }

  // Set all AI buttons to loading state
  const aiButtons = document.querySelectorAll('.ai-btn');
  aiButtons.forEach((btn) => {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
  });

  const btnId = type === 'summarize' ? 'ai-summarize' : type === 'repos' ? 'ai-repos' : type === 'learning' ? 'ai-learning' : 'ai-ideas';
  const clickedBtn = $(btnId);
  if (clickedBtn) {
    clickedBtn.innerHTML = `<span class="spinner-sm"></span> Thinking…`;
  }

  showAILoading('Fetching GitHub data and generating analysis…');

  try {
    const targetUsername = state.currentUser.login;
    const { profile, repos } = await fetchDeveloperGitHubData(targetUsername);
    const developerContext = buildDeveloperContext(profile, repos);
    const result = await generateAIInsight(type, developerContext);

    showAIResult(result);
  } catch (err) {
    showAIError(err.message || 'An error occurred while generating analysis.');
  } finally {
    aiButtons.forEach((btn) => {
      btn.disabled = false;
      if (btn.dataset.originalText) {
        btn.innerHTML = btn.dataset.originalText;
      }
    });
  }
}

// ─── Phase 4.2.3: Repository Mode wiring ───
function disableAIButtonsForRepoMode(clickedBtn) {
  const actionBtns = document.querySelectorAll('[data-repo-action]');
  actionBtns.forEach((btn) => {
    btn.disabled = true;
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
  });
  if (clickedBtn) {
    clickedBtn.innerHTML = `<span class="spinner-sm"></span> Thinking…`;
  }
}

function enableAIButtonsForRepoMode() {
  const actionBtns = document.querySelectorAll('[data-repo-action]');
  actionBtns.forEach((btn) => {
    btn.disabled = false;
    if (btn.dataset.originalText) {
      btn.innerHTML = btn.dataset.originalText;
    }
  });
}
// ───────────────────────────────────────────

function showAILoading(message = 'Fetching GitHub data and generating analysis…') {
  const area = $('ai-response-area');
  if (!area) return;
  area.innerHTML = `
    <div class="ai-loading">
      <div class="spinner"></div>
      <span>${escapeHTML(message)}</span>
    </div>
  `;
}

function showAIResult(text) {
  const area = $('ai-response-area');
  if (!area) return;
  area.innerHTML = '';
  
  const container = document.createElement('div');
  container.className = 'ai-result';
  container.appendChild(parseMarkdownToDOM(text));
  area.appendChild(container);
}

function renderEditableResult(rawMarkdown, options = {}) {
  const { filename = 'output.md', allowEdit = false, allowDownload = false } = options;
  const area = $('ai-response-area');
  if (!area) return;
  area.innerHTML = '';
  
  const container = document.createElement('div');
  container.className = 'ai-result';
  container.style.position = 'relative';

  const actionBar = document.createElement('div');
  actionBar.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px; justify-content: flex-end; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;';
  
  let isEditing = false;
  let currentMarkdown = rawMarkdown;
  
  const contentEl = document.createElement('div');
  
  const renderContent = (markdown) => {
    contentEl.innerHTML = '';
    contentEl.appendChild(parseMarkdownToDOM(markdown));
    if (typeof mermaid !== 'undefined') {
      setTimeout(() => {
        try {
          const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
          mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
          mermaid.init(undefined, contentEl.querySelectorAll('.mermaid'));
        } catch (e) {
          console.warn('Mermaid render error:', e);
        }
      }, 50);
    }
  };
  
  renderContent(currentMarkdown);
  
  let textareaEl = null;

  if (allowEdit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit';
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit';
    editBtn.style.cssText = 'display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; font-size: 11px;';
    editBtn.onclick = () => {
      isEditing = !isEditing;
      if (isEditing) {
        textareaEl = document.createElement('textarea');
        textareaEl.value = currentMarkdown;
        textareaEl.style.cssText = 'width: 100%; min-height: 200px; padding: 12px; font-family: monospace; font-size: 12px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; resize: vertical; margin-bottom: 8px; outline: none;';
        contentEl.innerHTML = '';
        contentEl.appendChild(textareaEl);
        editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Done';
      } else {
        if (textareaEl) currentMarkdown = textareaEl.value;
        renderContent(currentMarkdown);
        editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit';
      }
    };
    actionBar.appendChild(editBtn);
  }

  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-btn';
  copyBtn.title = 'Copy';
  copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
  copyBtn.style.cssText = 'display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; font-size: 11px;';
  copyBtn.onclick = async () => {
    const textToCopy = isEditing && textareaEl ? textareaEl.value : currentMarkdown;
    try {
      await navigator.clipboard.writeText(textToCopy);
      NotificationManager.showToast('Copied to clipboard', 'success');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = textToCopy;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      NotificationManager.showToast('Copied to clipboard', 'success');
    }
  };
  actionBar.appendChild(copyBtn);

  if (allowDownload) {
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'icon-btn';
    downloadBtn.title = 'Download';
    downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download';
    downloadBtn.style.cssText = 'display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; font-size: 11px;';
    downloadBtn.onclick = () => {
      const textToDownload = isEditing && textareaEl ? textareaEl.value : currentMarkdown;
      const blob = new Blob([textToDownload], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };
    actionBar.appendChild(downloadBtn);
  }

  container.appendChild(actionBar);
  container.appendChild(contentEl);
  area.appendChild(container);
}

function showAIError(message) {
  const area = $('ai-response-area');
  if (!area) return;

  const errorDiv = document.createElement('div');
  errorDiv.className = 'ai-error';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '14');
  icon.setAttribute('height', '14');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.style.cssText = 'display:inline-block;vertical-align:middle;margin-right:4px;';
  const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  iconPath.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01');
  icon.appendChild(iconPath);

  const text = document.createTextNode(message);
  errorDiv.appendChild(icon);
  errorDiv.appendChild(text);

  area.innerHTML = '';
  area.appendChild(errorDiv);
}

/* ─────────────────────────────────────────────
   Theme
───────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggleBtn) {
    themeToggleBtn.innerHTML = theme === 'dark'
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    themeToggleBtn.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

/* ─────────────────────────────────────────────
   Rate Limit Display
───────────────────────────────────────────── */
async function updateRateLimit() {
  const rate = await getRateLimit();
  if (rate && rateLimitEl) {
    updateRateLimitDisplay(rate.remaining, rate.limit);
  }
}

let lastRateLimitWarningTime = 0;

function updateRateLimitDisplay(remaining, total) {
  if (!rateLimitEl) return;
  const pct = total ? Math.round((remaining / total) * 100) : 0;
  const isLow = remaining < 10;
  const keyIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`;
  const warningIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>`;
  rateLimitEl.innerHTML = `
    <span class="${isLow ? 'rate-low' : ''}" title="GitHub API rate limit remaining" style="display:inline-flex; align-items:center;">
      ${isLow ? warningIcon : keyIcon} API: ${remaining}/${total}
    </span>
  `;

  if (isLow) {
    const now = Date.now();
    if (now - lastRateLimitWarningTime > 60000) {
      lastRateLimitWarningTime = now;
      NotificationManager.pushNotification(
        'Rate Limit Warning',
        `GitHub API remaining requests: ${remaining}/${total}. Please add a Personal Access Token or check settings.`,
        'warning'
      );
    }
  }
}

/* ─────────────────────────────────────────────
   Loading & Error States
───────────────────────────────────────────── */
function setLoading(loading) {
  state.isLoading = loading;
  if (searchBtn) {
    searchBtn.disabled = loading;
    searchBtn.innerHTML = loading
      ? `<span class="spinner-sm"></span>`
      : `<svg viewBox="0 0 16 16" class="search-icon"><path fill="currentColor" d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.656a5 5 0 110-10 5 5 0 010 10z"/></svg>`;
  }
  if (searchInput) searchInput.disabled = loading;
}

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  errorEl.setAttribute('role', 'alert');
  // Auto-hide after 8 seconds
  clearTimeout(errorEl._timer);
  errorEl._timer = setTimeout(hideError, 8000);
}

function hideError() {
  if (!errorEl) return;
  errorEl.style.display = 'none';
  errorEl.textContent = '';
}

/* ─────────────────────────────────────────────
   Session Experience Sync UI & Alert Banners
───────────────────────────────────────────── */
function getInitials(name, login) {
  const nameToUse = name || login || '';
  const parts = nameToUse.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0]) {
    return parts[0].substring(0, Math.min(2, parts[0].length)).toUpperCase();
  }
  return '??';
}

async function syncAuthUI() {
  const info = AuthStateManager.getSessionInfo();
  const user = AuthStateManager.currentUser;
  
  const sidebar = $('popup-sidebar');
  const mainLayout = $('main-layout');
  const unauthContainer = $('unauth-container');

  // Toggle layout display based on authenticated state
  if (info.isLoggedIn && user) {
    if (sidebar) sidebar.style.display = 'flex';
    if (mainLayout) mainLayout.style.display = 'flex';
    if (unauthContainer) unauthContainer.style.display = 'none';
  } else {
    if (sidebar) sidebar.style.display = 'none';
    if (mainLayout) mainLayout.style.display = 'none';
    if (unauthContainer) unauthContainer.style.display = 'flex';
    
    // Sync inputs in unauth screen
    const unauthPatInput = $('unauth-pat-token-input');
    const patTokenVal = await getGithubPatToken();
    if (unauthPatInput && patTokenVal && unauthPatInput.value === '') {
      unauthPatInput.value = patTokenVal;
    }

    const unauthClientIdInput = $('unauth-oauth-client-id-input');
    const unauthClientSecretInput = $('unauth-oauth-client-secret-input');
    const clientIdVal = await getGithubClientId();
    const clientSecretVal = await getGithubClientSecret();
    if (unauthClientIdInput && clientIdVal && unauthClientIdInput.value === '') {
      unauthClientIdInput.value = clientIdVal;
    }
    if (unauthClientSecretInput && clientSecretVal && unauthClientSecretInput.value === '') {
      unauthClientSecretInput.value = clientSecretVal;
    }

    // Set the Redirect URI dynamically in unauth screen
    const unauthRedirectUriInput = $('unauth-oauth-redirect-uri');
    if (unauthRedirectUriInput) {
      unauthRedirectUriInput.value = (typeof chrome !== 'undefined' && chrome.identity) 
        ? chrome.identity.getRedirectURL()
        : 'https://' + (typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.id : 'molpopfmailbhafmchpiheblifhkloll') + '.chromiumapp.org/';
    }

    // Update unauth PAT status card if token exists
    const card = $('unauth-pat-status-card');
    const badge = $('unauth-pat-status-badge');
    const text = $('unauth-pat-status-text');
    if (card && badge && text) {
      if (patTokenVal) {
        card.style.display = 'flex';
        const lastErr = AuthStateManager._lastError;
        const isPatOffline = lastErr && lastErr.type === 'NETWORK_ERROR';
        const isPatInvalid = lastErr && lastErr.type === 'AUTH_ERROR';
        if (isPatInvalid) {
          badge.className = 'auth-status-badge invalid';
          text.textContent = 'Invalid Token';
        } else {
          badge.className = 'auth-status-badge connected';
          text.textContent = isPatOffline ? 'Offline' : 'Connected';
        }
      } else {
        card.style.display = 'none';
      }
    }
  }

  const headerAvatar = $('header-avatar');
  const headerAvatarPlaceholder = $('header-avatar-placeholder');
  const headerAvatarInitials = $('header-avatar-initials');
  const headerAvatarContainer = $('header-avatar-container');
  
  // 1. Fetch saved tokens and settings
  const patToken = await getGithubPatToken();
  const oauthToken = await getGithubOauthToken();
  const oauthClientId = await getGithubClientId();
  const oauthClientSecret = await getGithubClientSecret();
  const activeMethod = await getAuthMethod();

  // 2. Update Active Authentication Method switcher
  const patRadio = $('auth-method-pat-radio');
  const oauthRadio = $('auth-method-oauth-radio');
  if (patRadio && oauthRadio) {
    if (activeMethod === 'oauth') {
      oauthRadio.checked = true;
    } else {
      patRadio.checked = true;
    }
  }

  // 3. Update header avatar (representing the authenticated user, if any)
  let headerStatus = 'expired';
  if (info.isLoggedIn && user) {
    const lastErr = AuthStateManager._lastError;
    headerStatus = (lastErr && lastErr.type === 'NETWORK_ERROR') ? 'offline' : 'active';
  }

  if (headerAvatarContainer) {
    headerAvatarContainer.classList.remove('status-active', 'status-offline', 'status-expired');
    
    if (info.isLoggedIn && user) {
      headerAvatarContainer.classList.add(`status-${headerStatus}`);
      headerAvatarContainer.setAttribute('title', `Connected as ${user.name || user.login}`);
      
      if (user.avatar_url) {
        if (headerAvatar) {
          headerAvatar.src = user.avatar_url;
          headerAvatar.style.opacity = '1';
          headerAvatar.style.display = 'block';
        }
        if (headerAvatarPlaceholder) headerAvatarPlaceholder.style.display = 'none';
        if (headerAvatarInitials) headerAvatarInitials.style.display = 'none';
      } else {
        if (headerAvatar) headerAvatar.style.display = 'none';
        if (headerAvatarPlaceholder) headerAvatarPlaceholder.style.display = 'none';
        if (headerAvatarInitials) {
          headerAvatarInitials.textContent = getInitials(user.name, user.login);
          headerAvatarInitials.style.display = 'flex';
        }
      }
    } else {
      headerAvatarContainer.setAttribute('title', 'Not Connected');
      if (headerAvatar) {
        headerAvatar.src = '';
        headerAvatar.style.opacity = '0';
        headerAvatar.style.display = 'none';
      }
      if (headerAvatarInitials) headerAvatarInitials.style.display = 'none';
      if (headerAvatarPlaceholder) headerAvatarPlaceholder.style.display = 'flex';
    }
  }

  // 4. Update PAT Section UI
  const patStatusCard = $('pat-status-card');
  const patStatusBadge = $('pat-status-badge');
  const patStatusText = $('pat-status-text');
  const patDetailsArea = $('pat-details-area');
  const patFormArea = $('pat-form-area');
  const patValidatedAtVal = $('pat-validated-at-val');
  const patTokenInput = $('github-token-input');

  if (patStatusCard) {
    if (activeMethod === 'pat') {
      patStatusCard.classList.add('active-method');
    } else {
      patStatusCard.classList.remove('active-method');
    }
  }

  if (patToken) {
    let isPatOffline = false;
    let isPatInvalid = false;
    
    if (activeMethod === 'pat') {
      const lastErr = AuthStateManager._lastError;
      isPatOffline = lastErr && lastErr.type === 'NETWORK_ERROR';
      isPatInvalid = !info.isLoggedIn && lastErr && lastErr.type === 'AUTH_ERROR';
    }

    if (patStatusBadge && patStatusText) {
      if (isPatInvalid) {
        patStatusBadge.className = 'auth-status-badge invalid';
        patStatusText.textContent = 'Invalid Token';
      } else {
        patStatusBadge.className = 'auth-status-badge connected';
        patStatusText.textContent = isPatOffline ? 'Offline' : 'Connected';
      }
    }
    
    if (patDetailsArea) patDetailsArea.style.display = 'block';
    if (patFormArea) patFormArea.style.display = 'none';
    
    if (patValidatedAtVal) {
      if (activeMethod === 'pat' && info.lastValidatedAt) {
        patValidatedAtVal.textContent = new Date(info.lastValidatedAt).toLocaleTimeString();
      } else {
        patValidatedAtVal.textContent = 'Session stored';
      }
    }

    if (patTokenInput && patTokenInput.value === '') {
      patTokenInput.value = patToken;
    }
  } else {
    if (patStatusBadge && patStatusText) {
      // Keep "Invalid Token" if it was explicitly marked invalid recently
      if (patStatusText.textContent !== 'Invalid Token') {
        patStatusBadge.className = 'auth-status-badge not-connected';
        patStatusText.textContent = 'Not Connected';
      }
    }
    
    if (patDetailsArea) patDetailsArea.style.display = 'none';
    if (patFormArea) patFormArea.style.display = 'block';
  }

  // 5. Update OAuth Section UI
  const oauthStatusCard = $('oauth-status-card');
  const oauthStatusBadge = $('oauth-status-badge');
  const oauthStatusText = $('oauth-status-text');
  const oauthDetailsArea = $('oauth-details-area');
  const oauthFormArea = $('oauth-form-area');
  const oauthUsernameVal = $('oauth-username-val');
  const oauthValidatedAtVal = $('oauth-validated-at-val');

  if (oauthStatusCard) {
    if (activeMethod === 'oauth') {
      oauthStatusCard.classList.add('active-method');
    } else {
      oauthStatusCard.classList.remove('active-method');
    }
  }

  if (oauthToken) {
    let isOauthOffline = false;
    let isOauthExpired = false;

    if (activeMethod === 'oauth') {
      const lastErr = AuthStateManager._lastError;
      isOauthOffline = lastErr && lastErr.type === 'NETWORK_ERROR';
      isOauthExpired = !info.isLoggedIn && lastErr && lastErr.type === 'AUTH_ERROR';
    }

    if (oauthStatusBadge && oauthStatusText) {
      if (isOauthExpired) {
        oauthStatusBadge.className = 'auth-status-badge expired';
        oauthStatusText.textContent = 'Expired';
      } else {
        oauthStatusBadge.className = 'auth-status-badge connected';
        oauthStatusText.textContent = isOauthOffline ? 'Offline' : 'Connected';
      }
    }

    if (oauthDetailsArea) oauthDetailsArea.style.display = 'block';
    if (oauthFormArea) oauthFormArea.style.display = 'none';

    if (oauthUsernameVal) {
      if (activeMethod === 'oauth' && user) {
        oauthUsernameVal.textContent = `@${user.login}`;
      } else {
        oauthUsernameVal.textContent = 'Connected';
      }
    }

    if (oauthValidatedAtVal) {
      if (activeMethod === 'oauth' && info.lastValidatedAt) {
        oauthValidatedAtVal.textContent = new Date(info.lastValidatedAt).toLocaleTimeString();
      } else {
        oauthValidatedAtVal.textContent = 'Session stored';
      }
    }
  } else {
    if (oauthStatusBadge && oauthStatusText) {
      oauthStatusBadge.className = 'auth-status-badge not-connected';
      oauthStatusText.textContent = 'Not Connected';
    }

    if (oauthDetailsArea) oauthDetailsArea.style.display = 'none';
    if (oauthFormArea) oauthFormArea.style.display = 'block';

    const clientIdInput = $('github-client-id-input');
    const clientSecretInput = $('github-client-secret-input');
    if (clientIdInput && oauthClientId && clientIdInput.value === '') {
      clientIdInput.value = oauthClientId;
    }
    if (clientSecretInput && oauthClientSecret && clientSecretInput.value === '') {
      clientSecretInput.value = oauthClientSecret;
    }
  }
}

function handleBannerAlert(event, data) {
  const banner = $('session-banner');
  const msgEl = $('banner-message');
  if (!banner || !msgEl) return;

  if (event === AUTH_EVENTS.SESSION_OFFLINE) {
    msgEl.textContent = 'You are currently offline. Cached data remains available.';
    banner.className = 'session-banner offline';
    banner.style.display = 'flex';
  } else if (event === AUTH_EVENTS.SESSION_EXPIRED) {
    msgEl.textContent = 'GitHub authentication expired. Please reconnect.';
    banner.className = 'session-banner expired';
    banner.style.display = 'flex';
  } else if (
    event === AUTH_EVENTS.LOGIN ||
    event === AUTH_EVENTS.SESSION_VALID ||
    event === AUTH_EVENTS.SESSION_REFRESHED
  ) {
    banner.style.display = 'none';
  }
}

function showSuccessToast(message) {
  NotificationManager.showToast(message, 'success');
}

/* ─────────────────────────────────────────────
   Boot
───────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
