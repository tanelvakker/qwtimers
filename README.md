# QWTimers Local Setup Guide

Welcome! This guide walks you through running the QWTimers project locally using Node.js and npm. Pick the instructions for your operating system—macOS or Windows—and you’ll be up and running quickly.

---

## 1. Prerequisites

- **Node.js 18+** (includes npm)
- **Git** (optional, if you plan to clone the repository instead of downloading it)

### macOS

#### Install Homebrew (if you don’t have it)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Install Node.js
```bash
brew install node
```

*Verify the installation:*
```bash
node -v
npm -v
```

### Windows

#### Install Node.js
1. Visit [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
2. Download the “LTS” Windows Installer (.msi)
3. Run the installer (keep the default options, including “Install npm”).

*Verify the installation:* open **Command Prompt** or **PowerShell** and run:
```powershell
node -v
npm -v
```

---

## 2. Get the Project

If you cloned the repository already, skip to [Install Dependencies](#3-install-dependencies).

### Option A: Git Clone
```bash
git clone https://github.com/<your-account>/qwtimers.git
cd qwtimers
```

### Option B: Download ZIP
1. Click **Code → Download ZIP** on the GitHub page.
2. Extract the ZIP file.
3. Open a terminal (macOS) or Command Prompt/PowerShell (Windows) in the extracted folder.

---

## 3. Install Dependencies

From the project root, install npm packages:
```bash
npm install
```
This downloads everything required to run the proxy and frontend locally.

---

## 4. Configure Environment (optional)

No extra configuration is required for basic usage—the project is preconfigured to proxy API requests to the Qilowatt backend via `proxy.js`.

If you have environment variables or custom settings to add later, create a `.env` file and load it in `proxy.js` as needed.

---

## 5. Run the Development Server

Start the local proxy and static server:
```bash
npm run start
```
This command runs `node proxy.js`. By default, the app is available at:
```
http://localhost:8080/
```

### What this does
- Serves `index.html`, `app.js`, and other static assets.
- Proxies API calls to `https://app.qilowatt.it`, handling login, device fetching, and timers.

---

## 6. Login and Use the App

1. Open `http://localhost:8080/` in your browser.
2. Use the **Log in** button in the top right (or it will prompt automatically if no token is stored).
3. Enter your Qilowatt credentials; the proxy will store the returned session cookies for subsequent requests.
4. Select a device from the dropdown to load and edit timers.

### Remember-me
- The app stores your token in `localStorage` if “Remember me” is checked; otherwise it’s kept in the session.

### Device Selection
- Device and relay combinations fetched from `/devices` are cached in your browser cookie for 30 days.

---

## 7. Troubleshooting

| Issue | What to check |
| --- | --- |
| `npm: command not found` | Node.js/NPM isn’t installed or isn’t in your PATH. Reinstall Node.js. |
| `Error: listen EADDRINUSE 8080` | Port 8080 is in use. Either stop the other service or run `PORT=8081 npm run start` (macOS/Linux) or `set PORT=8081 && npm run start` (Windows PowerShell). |
| Unauthorized / login loop | Ensure credentials are correct and that cookies are enabled. Clear browser storage if you need to reset tokens. |
| Proxy errors | Check `proxy-debug.log` in the system temp directory for upstream response codes. |

---

## 8. Common Commands

| Purpose | macOS / Linux | Windows (PowerShell) |
| --- | --- | --- |
| Install dependencies | `npm install` | `npm install` |
| Start server | `npm run start` | `npm run start` |
| Lint (if added later) | `npm run lint` | `npm run lint` |

---

## 9. Project Structure Overview

```
qwtimers/
├── app.js        # Frontend logic: timers rendering, login flow, device selection
├── index.html    # UI markup and Bootstrap layout
├── proxy.js      # Express proxy to Qilowatt backend (login, devices, timers)
├── package.json  # npm scripts and dependencies
└── README.md     # (this file)
```

---

## 10. Next Steps

- Add automated linting/testing scripts if needed.
- Create environment-specific configuration if different backends are required.
- Package for deployment or containerize when you’re ready.

Enjoy exploring—and feel free to extend the project with additional features!
