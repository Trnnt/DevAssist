/**
 * Background Service Worker — DevAssist GitHub Extension
 * Manifest V3 compliant. Handles OAuth via chrome.identity.launchWebAuthFlow.
 *
 * FLOW:
 *   1. Popup sends START_OAUTH message.
 *   2. Background opens GitHub authorize URL with redirect_uri = chromiumapp.org URL.
 *   3. Chrome captures the redirect to chromiumapp.org and calls our callback.
 *   4. Background extracts the `code` and POSTs to localhost:3000/auth/github/exchange.
 *   5. Backend exchanges code for GitHub access token, returns it.
 *   6. Background sends token back to popup via sendResponse.
 *
 * REQUIREMENT: Register the chromiumapp.org URL in your GitHub OAuth App settings.
 *   URL: https://github.com/settings/applications
 *   Add callback: https://molpopfmailbhafmchpiheblifhkloll.chromiumapp.org/
 */

const DEFAULT_CLIENT_ID = 'Ov23liOvHUl1MK65i9LM';

// ──────────────────────────────────────────────────────────────
// Installation & Startup listeners
// ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  // Polling every 5 minutes to respect GitHub API rate limits (60 unauth / 5000 auth req/hr).
  chrome.alarms.create('github_polling', { periodInMinutes: 5.0 });
  pollGithubActivity();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('github_polling', { periodInMinutes: 5.0 });
});

// ──────────────────────────────────────────────────────────────
// Message Router
// ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  switch (message.type) {

    case 'PING':
      sendResponse({ status: 'SUCCESS', message: 'PONG' });
      break;

    case 'GET_REDIRECT_URL':
      // Returns the chromiumapp redirect URL so the popup can display it to the user
      sendResponse({ status: 'SUCCESS', redirectUrl: chrome.identity.getRedirectURL() });
      break;

    case 'START_OAUTH':
      handleOAuth(message, sendResponse);
      break; // async — return true below keeps channel open

    default:
      sendResponse({ status: 'ERROR', error: `Unknown message type: ${message.type}` });
      break;
  }

  // Keep the message channel open for async responses
  return true;
});

// ──────────────────────────────────────────────────────────────
// OAuth Handler
// ──────────────────────────────────────────────────────────────
async function handleOAuth(message, sendResponse) {
  const targetClientId = (message.clientId || DEFAULT_CLIENT_ID).trim();

  // The chromiumapp.org URL — Chrome intercepts redirects here
  const redirectUrl = chrome.identity.getRedirectURL();

  // Generate CSRF state
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const state = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

  // Build GitHub authorize URL — redirect_uri is the chromiumapp.org URL
  const authUrl =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${encodeURIComponent(targetClientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
    `&scope=read%3Auser%2Crepo` +
    `&state=${state}` +
    `&allow_signup=true`;

  try {
    const responseUrl = await launchWebAuthFlowAsync(authUrl);

    if (!responseUrl) {
      sendResponse({ status: 'ERROR', error: 'Authorization was cancelled or no redirect received.' });
      return;
    }

    // Extract code from redirect URL
    const urlObj = new URL(responseUrl);
    const code   = urlObj.searchParams.get('code');
    const retState = urlObj.searchParams.get('state');

    if (!code) {
      const errParam = urlObj.searchParams.get('error');
      const errDesc  = urlObj.searchParams.get('error_description');
      sendResponse({ status: 'ERROR', error: errParam ? `${errParam}: ${errDesc}` : 'No authorization code in redirect.' });
      return;
    }

    // CSRF check
    if (retState !== state) {
      console.warn('[DevAssist BG] State mismatch! Expected:', state, 'Got:', retState);
      sendResponse({ status: 'ERROR', error: 'OAuth state mismatch — possible CSRF attack.' });
      return;
    }

    // Return the code to popup — popup will perform the backend exchange
    // (service workers cannot reliably fetch localhost in MV3).
    // clientSecret is intentionally omitted; popup uses its own stored value.
    sendResponse({
      status:   'CODE_READY',
      code,
      redirectUrl,
      clientId: targetClientId,
    });

  } catch (err) {
    console.error('[DevAssist BG] OAuth flow error:', err.message);
    sendResponse({ status: 'ERROR', error: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// Promisified launchWebAuthFlow helper
// ──────────────────────────────────────────────────────────────
function launchWebAuthFlowAsync(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) {
        console.error('[DevAssist BG] launchWebAuthFlow error:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(responseUrl);
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────
// Decryption and Notification Helpers
// ──────────────────────────────────────────────────────────────
// NOTE: xorDecrypt is intentionally duplicated from services/storage.js because
// background service workers cannot use ES module imports in MV3.
function xorDecrypt(encrypted, key) {
  if (!encrypted) return '';
  try {
    const text = atob(encrypted);
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch (e) {
    console.error('Decryption failed:', e);
    return '';
  }
}

async function pushNotification(title, message, type = 'info') {
  return new Promise((resolve) => {
    chrome.storage.local.get(['notifications'], (res) => {
      const list = res.notifications || [];
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
      
      chrome.storage.local.set({ notifications: list }, () => {
        try {
          chrome.runtime.sendMessage({
            type: 'PUSH_NOTIFICATION',
            title,
            message,
            notificationType: type
          }, () => {
            if (chrome.runtime.lastError) {
              // Ignore last error when popup is closed
            }
          });
        } catch (e) {
          // ignore
        }
        resolve();
      });
    });
  });
}

// ──────────────────────────────────────────────────────────────
// Polling Service
// ──────────────────────────────────────────────────────────────
async function pollGithubActivity() {
  
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get([
        'loggedInUser',
        'authMethod',
        'githubPatToken',
        'githubOauthToken',
        'cachedFollowersList',
        'lastFollowersCount',
        'cachedRepoStars'
      ], resolve);
    });

    const user = data.loggedInUser;
    if (!user || !user.login) return;

    const authMethod = data.authMethod || 'oauth';
    const encryptedToken = authMethod === 'pat' ? data.githubPatToken : data.githubOauthToken;
    if (!encryptedToken) return;

    const token = xorDecrypt(encryptedToken, chrome.runtime.id);
    if (!token || !token.trim()) return;

    // 1. Fetch latest profile
    const username = user.login;
    const profileRes = await fetch(`https://api.github.com/user`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token.trim()}`
      }
    });

    if (!profileRes.ok) return;

    const profile = await profileRes.json();
    
    // Save updated profile to storage so popup stays updated
    await new Promise((resolve) => {
      chrome.storage.local.set({ loggedInUser: profile }, resolve);
    });

    // --- CHECK FOLLOWERS ---
    const currentFollowersCount = profile.followers;
    const lastFollowersCount = data.lastFollowersCount;

    if (lastFollowersCount !== undefined && currentFollowersCount > lastFollowersCount) {
      const followersRes = await fetch(`https://api.github.com/users/${username}/followers?per_page=100`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${token.trim()}`
        }
      });

      if (followersRes.ok) {
        const followersList = await followersRes.json();
        const currentFollowerNames = followersList.map(f => f.login);
        const cachedFollowersList = data.cachedFollowersList || [];

        // Find new ones
        const newFollowers = currentFollowerNames.filter(name => !cachedFollowersList.includes(name));
        for (const newFollower of newFollowers) {
          await pushNotification('New Follower', `@${newFollower} is now following you!`, 'success');
        }

        await new Promise((resolve) => {
          chrome.storage.local.set({
            lastFollowersCount: currentFollowersCount,
            cachedFollowersList: currentFollowerNames
          }, resolve);
        });
      }
    } else {
      if (lastFollowersCount === undefined || currentFollowersCount !== lastFollowersCount) {
        const followersRes = await fetch(`https://api.github.com/users/${username}/followers?per_page=100`, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token.trim()}`
          }
        });
        if (followersRes.ok) {
          const followersList = await followersRes.json();
          await new Promise((resolve) => {
            chrome.storage.local.set({
              lastFollowersCount: currentFollowersCount,
              cachedFollowersList: followersList.map(f => f.login)
            }, resolve);
          });
        }
      }
    }

    // --- CHECK REPOS & STARS ---
    const reposRes = await fetch(`https://api.github.com/user/repos?type=owner&sort=updated&per_page=100`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token.trim()}`
      }
    });

    if (reposRes.ok) {
      const repos = await reposRes.json();
      const cachedRepoStars = data.cachedRepoStars || {};
      const newRepoStars = {};
      const isFirstInit = Object.keys(cachedRepoStars).length === 0;

      for (const repo of repos) {
        const repoName = repo.name;
        const currentStars = repo.stargazers_count;
        newRepoStars[repoName] = currentStars;

        if (!isFirstInit) {
          const prevStars = cachedRepoStars[repoName];
          if (prevStars !== undefined && currentStars > prevStars) {
            const diff = currentStars - prevStars;
            await pushNotification('New Star!', `Your repository ${repoName} gained ${diff} new star${diff > 1 ? 's' : ''}!`, 'success');
          }
        }
      }

      await new Promise((resolve) => {
        chrome.storage.local.set({ cachedRepoStars: newRepoStars }, resolve);
      });
    }

  } catch (err) {
    console.error('[DevAssist BG] Polling error:', err.message);
  }
}

// ──────────────────────────────────────────────────────────────
// Alarm & Startup Hooks
// ──────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'github_polling') {
    pollGithubActivity();
  }
});
