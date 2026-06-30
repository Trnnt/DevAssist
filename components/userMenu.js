/**
 * User Menu Component
 * Manages the User Session Menu dropdown, including dynamic layout generation,
 * session details formatting, action handling, and keyboard accessibility.
 */

import { AuthStateManager } from '../services/auth.js';
import { AUTH_EVENTS, SESSION_STATES, AUTH_METHODS } from '../services/authConstants.js';

// Format timestamps helper
function formatDate(ts) {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  });
}

// Initials generation fallback
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

export class UserMenu {
  constructor(dropdownId, avatarContainerId, confirmModalId, searchCallback) {
    this.dropdown = document.getElementById(dropdownId);
    this.avatarContainer = document.getElementById(avatarContainerId);
    this.confirmModal = document.getElementById(confirmModalId);
    this.searchCallback = searchCallback;

    this.isOpen = false;
    this._focusables = [];

    this.init();
  }

  init() {
    // Toggle menu on avatar click
    this.avatarContainer?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.dropdown.contains(e.target) && !this.avatarContainer.contains(e.target)) {
        this.close();
      }
    });

    // Keyboard accessibility inside dropdown
    this.dropdown?.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Confirm Modal button listeners
    const cancelModalBtn = document.getElementById('confirm-modal-cancel');
    const confirmModalBtn = document.getElementById('confirm-modal-logout');

    cancelModalBtn?.addEventListener('click', () => {
      this.closeModal();
    });

    confirmModalBtn?.addEventListener('click', async () => {
      this.closeModal();
      try {
        await AuthStateManager.logout();
        this.showToast('Signed out successfully.', 'success');
      } catch (err) {
        this.showToast('Logout failed: ' + err.message, 'error');
      }
    });

    // Close modal on escape key
    this.confirmModal?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });

    // Subscribe to AuthStateManager events to dynamically update
    AuthStateManager.subscribe((event) => {
      if (this.isOpen) {
        this.render();
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    // Check if user is logged in
    const info = AuthStateManager.getSessionInfo();
    
    // Close other panels (Settings / Notifications) if open
    document.getElementById('settings-panel')?.classList.remove('visible');
    document.getElementById('notifications-panel')?.classList.remove('visible');

    this.isOpen = true;
    this.render();
    this.dropdown.style.display = 'flex';
    this.dropdown.classList.add('visible');
    this.dropdown.setAttribute('aria-hidden', 'false');

    // Setup focus trapping
    setTimeout(() => {
      this._focusables = Array.from(this.dropdown.querySelectorAll('button, [tabindex="0"]'));
      if (this._focusables.length > 0) {
        this._focusables[0].focus();
      }
    }, 50);
  }

  close() {
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.dropdown.classList.remove('visible');
    this.dropdown.setAttribute('aria-hidden', 'true');
    this.avatarContainer?.focus();
  }

  render() {
    const info = AuthStateManager.getSessionInfo();
    const user = AuthStateManager.currentUser;

    if (!user) {
      // Disconnected / Logged Out View inside menu
      this.dropdown.innerHTML = `
        <div class="user-menu-header empty-header">
          <div class="empty-header-title">Not Connected</div>
          <p class="empty-header-hint">Configure a connection method in Settings to get started.</p>
        </div>
        <div class="user-menu-actions">
          <button class="menu-action-btn primary" id="menu-open-settings" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Open Settings
          </button>
        </div>
      `;

      document.getElementById('menu-open-settings')?.addEventListener('click', () => {
        this.close();
        document.getElementById('settings-panel')?.classList.add('visible');
      });
      return;
    }

    // Connected Session view
    // Determine status and label color
    let statusClass = 'active';
    let statusText = 'Active';
    
    // Resolve dynamic status
    const method = info.authMethod === AUTH_METHODS.PAT ? 'PAT' : 'OAuth';

    // Heartbeat status check
    const lastValidated = info.lastValidatedAt;
    const validatedAge = lastValidated ? Date.now() - lastValidated : Infinity;

    // Use internal state or local properties to set active/offline/expired badge status
    if (!AuthStateManager.currentUser) {
      statusClass = 'expired';
      statusText = 'Expired';
    } else {
      // Check if we previously hit a network error
      // Note: AuthStateManager emits offline on fetch failures.
      // We can read status from cached data
      const lastErr = AuthStateManager._lastError;
      if (lastErr && lastErr.type === 'NETWORK_ERROR') {
        statusClass = 'offline';
        statusText = 'Offline';
      }
    }

    // Avatar or initials fallback
    let avatarHtml = `<img class="menu-avatar-img" src="${user.avatar_url}" alt="${user.name || user.login}" />`;
    if (!user.avatar_url) {
      const initials = getInitials(user.name, user.login);
      avatarHtml = `<div class="menu-avatar-initials">${initials}</div>`;
    }

    this.dropdown.innerHTML = `
      <div class="user-menu-header">
        <div class="menu-user-profile">
          <div class="menu-avatar-container">${avatarHtml}</div>
          <div class="menu-user-names">
            <span class="menu-user-name">${user.name || user.login}</span>
            <span class="menu-user-username">@${user.login}</span>
          </div>
        </div>
      </div>

      <div class="user-menu-section">
        <div class="menu-section-title">Session Details</div>
        
        <div class="menu-detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-val status-badge ${statusClass}">
            <span class="status-dot"></span>
            ${statusText}
          </span>
        </div>

        <div class="menu-detail-row">
          <span class="detail-label">Method</span>
          <span class="detail-val method-badge">${method}</span>
        </div>

        <div class="menu-detail-row">
          <span class="detail-label">Connected</span>
          <span class="detail-val">${formatDate(info.authenticatedAt)}</span>
        </div>

        <div class="menu-detail-row">
          <span class="detail-label">Validated</span>
          <span class="detail-val">${formatDate(info.lastValidatedAt)}</span>
        </div>
      </div>

      <div class="user-menu-actions">
        <button class="menu-action-btn" id="menu-view-profile" role="menuitem" aria-label="View user profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          View Profile
        </button>
        <button class="menu-action-btn" id="menu-refresh-session" role="menuitem" aria-label="Refresh active session">
          <svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"></path>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Refresh Session
        </button>
        <div class="menu-divider"></div>
        <button class="menu-action-btn danger" id="menu-logout" role="menuitem" aria-label="Sign out of session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Sign Out
        </button>
      </div>
    `;

    // Hook button events
    document.getElementById('menu-view-profile')?.addEventListener('click', () => {
      this.close();
      if (this.searchCallback) {
        this.searchCallback(user.login);
      }
    });

    const refreshBtn = document.getElementById('menu-refresh-session');
    refreshBtn?.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('.refresh-icon');
      icon?.classList.add('spinning');
      refreshBtn.disabled = true;

      try {
        const success = await AuthStateManager.refreshSession();
        if (success) {
          this.showToast('Session refreshed.', 'success');
        } else {
          this.showToast('Session expired.', 'error');
        }
      } catch (err) {
        if (err.type === 'NETWORK_ERROR') {
          this.showToast('No internet connection.', 'error');
        } else {
          this.showToast(err.message, 'error');
        }
      } finally {
        icon?.classList.remove('spinning');
        refreshBtn.disabled = false;
        this.render();
      }
    });

    document.getElementById('menu-logout')?.addEventListener('click', () => {
      this.close();
      this.openModal();
    });
  }

  // Accessibility keyboard trapping
  handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.close();
      return;
    }

    if (e.key === 'Tab') {
      if (this._focusables.length === 0) return;
      const first = this._focusables[0];
      const last = this._focusables[this._focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
  }

  // Toast notifier
  showToast(message, type) {
    const errorEl = document.getElementById('error-message');
    if (!errorEl) return;

    errorEl.textContent = message;
    errorEl.style.display = 'block';
    
    // Clear status
    errorEl.className = 'error-message';
    if (type === 'success') {
      errorEl.classList.add('toast-success');
    } else {
      errorEl.classList.add('toast-error');
    }

    setTimeout(() => {
      errorEl.style.display = 'none';
    }, 3000);
  }

  openModal() {
    if (!this.confirmModal) return;
    this.confirmModal.style.display = 'flex';
    this.confirmModal.classList.add('visible');
    
    // Trap focus in modal
    setTimeout(() => {
      const confirmBtn = document.getElementById('confirm-modal-logout');
      confirmBtn?.focus();
    }, 50);
  }

  closeModal() {
    if (!this.confirmModal) return;
    this.confirmModal.style.display = 'none';
    this.confirmModal.classList.remove('visible');
    this.avatarContainer?.focus();
  }
}
