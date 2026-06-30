import { getHistory, clearHistory, getRepoHistory, removeRepoHistory } from '../services/storage.js';
import { escapeHTML } from '../services/utils.js';

/**
 * Renders the search and repository history lists into the given container.
 * @param {HTMLElement} container - Target container
 * @param {Function} onLoadProfile - Callback to load a profile when clicked
 * @param {Function} onLoadRepo - Callback to load a repo context when clicked
 */
export async function renderHistory(container, onLoadProfile, onLoadRepo) {
  const history = await getHistory();
  const repoHistory = await getRepoHistory();

  const hasHistory = history.length > 0 || repoHistory.length > 0;

  if (!hasHistory) {
    container.innerHTML = `
      <div class="empty-state history-empty">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <h3>No history found</h3>
        <p>Your search and AI generation history will be listed here.</p>
      </div>
    `;
    return;
  }

  // Generate HTML for Developer Search history
  let searchItemsHTML = '<div class="empty-state-sub" style="font-size:12px; color:var(--text-muted); padding: 8px;">No search history</div>';
  if (history.length > 0) {
    searchItemsHTML = history
      .map((username) => {
        const safeUser = escapeHTML(username);
        return `
          <div class="history-item" data-username="${safeUser}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 6px; cursor: pointer;">
            <div class="history-item-left" style="display: flex; align-items: center; gap: 8px;">
              <span class="history-clock" style="color: var(--text-muted);">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </span>
              <span class="history-name" style="font-weight: 500;">@${safeUser}</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="history-delete-search-btn" data-username="${safeUser}" title="Delete" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:2px;" onclick="event.stopPropagation();">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent-red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Generate HTML for Repository actions history
  let repoItemsHTML = '<div class="empty-state-sub" style="font-size:12px; color:var(--text-muted); padding: 8px;">No repository actions history</div>';
  if (repoHistory.length > 0) {
    repoItemsHTML = repoHistory
      .map((item) => {
        const safeOwner = escapeHTML(item.owner || '');
        const safeRepo = escapeHTML(item.repo || '');
        const safeAction = escapeHTML(item.action || '');
        const safeId = escapeHTML(item.id);
        const nameLabel = safeOwner ? `${safeOwner}/${safeRepo}` : safeRepo;
        
        return `
          <div class="repo-history-item" data-id="${safeId}" data-owner="${safeOwner}" data-repo="${safeRepo}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 6px; cursor: pointer;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 12px; font-weight: 500; color: var(--text-primary);">${safeAction}</span>
              <span style="font-size: 10px; color: var(--text-muted);">${nameLabel}</span>
            </div>
            <button class="history-delete-repo-btn" data-id="${safeId}" title="Delete" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:2px;" onclick="event.stopPropagation();">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent-red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        `;
      })
      .join('');
  }

  container.innerHTML = `
    <div class="history-list" style="display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto; padding-bottom: 24px;">
      
      <!-- Developer Searches Section -->
      <div>
        <div class="history-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary);">Recent Searches</h3>
          <button id="clear-searches-btn" class="clear-btn" style="font-size: 11px; color: var(--accent-red); background: transparent; border: none; cursor: pointer;">Clear Searches</button>
        </div>
        <div class="history-items-container">
          ${searchItemsHTML}
        </div>
      </div>

      <!-- Repo operations Section -->
      <div>
        <div class="history-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary);">Repository Actions</h3>
          <button id="clear-repos-btn" class="clear-btn" style="font-size: 11px; color: var(--accent-red); background: transparent; border: none; cursor: pointer;">Clear Actions</button>
        </div>
        <div class="history-items-container">
          ${repoItemsHTML}
        </div>
      </div>

    </div>
  `;

  // Click on search item loads profile
  container.querySelectorAll('.history-item').forEach((item) => {
    item.addEventListener('click', () => {
      const username = item.getAttribute('data-username');
      if (username && onLoadProfile) onLoadProfile(username);
    });
  });

  // Click on repo history item triggers load repo context if handler provided
  container.querySelectorAll('.repo-history-item').forEach((item) => {
    item.addEventListener('click', () => {
      const owner = item.getAttribute('data-owner');
      const repo = item.getAttribute('data-repo');
      if (onLoadRepo) onLoadRepo(owner, repo);
    });
  });

  // Individual search delete
  container.querySelectorAll('.history-delete-search-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const username = btn.getAttribute('data-username');
      let current = await getHistory();
      current = current.filter(u => u.toLowerCase() !== username.toLowerCase());
      await chrome.storage.local.set({ gh_history: current });
      renderHistory(container, onLoadProfile, onLoadRepo);
    });
  });

  // Individual repo action delete
  container.querySelectorAll('.history-delete-repo-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      await removeRepoHistory(id);
      renderHistory(container, onLoadProfile, onLoadRepo);
    });
  });

  // Clear Searches action
  container.querySelector('#clear-searches-btn')?.addEventListener('click', async () => {
    await clearHistory();
    renderHistory(container, onLoadProfile, onLoadRepo);
  });

  // Clear Repo Actions action
  container.querySelector('#clear-repos-btn')?.addEventListener('click', async () => {
    await chrome.storage.local.set({ gh_repo_history: [] });
    renderHistory(container, onLoadProfile, onLoadRepo);
  });
}
