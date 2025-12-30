# Deployment Guide

This guide will help you deploy your WhatsApp Bot for **free** using [Render](https://render.com).

## ⚠️ Important Limitations
Since this is a WhatsApp bot, it needs to save your login session (`auth_info_baileys` folder).
*   **On Free Hosting services like Render (Free Tier)**: The file system is "ephemeral". This means every time the bot restarts (or you deploy a new version), **you will need to scan the QR code again**, because the `auth_info_baileys` folder will be deleted.
*   **Solution**: To avoid this, you would need a paid service with "Persistent Disk" or a Database to store the session. But for a free start, re-scanning is the tradeoff.

## Option 1: Deploy on Render (Recommended)

1.  **Push your code to GitHub**:
    *   Create a repository on GitHub.
    *   Push this project code to the repository.

2.  **Create a Web Service on Render**:
    *   Go to [dashboard.render.com](https://dashboard.render.com) and create a new account.
    *   Click **New +** -> **Web Service**.
    *   Connect your GitHub repository.

3.  **Configure the Service**:
    *   **Name**: `my-whatsapp-bot` (or anything you like)
    *   **Region**: Closest to you (e.g., Singapore, Frankfurt)
    *   **Branch**: `main` (or `master`)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install && npm run build`
        *   *Note: This installs dependencies and compiles the TypeScript code.*
    *   **Start Command**: `npm start`
        *   *Note: This runs the compiled `dist/index.js`.*
    *   **Instance Type**: `Free`

4.  **Environment Variables**:
    *   Scroll down to "Environment Variables" and add these:
        *   `GEMINI_API_KEY`: `AIzaSyDGeJZ_XZS2Fk80ryx2tcPT3Tm23UsufUg` (or your actual key)
        *   `PREFIX`: `!` (Optional)
        *   `OWNER_NUMBER`: Your phone number (Optional)

5.  **Deploy**:
    *   Click **Create Web Service**.
    *   Render will start building. Watch the "Logs" tab.
    *   **Check Logs for QR Code**: Since `qrcode-terminal` prints to the console, you should see the QR code in the Render Logs window.
    *   **Scan Quickly**: You might need to refresh the logs or watch closely to catch the QR code.

## Option 2: Deploy on Glitch (Easier file persistence)
Glitch keeps your files, so you won't need to re-scan as often.

1.  Go to [glitch.com](https://glitch.com).
2.  Click **New Project** -> **Import from GitHub**.
3.  Enter your GitHub repo URL.
4.  Glitch automatically runs `npm install` and `npm start`.
5.  Check the **Logs** button at the bottom to see the QR Code and scan it.
6.  **Keep it alive**: Glitch sleeps after 5 minutes. You can use a service like [UptimeRobot](https://uptimerobot.com) to ping your Glitch project URL (e.g., `https://your-project.glitch.me`) every 5 minutes to keep it awake.

## Troubleshooting
*   **Bot disconnects**: Free tiers put apps to sleep. Using UptimeRobot to ping your bot's URL (which we enabled in the code) helps prevent this.
