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

## 📥 Distribution Status

**Status: Closed Beta / Pre-Release**

To ensure code integrity and provide the best user experience, DevAssist is currently being minified and packaged for an official release on the Google Chrome Web Store. 

*Public installation instructions will be provided upon official Web Store approval.*
---

*Designed and engineered by Nishant Kumar.*
