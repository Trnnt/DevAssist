/**
 * Profile Component
 * Renders user profile card with micro-interactions and skeleton loaders.
 */

import { isFavorite, saveFavorite, removeFavorite, getLoggedInUser } from '../services/storage.js';
import { escapeHTML, animateCountUp } from '../services/utils.js';
import { getFollowers, getFollowing } from '../services/github.js';

let myFollowersCache = null;
let myFollowingCache = null;
let cachedMe = null;

async function getMyRelationships() {
  const me = await getLoggedInUser();
  if (!me || !me.login) {
    return { followers: new Set(), following: new Set() };
  }
  
  if (cachedMe !== me.login) {
    myFollowersCache = null;
    myFollowingCache = null;
    cachedMe = me.login;
  }
  
  if (myFollowersCache && myFollowingCache) {
    return { followers: myFollowersCache, following: myFollowingCache };
  }
  
  try {
    const [followersData, followingData] = await Promise.all([
      getFollowers(me.login).catch(() => []),
      getFollowing(me.login).catch(() => [])
    ]);
    
    myFollowersCache = new Set(followersData.map(u => u.login.toLowerCase()));
    myFollowingCache = new Set(followingData.map(u => u.login.toLowerCase()));
  } catch (err) {
    console.error('Failed to fetch my relationships:', err);
    myFollowersCache = myFollowersCache || new Set();
    myFollowingCache = myFollowingCache || new Set();
  }
  
  return { followers: myFollowersCache, following: myFollowingCache };
}

/**
 * Formats a date string into a human-readable format.
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date (e.g., "Jan 2020")
 */
function formatJoinDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// SVG Icons for Favorite Button state
const FAV_ICON_ACTIVE = `
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>
`;

const FAV_ICON_INACTIVE = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>
`;

/**
 * Renders the profile card into the given container element.
 * @param {Object} user - GitHub user profile data
 * @param {HTMLElement} container - Target DOM element
 * @param {Function} onFavoriteToggle - Callback when favorite state changes
 * @param {Function} onUserClick - Callback when a related user is clicked
 */
export async function renderProfile(user, container, onFavoriteToggle, onUserClick) {
  const favorite = await isFavorite(user.login);

  // Escaping variables for safe injection
  const safeLogin = escapeHTML(user.login);
  const safeAvatarUrl = escapeHTML(user.avatar_url);
  const safeName = escapeHTML(user.name || user.login);
  const safeBio = user.bio ? escapeHTML(user.bio) : '';
  const safeCompany = user.company ? escapeHTML(user.company.replace('@', '')) : '';
  const safeLocation = user.location ? escapeHTML(user.location) : '';
  const safeBlog = user.blog ? escapeHTML(user.blog) : '';
  const safeBlogUrl = safeBlog.startsWith('http') ? safeBlog : 'https://' + safeBlog;

  const profileHTML = `
    <div class="profile-card" id="profile-card">
      <div class="profile-header">
        <div class="avatar-wrapper">
          <img
            src="${safeAvatarUrl}"
            alt="${safeLogin}'s avatar"
            class="avatar"
            id="profile-avatar"
            style="opacity:0; transition: opacity 300ms ease;"
          />
          <div class="avatar-ring"></div>
        </div>
        <div class="profile-info">
          <h2 class="profile-name" id="profile-name">${safeName}</h2>
          <p class="profile-username">
            <a href="https://github.com/${safeLogin}" target="_blank" rel="noopener" id="profile-link">
              @${safeLogin}
            </a>
          </p>
          ${safeBio ? `<p class="profile-bio" id="profile-bio">${safeBio}</p>` : ''}
        </div>
        <button
          class="favorite-btn ${favorite ? 'is-favorite' : ''}"
          id="favorite-btn"
          title="${favorite ? 'Remove from favorites' : 'Add to favorites'}"
          aria-label="${favorite ? 'Remove from favorites' : 'Add to favorites'}"
          aria-pressed="${favorite}"
        >
          ${favorite ? FAV_ICON_ACTIVE : FAV_ICON_INACTIVE}
        </button>
      </div>

      <div class="profile-meta">
        ${user.company ? `
          <span class="meta-item" title="Company">
            <svg viewBox="0 0 24 24" class="meta-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
            ${safeCompany}
          </span>` : ''}
        ${user.location ? `
          <span class="meta-item" title="Location">
            <svg viewBox="0 0 24 24" class="meta-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${safeLocation}
          </span>` : ''}
        ${user.blog ? `
          <span class="meta-item" title="Website">
            <svg viewBox="0 0 24 24" class="meta-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            <a href="${escapeHTML(safeBlogUrl)}" target="_blank" rel="noopener" title="${safeBlog}">Website</a>
          </span>` : ''}
        <span class="meta-item" title="Member since">
          <svg viewBox="0 0 24 24" class="meta-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          Joined ${escapeHTML(formatJoinDate(user.created_at))}
        </span>
      </div>

      <div class="profile-stats">
        <div class="stat-item" title="Public Repositories">
          <span class="stat-value count-up-val" data-target="${user.public_repos}">0</span>
          <span class="stat-label">Repos</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item" title="Followers" data-clickable="true" id="stat-followers">
          <span class="stat-value count-up-val" data-target="${user.followers}">0</span>
          <span class="stat-label">Followers</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item" title="Following" data-clickable="true" id="stat-following">
          <span class="stat-value count-up-val" data-target="${user.following}">0</span>
          <span class="stat-label">Following</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item" title="Public Gists">
          <span class="stat-value count-up-val" data-target="${user.public_gists}">0</span>
          <span class="stat-label">Gists</span>
        </div>
      </div>

      <!-- Collapsible relations list -->
      <div class="profile-relations-panel" id="profile-relations-panel" style="display: none;">
        <div class="relations-header">
          <span class="relations-title" id="relations-title">Followers</span>
          <button class="close-panel-btn" id="close-relations-btn" title="Close panel" aria-label="Close panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="relations-list" id="relations-list"></div>
      </div>
    </div>
  `;

  container.innerHTML = profileHTML;

  // Trigger avatar fade-in on load
  const avatarImg = container.querySelector('#profile-avatar');
  if (avatarImg) {
    avatarImg.addEventListener('load', () => {
      avatarImg.style.opacity = '1';
    });
    if (avatarImg.complete) {
      avatarImg.style.opacity = '1';
    }
  }

  // Update header avatar too!
  const headerAvatar = document.getElementById('header-avatar');
  if (headerAvatar) {
    headerAvatar.src = user.avatar_url;
    headerAvatar.style.opacity = '1';
    const placeholder = document.getElementById('header-avatar-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  }

  // Trigger count up animations
  container.querySelectorAll('.count-up-val').forEach((el) => {
    const targetVal = parseInt(el.getAttribute('data-target'), 10);
    animateCountUp(el, targetVal, 250);
  });

  // Wire up the favorite button
  const favBtn = container.querySelector('#favorite-btn');
  if (favBtn) {
    favBtn.addEventListener('click', async () => {
      const currentlyFav = await isFavorite(user.login);
      if (currentlyFav) {
        await removeFavorite(user.login);
        favBtn.innerHTML = FAV_ICON_INACTIVE;
        favBtn.classList.remove('is-favorite');
        favBtn.title = 'Add to favorites';
        favBtn.setAttribute('aria-pressed', 'false');
      } else {
        await saveFavorite(user.login, user);
        favBtn.innerHTML = FAV_ICON_ACTIVE;
        favBtn.classList.add('is-favorite');
        favBtn.title = 'Remove from favorites';
        favBtn.setAttribute('aria-pressed', 'true');
      }
      if (onFavoriteToggle) onFavoriteToggle();
    });
  }

  // Relations Toggle and Fetching Logic
  const statFollowers = container.querySelector('#stat-followers');
  const statFollowing = container.querySelector('#stat-following');
  const relationsPanel = container.querySelector('#profile-relations-panel');
  const relationsTitle = container.querySelector('#relations-title');
  const relationsList = container.querySelector('#relations-list');
  const closeRelationsBtn = container.querySelector('#close-relations-btn');

  if (closeRelationsBtn && relationsPanel) {
    closeRelationsBtn.addEventListener('click', () => {
      relationsPanel.style.display = 'none';
      if (statFollowers) statFollowers.classList.remove('active-stat');
      if (statFollowing) statFollowing.classList.remove('active-stat');
    });
  }

  async function showRelations(type) {
    if (!relationsPanel || !relationsList) return;
    
    // Toggle active classes
    if (type === 'followers') {
      statFollowers?.classList.add('active-stat');
      statFollowing?.classList.remove('active-stat');
      relationsTitle.textContent = 'Followers';
    } else {
      statFollowing?.classList.add('active-stat');
      statFollowers?.classList.remove('active-stat');
      relationsTitle.textContent = 'Following';
    }
    
    relationsPanel.style.display = 'block';
    relationsList.innerHTML = '<div class="relations-empty">Loading users...</div>';
    
    try {
      const [listData, myRelations] = await Promise.all([
        type === 'followers' ? getFollowers(user.login) : getFollowing(user.login),
        getMyRelationships()
      ]);
      
      if (!listData || listData.length === 0) {
        relationsList.innerHTML = `<div class="relations-empty">No ${type} found.</div>`;
        return;
      }
      
      relationsList.innerHTML = '';
      listData.forEach(item => {
        const itemLogin = escapeHTML(item.login);
        const itemAvatar = escapeHTML(item.avatar_url);
        
        const isFollowingMe = myRelations.followers.has(item.login.toLowerCase());
        const isFollowedByMe = myRelations.following.has(item.login.toLowerCase());
        
        let badgeHTML = '';
        if (isFollowingMe && isFollowedByMe) {
          badgeHTML = '<span class="relation-badge badge-mutual">Mutual</span>';
        } else if (isFollowingMe) {
          badgeHTML = '<span class="relation-badge badge-follows-you">Follows You</span>';
        } else if (isFollowedByMe) {
          badgeHTML = '<span class="relation-badge badge-following">Following</span>';
        }
        
        const itemEl = document.createElement('div');
        itemEl.className = 'relation-user-item';
        itemEl.innerHTML = `
          <div class="relation-user-info" data-username="${itemLogin}">
            <img src="${itemAvatar}" class="relation-avatar" alt="${itemLogin}'s avatar" />
            <span class="relation-username">@${itemLogin}</span>
          </div>
          <div class="relation-badges">
            ${badgeHTML}
          </div>
        `;
        
        const infoEl = itemEl.querySelector('.relation-user-info');
        if (infoEl && onUserClick) {
          infoEl.addEventListener('click', () => {
            onUserClick(item.login);
          });
        }
        
        relationsList.appendChild(itemEl);
      });
    } catch (err) {
      console.error(err);
      relationsList.innerHTML = '<div class="relations-empty" style="color: var(--accent-red-hover);">Failed to load list.</div>';
    }
  }

  if (statFollowers) {
    statFollowers.addEventListener('click', () => {
      if (statFollowers.classList.contains('active-stat')) {
        relationsPanel.style.display = 'none';
        statFollowers.classList.remove('active-stat');
      } else {
        showRelations('followers');
      }
    });
  }

  if (statFollowing) {
    statFollowing.addEventListener('click', () => {
      if (statFollowing.classList.contains('active-stat')) {
        relationsPanel.style.display = 'none';
        statFollowing.classList.remove('active-stat');
      } else {
        showRelations('following');
      }
    });
  }
}

/**
 * Renders a skeleton loading placeholder for the profile card.
 * @param {HTMLElement} container
 */
export function renderProfileSkeleton(container) {
  container.innerHTML = `
    <div class="profile-card skeleton-card">
      <div class="profile-header">
        <div class="skeleton skeleton-avatar"></div>
        <div class="profile-info">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-text" style="width: 80px;"></div>
          <div class="skeleton skeleton-text" style="width: 200px;"></div>
          <div class="skeleton skeleton-text" style="width: 170px;"></div>
        </div>
      </div>
      <div class="profile-stats">
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
      </div>
    </div>
  `;
}
