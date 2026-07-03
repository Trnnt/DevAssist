require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// ──────────────────────────────────────────────────────────────
// Firebase Initialization
// ──────────────────────────────────────────────────────────────
let adminSdkInitialized = false;
let db = null;

try {
  let serviceAccount = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    try {
      serviceAccount = require('./service-account.json');
    } catch (_) {
      // Ignore if file is missing
    }
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    const dbId = process.env.FIRESTORE_DATABASE_ID || 'default';
    db.settings({ databaseId: dbId });
    adminSdkInitialized = true;

  } else {
    console.warn('[Firebase] Running in fallback mode. Set FIREBASE_SERVICE_ACCOUNT env var.');
  }
} catch (err) {
  console.warn('[Firebase] Failed to initialize:', err.message);
}

// ──────────────────────────────────────────────────────────────
// Express App & Middleware
// ──────────────────────────────────────────────────────────────
const app = express();

app.use(helmet());

const allowedOrigins = [
  'chrome-extension://molpopfmailbhafmchpiheblifhkloll',
  'chrome-extension://molpopftmailbhafmchpiheblifhklol'
];
app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('chrome-extension://') ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  }
}));

app.use(express.json());

// ──────────────────────────────────────────────────────────────
// JWT & Rate Limit Configuration
// ──────────────────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Authentication limit reached. Please try again in 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'API rate limit exceeded. Please slow down.' }
});

// ──────────────────────────────────────────────────────────────
// JWT Verification Middleware
// ──────────────────────────────────────────────────────────────
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired access token.' });
    }
    req.user = user;
    next();
  });
}

// ──────────────────────────────────────────────────────────────
// Firestore Helper: Upsert User Profile
// ──────────────────────────────────────────────────────────────
async function upsertUserProfile(profile) {
  if (!adminSdkInitialized) return;
  const githubUid = `github:${profile.id}`;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const userRef = db.collection('users').doc(githubUid);
  const doc = await userRef.get();

  if (!doc.exists) {
    // First login — create full profile
    await userRef.set({
      uid: githubUid,
      githubId: String(profile.id),
      username: profile.login,
      displayName: profile.name || profile.login,
      avatarUrl: profile.avatar_url,
      email: profile.email || null,
      bio: profile.bio || null,
      company: profile.company || null,
      location: profile.location || null,
      blog: profile.blog || null,
      authProvider: 'github_oauth',
      createdAt: now,
      lastLoginAt: now,
      settings: {
        theme: 'dark',
        notificationsEnabled: true,
        dashboardPreferences: {},
        aiPreferences: {}
      }
    });

  } else {
    // Returning user — only update mutable fields
    await userRef.update({
      username: profile.login,
      displayName: profile.name || profile.login,
      avatarUrl: profile.avatar_url,
      email: profile.email || null,
      bio: profile.bio || null,
      company: profile.company || null,
      location: profile.location || null,
      blog: profile.blog || null,
      lastLoginAt: now,
    });

  }

  return githubUid;
}

// ──────────────────────────────────────────────────────────────
// Routes — Health & Auth
// ──────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: Date.now(),
    firebase: adminSdkInitialized ? 'connected' : 'fallback_mode'
  });
});

// 1. Initiate GitHub OAuth flow (Legacy browser redirect helper)
app.get('/auth/github', authLimiter, (req, res) => {
  const originalState = req.query.state || 'default_state';
  const targetRedirect = req.query.redirect_uri || 'https://molpopfmailbhafmchpiheblifhkloll.chromiumapp.org/';
  const customClientId = req.query.client_id || '';
  const customClientSecret = req.query.client_secret || '';

  const combinedState = `${originalState}___${encodeURIComponent(targetRedirect)}___${encodeURIComponent(customClientId)}___${encodeURIComponent(customClientSecret)}`;
  const clientId = customClientId || process.env.GITHUB_CLIENT_ID || 'Ov23liOvHUl1MK65i9LM';

  const host = req.get('host');
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;

  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    `${baseUrl}/auth/github/callback`
  )}&scope=read:user,repo&state=${encodeURIComponent(combinedState)}`;

  res.redirect(githubAuthUrl);
});

// 2. OAuth Callback Handler
app.get('/auth/github/callback', authLimiter, async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code missing.');
  }

  let targetRedirectUri = 'https://molpopfmailbhafmchpiheblifhkloll.chromiumapp.org/';
  let customClientId = '';
  let customClientSecret = '';
  if (state) {
    try {
      const parts = state.split('___');
      if (parts.length > 1) targetRedirectUri = decodeURIComponent(parts[1]);
      if (parts.length > 2) customClientId = decodeURIComponent(parts[2]);
      if (parts.length > 3) customClientSecret = decodeURIComponent(parts[3]);
    } catch (err) {
      console.error('Failed to parse state parameter:', err);
    }
  }

  const clientId = customClientId || process.env.GITHUB_CLIENT_ID || 'Ov23liOvHUl1MK65i9LM';
  const clientSecret = customClientSecret || process.env.GITHUB_CLIENT_SECRET;

  try {
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      { client_id: clientId, client_secret: clientSecret, code },
      { headers: { Accept: 'application/json' } }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      return res.status(400).send('Failed to retrieve GitHub access token.');
    }

    const userProfileResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` }
    });

    const profile = userProfileResponse.data;
    const githubUid = `github:${profile.id}`;

    await upsertUserProfile(profile);

    const sessionAccessToken = jwt.sign(
      { uid: githubUid, username: profile.login },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const sessionRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

    if (adminSdkInitialized) {
      await db.collection('refresh_tokens').doc(sessionRefreshToken).set({
        uid: githubUid,
        username: profile.login,
        expiresAt: refreshExpiresAt.toISOString(),
        createdAt: new Date().toISOString()
      });
    }

    const extensionRedirectUrl = `${targetRedirectUri}?sessionToken=${sessionAccessToken}&refreshToken=${sessionRefreshToken}&username=${profile.login}`;
    res.redirect(extensionRedirectUrl);

  } catch (error) {
    console.error('OAuth Callback Error:', error.message);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// 3. Token Exchange Endpoint (Used by extension launchWebAuthFlow)
app.post('/auth/github/exchange', authLimiter, async (req, res) => {
  const { code, clientId, clientSecret, redirectUri } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required.' });
  }

  const targetClientId = clientId || process.env.GITHUB_CLIENT_ID || 'Ov23liOvHUl1MK65i9LM';
  const targetClientSecret = clientSecret || process.env.GITHUB_CLIENT_SECRET;

  try {
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: targetClientId,
        client_secret: targetClientSecret,
        code,
        redirect_uri: redirectUri
      },
      { headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
    );

    const { access_token: gitHubToken, error, error_description } = tokenResponse.data;

    if (error) {
      return res.status(400).json({ error, error_description });
    }

    if (!gitHubToken) {
      return res.status(400).json({ error: 'No access token received from GitHub.' });
    }

    const profileResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${gitHubToken}` }
    });

    const profile = profileResponse.data;
    const githubUid = `github:${profile.id}`;

    await upsertUserProfile(profile);

    // Issue Firebase custom token if available
    let firebaseCustomToken = `mock-firebase-token-for-${profile.login}`;
    if (adminSdkInitialized) {
      firebaseCustomToken = await admin.auth().createCustomToken(githubUid, {
        username: profile.login,
        avatar: profile.avatar_url,
      });
    }

    const sessionAccessToken = jwt.sign(
      { uid: githubUid, username: profile.login },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const sessionRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

    if (adminSdkInitialized) {
      await db.collection('refresh_tokens').doc(sessionRefreshToken).set({
        uid: githubUid,
        username: profile.login,
        expiresAt: refreshExpiresAt.toISOString(),
        createdAt: new Date().toISOString()
      });
    }

    res.json({
      githubToken: gitHubToken,
      firebaseToken: firebaseCustomToken,
      accessToken: sessionAccessToken,
      refreshToken: sessionRefreshToken,
      username: profile.login
    });

  } catch (err) {
    console.error('[Exchange Error]:', err.message);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// 4. Token Refresh Endpoint
app.post('/auth/refresh', authLimiter, async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required.' });
  }

  try {
    if (adminSdkInitialized) {
      const tokenDoc = await db.collection('refresh_tokens').doc(refreshToken).get();
      if (!tokenDoc.exists) {
        return res.status(403).json({ error: 'Invalid or expired refresh token.' });
      }

      const data = tokenDoc.data();
      if (new Date(data.expiresAt) < new Date()) {
        await db.collection('refresh_tokens').doc(refreshToken).delete();
        return res.status(403).json({ error: 'Refresh token expired.' });
      }

      const sessionAccessToken = jwt.sign(
        { uid: data.uid, username: data.username },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      res.json({ accessToken: sessionAccessToken });
    } else {
      const sessionAccessToken = jwt.sign(
        { uid: 'sandbox-uid', username: 'sandbox-user' },
        JWT_SECRET,
        { expiresIn: '15m' }
      );
      res.json({ accessToken: sessionAccessToken });
    }
  } catch (err) {
    console.error('[Refresh Error]:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ──────────────────────────────────────────────────────────────
// Routes — /api/user  (Protected)
// ──────────────────────────────────────────────────────────────

// GET /api/user — Fetch the current authenticated user's Firestore profile
app.get('/api/user', apiLimiter, authenticateToken, async (req, res) => {
  try {
    if (!adminSdkInitialized) {
      return res.json({ uid: req.user.uid, username: req.user.username, _fallback: true });
    }
    const doc = await db.collection('users').doc(req.user.uid).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'User profile not found.' });
    }
    res.json({ uid: doc.id, ...doc.data() });
  } catch (err) {
    console.error('[GET /api/user]', err.message);
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// ──────────────────────────────────────────────────────────────
// Routes — /api/favorites  (Protected)
// ──────────────────────────────────────────────────────────────

// GET /api/favorites — Fetch all favorites for the authenticated user
app.get('/api/favorites', apiLimiter, authenticateToken, async (req, res) => {
  try {
    if (!adminSdkInitialized) {
      return res.json({ favorites: [], _fallback: true });
    }
    const snapshot = await db.collection('users').doc(req.user.uid)
      .collection('favorites')
      .orderBy('savedAt', 'desc')
      .get();

    const favorites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ favorites });
  } catch (err) {
    console.error('[GET /api/favorites]', err.message);
    res.status(500).json({ error: 'Failed to fetch favorites.' });
  }
});

// POST /api/favorites — Add a favorite developer
app.post('/api/favorites', apiLimiter, authenticateToken, async (req, res) => {
  const { username, login, name, avatarUrl, bio, publicRepos, followers } = req.body;
  const key = (username || login || '').toLowerCase();

  if (!key) {
    return res.status(400).json({ error: 'username is required.' });
  }

  try {
    if (!adminSdkInitialized) {
      return res.json({ success: true, _fallback: true });
    }
    const favRef = db.collection('users').doc(req.user.uid)
      .collection('favorites').doc(key);

    await favRef.set({
      login: login || username,
      name: name || login || username,
      avatarUrl: avatarUrl || null,
      bio: bio || null,
      publicRepos: publicRepos || 0,
      followers: followers || 0,
      savedAt: admin.firestore.FieldValue.serverTimestamp(),
      savedBy: req.user.uid
    });

    res.json({ success: true, id: key });
  } catch (err) {
    console.error('[POST /api/favorites]', err.message);
    res.status(500).json({ error: 'Failed to save favorite.' });
  }
});

// DELETE /api/favorites/:id — Remove a favorite
app.delete('/api/favorites/:id', apiLimiter, authenticateToken, async (req, res) => {
  const key = req.params.id.toLowerCase();

  try {
    if (!adminSdkInitialized) {
      return res.json({ success: true, _fallback: true });
    }
    await db.collection('users').doc(req.user.uid)
      .collection('favorites').doc(key).delete();

    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/favorites/:id]', err.message);
    res.status(500).json({ error: 'Failed to remove favorite.' });
  }
});

// ──────────────────────────────────────────────────────────────
// Routes — /api/history  (Protected)
// ──────────────────────────────────────────────────────────────

// GET /api/history — Get recent search history
app.get('/api/history', apiLimiter, authenticateToken, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  try {
    if (!adminSdkInitialized) {
      return res.json({ history: [], _fallback: true });
    }
    const snapshot = await db.collection('users').doc(req.user.uid)
      .collection('search_history')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ history });
  } catch (err) {
    console.error('[GET /api/history]', err.message);
    res.status(500).json({ error: 'Failed to fetch search history.' });
  }
});

// POST /api/history — Record a search
app.post('/api/history', apiLimiter, authenticateToken, async (req, res) => {
  const { searchedUsername } = req.body;

  if (!searchedUsername) {
    return res.status(400).json({ error: 'searchedUsername is required.' });
  }

  try {
    if (!adminSdkInitialized) {
      return res.json({ success: true, _fallback: true });
    }

    // Use username as doc ID to auto-deduplicate — just update timestamp
    const docId = searchedUsername.toLowerCase();
    await db.collection('users').doc(req.user.uid)
      .collection('search_history').doc(docId).set({
        searchedUsername: searchedUsername.toLowerCase(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userId: req.user.uid
      });

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/history]', err.message);
    res.status(500).json({ error: 'Failed to record search.' });
  }
});

// DELETE /api/history — Clear all search history
app.delete('/api/history', apiLimiter, authenticateToken, async (req, res) => {
  try {
    if (!adminSdkInitialized) {
      return res.json({ success: true, _fallback: true });
    }

    const snapshot = await db.collection('users').doc(req.user.uid)
      .collection('search_history').get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    res.json({ success: true, deleted: snapshot.size });
  } catch (err) {
    console.error('[DELETE /api/history]', err.message);
    res.status(500).json({ error: 'Failed to clear history.' });
  }
});

// ──────────────────────────────────────────────────────────────
// Routes — /api/settings  (Protected)
// ──────────────────────────────────────────────────────────────

// GET /api/settings — Fetch user settings
app.get('/api/settings', apiLimiter, authenticateToken, async (req, res) => {
  try {
    if (!adminSdkInitialized) {
      return res.json({ settings: null, _fallback: true });
    }
    const doc = await db.collection('users').doc(req.user.uid).get();
    if (!doc.exists) {
      return res.json({ settings: {} });
    }
    const data = doc.data();
    res.json({ settings: data.settings || {} });
  } catch (err) {
    console.error('[GET /api/settings]', err.message);
    res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

// PUT /api/settings — Update user settings (partial merge)
app.put('/api/settings', apiLimiter, authenticateToken, async (req, res) => {
  const { theme, notificationsEnabled, dashboardPreferences, aiPreferences } = req.body;

  // Build only provided fields
  const update = {};
  if (theme !== undefined) update['settings.theme'] = theme;
  if (notificationsEnabled !== undefined) update['settings.notificationsEnabled'] = notificationsEnabled;
  if (dashboardPreferences !== undefined) update['settings.dashboardPreferences'] = dashboardPreferences;
  if (aiPreferences !== undefined) update['settings.aiPreferences'] = aiPreferences;
  update['settings.updatedAt'] = admin.firestore.FieldValue.serverTimestamp();

  try {
    if (!adminSdkInitialized) {
      return res.json({ success: true, _fallback: true });
    }
    await db.collection('users').doc(req.user.uid).update(update);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /api/settings]', err.message);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

// ──────────────────────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {

});
