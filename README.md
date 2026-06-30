# 🚀 DevAssist: AI-Powered GitHub Extension

![DevAssist Banner](https://via.placeholder.com/1000x300.png?text=DevAssist:+AI-Powered+GitHub+Extension)

DevAssist is a production-ready Chrome Extension that bridges the gap between your local development environment and GitHub. Built with a robust Node.js backend and powered by Google's Gemini AI, it allows developers to effortlessly analyze repositories, visualize coding statistics, and securely push local projects directly to GitHub with AI-generated documentation.

## ✨ Key Features
- **Intelligent Project Scanner**: Automatically scans local workspaces to categorize source code, dependencies, and configurations.
- **AI-Powered Code Insights**: Generates beautiful `README.md` files, architectural summaries, and code explanations using the Gemini API.
- **Secure Stateless Authentication**: Utilizes an OAuth 2.0 flow backed by a hardened Express.js proxy with JWT session management.
- **"No-Leak" Security Policy**: Actively strips local `.env` variables and prevents ignored directories from being uploaded.

## 🛠️ Technology Stack
- **Frontend**: Vanilla JavaScript, HTML5, Modern CSS, Chrome Extensions API (Manifest V3)
- **Backend API**: Node.js, Express, Firebase Admin (Firestore), Helmet.js
- **Cloud/Deployment**: Render (API Hosting), GitHub APIs

---

## 📥 How to Install & Use (Free)

Since this extension is an advanced developer tool, it is distributed directly via GitHub. You can install it into Chrome in less than a minute:

1. **Download the Extension:**
   Go to the top of this repository, click the green **Code** button, and select **Download ZIP**. Extract the folder to your computer.

2. **Open Chrome Extensions:**
   Open Google Chrome and type `chrome://extensions/` into the URL bar and hit Enter.

3. **Enable Developer Mode:**
   In the top right corner of the page, toggle the switch for **Developer mode** to ON.

4. **Load the Extension:**
   Click the **Load unpacked** button at the top left. Select the `DevAssist` folder you extracted in Step 1.

🎉 **That's it!** The DevAssist icon will now appear in your Chrome toolbar. Click it, log in with GitHub, and start analyzing!

---

*Designed and engineered by Nishant Kumar.*
