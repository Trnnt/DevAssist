/**
 * Repositories Component
 * Stateless component to render repository list, search, sort, and language filters.
 */

import { escapeHTML } from '../services/utils.js';

/** Map of programming language names to their canonical colors */
const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Go: '#00ADD8',
  Rust: '#dea584',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Ruby: '#701516',
  PHP: '#4F5D95',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  R: '#198CE7',
  Vue: '#41b883',
  Jupyter: '#DA5B0B',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Lua: '#000080',
  Perl: '#0298c3',
};

/**
 * Returns the language color for a given language name.
 * @param {string} lang
 * @returns {string} hex color
 */
function getLanguageColor(lang) {
  return LANGUAGE_COLORS[lang] || '#8b949e';
}

/**
 * Formats a date relative to now (e.g., "3 days ago").
 * @param {string} dateStr
 * @returns {string}
 */
function timeAgo(dateStr) {
  if (!dateStr) return 'Unknown date';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `Updated ${years} year${years > 1 ? 's' : ''} ago`;
  if (months > 0) return `Updated ${months} month${months > 1 ? 's' : ''} ago`;
  if (days > 0) return `Updated ${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `Updated ${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `Updated ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Updated just now';
}

/**
 * Creates a single repository card HTML string.
 * @param {Object} repo
 * @returns {string}
 */
function createRepoCard(repo) {
  const safeName = escapeHTML(repo.name);
  const safeFullName = escapeHTML(repo.full_name);
  const safeHtmlUrl = escapeHTML(repo.html_url);
  const safeLang = repo.language ? escapeHTML(repo.language) : '';
  const safeDesc = repo.description ? escapeHTML(repo.description) : '';

  const langDot = safeLang
    ? `<div class="repo-lang-wrapper"><span class="lang-dot" style="background:${getLanguageColor(repo.language)}"></span><span class="lang-name">${safeLang}</span></div>`
    : ``;

  const description = safeDesc
    ? `<p class="repo-desc">${safeDesc}</p>`
    : '';

  const isForked = repo.fork
    ? `<span class="repo-badge fork-badge" title="Forked repository"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 9v3m0 0v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5m12-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg> Forked</span>`
    : '';

  const isArchived = repo.archived
    ? `<span class="repo-badge archive-badge" title="Archived">Archived</span>`
    : '';

  const visibilityBadge = repo.private
    ? `<span class="repo-badge private-badge" title="Private repository"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>Private</span>`
    : `<span class="repo-badge public-badge" title="Public repository">Public</span>`;

  return `
    <div class="repo-card premium-card" data-repo="${safeName}">
      <div class="repo-card-header">
        <div class="repo-title-wrapper">
          <a href="${safeHtmlUrl}" target="_blank" rel="noopener" class="repo-name" title="${safeFullName}">
            ${safeName}
          </a>
          <div class="repo-badges">${visibilityBadge}${isForked}${isArchived}</div>
        </div>
      </div>
      ${description}
      <div class="repo-footer">
        <div class="repo-stats-group">
          ${langDot}
          <span class="repo-stat" title="Stars">
            <svg viewBox="0 0 24 24" class="stat-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            ${repo.stargazers_count.toLocaleString()}
          </span>
          <span class="repo-stat" title="Forks">
            <svg viewBox="0 0 24 24" class="stat-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="18" r="3"></circle>
              <circle cx="6" cy="6" r="3"></circle>
              <circle cx="6" cy="18" r="3"></circle>
              <path d="M18 15V9a4 4 0 0 0-4-4H9"></path>
              <line x1="6" y1="9" x2="6" y2="15"></line>
            </svg>
            ${repo.forks_count.toLocaleString()}
          </span>
        </div>
        <span class="repo-updated">${timeAgo(repo.updated_at)}</span>
      </div>
    </div>
  `;
}

/**
 * Renders the repository list and filter interface (fully stateless).
 * @param {HTMLElement} container - Target DOM element
 * @param {Object} props - Component properties
 * @param {Array} props.repos - Already filtered/sorted repositories to display
 * @param {number} props.totalCount - Total repositories after filtering
 * @param {number} props.allCount - Total public repositories
 * @param {number} props.displayedCount - Number of repos to display
 * @param {Array<string>} props.languages - List of all languages available
 * @param {Object} props.filters - Current filter values
 * @param {string} props.filters.search - Search string
 * @param {string} props.filters.sort - Sort mode ("stars", "updated", "name", "forks")
 * @param {string} props.filters.language - Selected filter language
 * @param {Function} props.onFilterChange - Callback when filter options change: (key, value) => void
 * @param {Function} props.onLoadMore - Callback when load more button is clicked: () => void
 */
export function renderRepos(container, {
  repos,
  totalCount,
  allCount,
  displayedCount,
  languages,
  filters,
  onFilterChange,
  onLoadMore
}) {
  let controlsEl = container.querySelector('#repos-controls');
  let listEl = container.querySelector('#repo-list');

  // If layout structure doesn't exist, create it
  if (!controlsEl || !listEl) {
    const controlsHTML = `
      <div class="repos-controls" id="repos-controls">
        <div class="repos-search-row">
          <div class="search-input-wrapper">
            <svg viewBox="0 0 24 24" class="search-icon-sm" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="repo-search" placeholder="Search repositories..." class="repo-search-input" autocomplete="off" />
          </div>
        </div>
        <div class="repos-filter-row">
          <select id="repo-sort" class="filter-select" title="Sort repositories">
            <option value="stars">Most Stars</option>
            <option value="updated">Latest Updated</option>
            <option value="name">Name A–Z</option>
            <option value="forks">Most Forks</option>
          </select>
          <select id="lang-filter" class="filter-select" title="Filter by language">
            <option value="">All Languages</option>
            ${languages.map((l) => `<option value="${escapeHTML(l)}">${escapeHTML(l)}</option>`).join('')}
          </select>
        </div>
        <div class="repos-meta">
          <span id="repo-count-display"></span>
        </div>
      </div>
      <div id="repo-list" class="repo-list"></div>
    `;

    container.innerHTML = controlsHTML;
    controlsEl = container.querySelector('#repos-controls');
    listEl = container.querySelector('#repo-list');

    // Attach listener triggers once to avoid multiple event handlers
    _attachRepoControls(container, onFilterChange);
  }

  // Update controls state safely without rebuilding DOM (prevents focus loss)
  const searchInput = container.querySelector('#repo-search');
  if (searchInput && document.activeElement !== searchInput) {
    searchInput.value = filters.search || '';
  }

  const sortSelect = container.querySelector('#repo-sort');
  if (sortSelect) {
    sortSelect.value = filters.sort || 'updated';
  }

  const langSelect = container.querySelector('#lang-filter');
  if (langSelect) {
    langSelect.value = filters.language || '';
  }

  // Render the list of repositories
  const toShow = repos.slice(0, displayedCount);

  if (totalCount === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <p>No repositories match your filters.</p>
      </div>
    `;
  } else {
    const cards = toShow.map(createRepoCard).join('');
    const hasMore = totalCount > displayedCount;
    const loadMoreBtnHTML = hasMore
      ? `<button class="load-more-btn" id="load-more-repos">
           Load more (${totalCount - displayedCount} remaining)
         </button>`
      : '';
    listEl.innerHTML = cards + loadMoreBtnHTML;

    // Attach click handler to newly rendered Load More button
    const loadMoreBtn = listEl.querySelector('#load-more-repos');
    if (loadMoreBtn && onLoadMore) {
      loadMoreBtn.addEventListener('click', () => {
        onLoadMore();
      });
    }
  }

  // Update the count label
  const countEl = container.querySelector('#repo-count-display');
  if (countEl) {
    countEl.innerHTML = `Showing <strong>${Math.min(displayedCount, totalCount)}</strong> of <strong>${totalCount}</strong> repositories`;
  }
}

/**
 * Binds input and change events to container controls.
 */
function _attachRepoControls(container, onFilterChange) {
  const searchInput = container.querySelector('#repo-search');
  const sortSelect = container.querySelector('#repo-sort');
  const langSelect = container.querySelector('#lang-filter');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      onFilterChange('search', e.target.value);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      onFilterChange('sort', e.target.value);
    });
  }

  if (langSelect) {
    langSelect.addEventListener('change', (e) => {
      onFilterChange('language', e.target.value);
    });
  }
}

/**
 * Renders a skeleton placeholder for the repos section.
 * @param {HTMLElement} container
 */
export function renderReposSkeleton(container) {
  const cards = Array(4)
    .fill(0)
    .map(
      () => `
    <div class="repo-card skeleton-card">
      <div class="skeleton skeleton-title" style="width:40%"></div>
      <div class="skeleton skeleton-text" style="width:90%"></div>
      <div class="skeleton skeleton-text" style="width:70%"></div>
      <div class="skeleton skeleton-text" style="width:30%"></div>
    </div>
  `
    )
    .join('');
  container.innerHTML = `<div class="repo-list">${cards}</div>`;
}
