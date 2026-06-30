# Deploying DevAssist Backend Server to the Cloud

To ensure that the DevAssist extension is accessible 24/7 (even when your laptop is turned off), you need to host the backend server on a persistent cloud platform. Below are step-by-step instructions to deploy the backend to **Render** or **Railway** for free/low cost.

---

## Prerequisites
1. A [GitHub](https://github.com) account.
2. A [Render](https://render.com) or [Railway](https://railway.app) account.

---

## Step 1: Create a GitHub Repository for your Backend

1. Create a new **Private** GitHub repository (e.g., `devassist-backend`).
2. Initialize it locally and push your `backend/` directory files:
   ```bash
   cd d:\AndroidDev\chrome-extension\backend
   git init
   git add package.json package-lock.json server.js
   git commit -m "Initial commit of backend"
   git remote add origin <your-github-repo-url>
   git branch -M main
   git push -u origin main
   ```
   > [!WARNING]
   > Do **NOT** commit `service-account.json` or `.env` files to your GitHub repository. Doing so exposes your private credentials publicly.

---

## Step 2: Deploying to Render (Recommended)

1. Sign in to [Render](https://dashboard.render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your `devassist-backend` repository.
4. Configure the settings:
   - **Name**: `devassist-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Select the **Free** tier.
5. Expand the **Advanced** section to add your Environment Variables (see Step 4 below).
6. Click **Create Web Service**. Render will automatically build and deploy your app.

---

## Step 3: Deploying to Railway (Alternative)

1. Sign in to [Railway](https://railway.app/).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your `devassist-backend` repository.
4. Click **Deploy Now**.
5. Once created, click on your service, navigate to the **Variables** tab, and add your Environment Variables.
6. Railway will automatically expose a domain. You can configure a custom reference domain under the **Settings** tab.

---

## Step 4: Configure Environment Variables in the Cloud Dashboard

Add the following environment variables in your Render/Railway dashboard settings:

| Variable Name | Description / Value |
| :--- | :--- |
| `PORT` | `3000` (Render/Railway will automatically bind the correct port if left blank, but setting it explicitly is safe) |
| `GITHUB_CLIENT_ID` | Your GitHub OAuth App Client ID (e.g. `Ov23li...`) |
| `GITHUB_CLIENT_SECRET` | Your GitHub OAuth App Client Secret |
| `FIREBASE_SERVICE_ACCOUNT` | The **entire contents** of your local `service-account.json` file copied and pasted as a single stringified JSON. |

---

## Step 5: Update your Extension Settings

Once the service is active, it will give you a public URL (e.g., `https://devassist-backend.onrender.com`).

1. Open your Chrome extension popup.
2. In the **Advanced Settings** accordion on the Welcome screen (or the Settings panel inside the dashboard):
   - Update **Backend Server URL** to your new public URL (e.g., `https://devassist-backend.onrender.com`).
   - Click **Save Settings**.
3. The Setup Checklist status should now display **Running ✓** pointing to your live cloud server!
