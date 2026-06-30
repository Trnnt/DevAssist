/**
 * Favorites Component
 * Renders the favorites panel with saved developer compact rows.
 */

import { getFavorites, removeFavorite } from '../services/storage.js';
import { escapeHTML } from '../services/utils.js';

/**
 * Renders the favorites tab content.
 * @param {HTMLElement} container - Target DOM element
 * @param {Function} onLoadProfile - Callback to load a developer's profile
 * @param {Function} onFavoritesChanged - Callback when favorites list changes
 */
export async function renderFavorites(container, onLoadProfile, onFavoritesChanged) {
  const favorites = await getFavorites();
  const entries = Object.values(favorites);

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state favorites-empty">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <h3>No favorites yet</h3>
        <p>Search for a developer and tap the bookmark icon to save them here.</p>
      </div>
    `;
    return;
  }

  // Sort by most recently saved
  const sorted = entries.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const cardsHTML = sorted
    .map((dev) => {
      const safeLogin = escapeHTML(dev.login);
      const safeAvatarUrl = escapeHTML(dev.avatar_url);
      const safeName = escapeHTML(dev.name || dev.login);

      return `
        <div class="fav-card" data-username="${safeLogin}">
          <img
            src="${safeAvatarUrl}"
            alt="${safeLogin}"
            class="fav-avatar"
            loading="lazy"
          />
          <div class="fav-info">
            <div class="fav-name">${safeName}</div>
            <div class="fav-username">@${safeLogin}</div>
          </div>
          <div class="fav-actions">
            <button class="fav-load-btn" data-username="${safeLogin}" title="Load profile" aria-label="Load ${safeLogin}'s profile">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button class="fav-remove-btn" data-username="${safeLogin}" title="Remove from favorites" aria-label="Remove ${safeLogin} from favorites">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="favorites-list">
      <div class="favorites-header">
        <h3>Saved Developers <span class="fav-count">${entries.length}</span></h3>
      </div>
      <div class="fav-items-container">
        ${cardsHTML}
      </div>
    </div>
  `;

  // Wire up load profile buttons
  container.querySelectorAll('.fav-load-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const username = btn.getAttribute('data-username');
      if (username && onLoadProfile) onLoadProfile(username);
    });
  });

  // Wire up the clickable card itself (excluding action buttons)
  container.querySelectorAll('.fav-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Don't trigger if a button was clicked
      if (e.target.closest('.fav-actions')) return;
      const username = card.getAttribute('data-username');
      if (username && onLoadProfile) onLoadProfile(username);
    });
  });

  // Wire up remove buttons
  container.querySelectorAll('.fav-remove-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const username = btn.getAttribute('data-username');
      if (!username) return;

      const card = btn.closest('.fav-card');
      // Animate removal
      if (card) {
        card.style.transition = 'opacity 0.2s, transform 0.2s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        await new Promise((r) => setTimeout(r, 200));
      }

      await removeFavorite(username);
      // Re-render favorites
      await renderFavorites(container, onLoadProfile, onFavoritesChanged);
      if (onFavoritesChanged) onFavoritesChanged();
    });
  });
}
