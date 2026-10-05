# Set up Accord on another PC

This guide installs a **fresh workspace** from GitHub. The repository contains application source, contracts, tests, and configuration examples. Your current accounts, MongoDB records, wallet history, session keys, and blockchain backups are not uploaded. A new PC starts with no registered users and no partnerships.

The commands below are for Windows PowerShell. Run project commands from the folder containing the root `package.json`.

## 1. Install the required software

| Software | What it does | Installation |
| --- | --- | --- |
| Node.js 24 LTS, including npm | Runs the backend and builds the frontend | [Official Node.js download](https://nodejs.org/en/download). This project requires Node.js 22.12 or newer; Node.js 24 LTS is the recommended version. |
| Git | Downloads and updates the GitHub code | [Official Git downloads](https://git-scm.com/downloads/). Use Git for Windows and its normal installer defaults. |
| MongoDB Community Server | Stores your newly created accounts and partnership records | [Official Windows installation guide](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-windows/). Use the MSI installer and select **Install MongoDB as a Service**, with service name **MongoDB**. |
| MongoDB Compass | Lets you view the database | [Official Compass download](https://www.mongodb.com/try/download/compass). Compass is optional for running the website; the MongoDB server is required. |
| Chrome or Edge with MetaMask | Connects your wallet and signs blockchain actions | Install/enable [MetaMask from its official website](https://metamask.io/download) in the browser profile you will use. |

You do not need Ganache, a global Hardhat installation, a global React installation, or a separate global Solidity compiler. The project's npm dependencies supply the blockchain and compiler.

After installing Node.js and Git, close and reopen PowerShell, then check:

```powershell
node --version
npm.cmd --version
git --version
Get-Service -Name MongoDB
```

MongoDB should show `Running`. If it is stopped, open PowerShell as Administrator and run:

```powershell
Start-Service -Name MongoDB
```

Keep the MongoDB service configured to start automatically. Installing Compass alone does not start a database server.

## 2. Download the repository

Use this repository's HTTPS clone URL:

```powershell
cd $env:USERPROFILE\Documents
git clone https://github.com/rohitrohitrohit87795-ship-it/accord-partnership-workspace.git partnership-workspace
cd partnership-workspace
```

The new folder can have any name and can be on any drive. No source-code change is needed for a different Windows username or installation directory. For a private repository, sign in to the authorized GitHub account when Git requests authentication.

Downloading the repository ZIP is also possible. Extract the complete project into one folder, then open PowerShell in that folder. A ZIP copy does not support `git pull`; use Git clone if you want updates.

## 3. Create this PC's backend configuration

The real `.env` file is intentionally excluded from GitHub. Make a local copy of the example:

```powershell
Copy-Item -LiteralPath .\backend\.env.example -Destination .\backend\.env
```

This is a first-install command. If `.env` already exists, keep it rather than overwriting your settings during an update.

The normal local configuration is:

```dotenv
PORT=4000
HOST=127.0.0.1
APP_MODE=chain
JWT_SECRET=
MONGODB_URI=mongodb://127.0.0.1:27017/accord
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
FACTORY_ADDRESS=
```

On a new PC using the default MongoDB installation, **you do not need to change these values**:

- Leave `FACTORY_ADDRESS` blank. The launcher deploys a new factory and records its address automatically.
- Leave `JWT_SECRET` blank for local use. The app generates a new random session signing key in `backend/data/session.key` and keeps it between starts. If you supply a custom secret, generate a new one for this installation.
- Leave `MONGODB_URI` at the local address above. The database is created automatically. You do not have to create its collections manually.
- Leave `RPC_URL`, `CHAIN_ID`, and `HOST` as shown. The launcher prepares the local blockchain and wallet RPC.
- Do not copy the old PC's `.env`, `backend/data`, or MongoDB database for this fresh setup.

`127.0.0.1` means **this PC**. MongoDB and the blockchain must run on the same PC as this local installation. This setup is not a shared cloud database or a hosted public website.

## 4. Install dependencies and build

From the project root:

```powershell
npm.cmd ci
npm.cmd run compile
npm.cmd run build
npm.cmd start
```

Wait for each command to finish successfully before running the next one. `npm ci` installs the exact dependency versions from `package-lock.json` for both frontend and backend. It needs internet access the first time.

On first launch, the app:

1. Connects to MongoDB and creates an empty application workspace.
2. Starts the local Ethereum blockchain.
3. Deploys the partnership factory.
4. Creates the local blockchain journal and the session signing key.
5. Serves the built frontend and API on port 4000.

When you see `Accord is ready at http://127.0.0.1:4000`, open:

**[http://127.0.0.1:4000](http://127.0.0.1:4000)**

Keep the PowerShell window open while using the website. Press **Ctrl+C** to stop the app. On Windows, `npm.cmd` also avoids the common PowerShell execution-policy error affecting `npm.ps1`.

The Windows `start.bat` is an alternative launcher. It installs missing dependencies and builds/compiles missing outputs. For the first installation, the explicit commands above make each setup step easier to verify.

## 5. Create your account and connect your wallet

1. Open the website in **Chrome or Edge with MetaMask enabled**. A browser without a wallet extension shows setup instructions.
2. Click **Create account** and choose your name, email, and password.
3. Open and unlock MetaMask. Select the wallet account you want to link to this website account.
4. Click **Connect wallet** on the website.
5. Approve the request to add/select **Accord Local Test Network**.
6. Sign the wallet-verification message. This proves that you control the wallet.
7. If the wallet needs local test funds, click **Test ETH**. The app adds 25 test ETH when eligible; requests have a one-hour cooldown and are available when the wallet balance is below 25 ETH.

If you need to enter the network manually in MetaMask, use:

| Setting | Value |
| --- | --- |
| Network name | Accord Local Test Network |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |
| Block explorer | Leave blank |

Each application account is linked to one wallet. Other partners create their own accounts and verify their own wallets. They see a partnership when their linked wallet matches a partner address in that agreement. If two people use the same browser, sign out of the website, select the other MetaMask account, and sign in with that person's website account.

Local test ETH is only for this local project. You do not need to buy ETH to use it.

## 6. Create an auditor account

1. Register a **separate normal account** on the website for the auditor.
2. Stop the app with **Ctrl+C** in its running PowerShell window.
3. From the project root, run the command below, replacing the email with the auditor's registered email:

```powershell
npm.cmd run auditor -- auditor@example.com
npm.cmd start
```

4. Sign in to the auditor account. The **Auditor console** appears.

Auditors can inspect all partnerships, review audit history, verify blockchain receipts, and export records. They have read-only access to partnership actions through the website. Registration does not let anyone choose a privileged role directly.

## 7. View your new database in Compass

Open Compass, add a connection, and use:

```text
mongodb://127.0.0.1:27017/accord
```

After the app has started, open the `accord` database and refresh the collection list. It contains:

- `workspaces`: the authoritative application document containing accounts, sessions, partnership snapshots, and audit records.
- `users`, `sessions`, `partnerships`, `events`: read-only views that make those record types easier to browse.

Use the website to change application records. Financial actions are signed through MetaMask and recorded on the blockchain; editing a database value does not change a smart contract's state.

## 8. Run the app next time

You do not reinstall everything each day:

1. Make sure the MongoDB service is running.
2. Open the project folder.
3. Double-click `start.bat`, or run:

```powershell
npm.cmd start
```

The launcher reconnects to the local chain or restores the saved blockchain journal after a restart. Accounts remain in this PC's MongoDB database. For future use on this PC, keep its new `backend/data` directory and MongoDB database.

## 9. Pull future code updates

Stop the app first, then run:

```powershell
git pull --ff-only
npm.cmd ci
npm.cmd run compile
npm.cmd run build
npm.cmd start
```

Keep your existing `.env` during updates. Rebuilding is necessary because `npm start` serves `frontend/dist`; it does not rebuild changed frontend source automatically. If Git reports local edits or divergent history, resolve those changes before retrying the pull. Do not delete your local data to fix a code-update error.

## 10. Run checks

With MongoDB running:

```powershell
npm.cmd run test:all
```

This checks accounts, MongoDB persistence, blockchain backup/replay, Solidity contracts, blockchain/API integration, and the frontend build. Test databases are separate from the normal `accord` database.

Optional browser checks:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:browser
npm.cmd run test:live-browser
npm.cmd run test:wallet --workspace frontend
```

The wallet browser tests simulate wallet prompts in an isolated browser; they do not sign transactions using your real MetaMask wallet. If you prefer the installed Chrome executable instead of downloading a test browser:

```powershell
$env:BROWSER_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:wallet --workspace frontend
```

## 11. Develop the frontend and backend separately

The project structure is:

```text
partnership-workspace/
  frontend/       React UI, styles, browser tests, Vite configuration
  backend/        Express API, MongoDB, contracts, launcher, backend tests
  package.json    Shared npm workspace commands
  package-lock.json
  start.bat
  README.md
  SETUP.md
```

For frontend changes, start the normal app first in one PowerShell window:

```powershell
npm.cmd start
```

In a second PowerShell window, from the same project root:

```powershell
npm.cmd run dev --workspace frontend
```

Open `http://127.0.0.1:5173` for the development UI. It forwards `/api` requests to the backend on port 4000. The first window keeps the wallet RPC and its blockchain backups running.

For backend changes, edit the backend source and restart the normal launcher with Ctrl+C and `npm.cmd start`. This keeps the normal startup and backup behavior. Do not run another API on port 4000 while the launcher is already using it.

## 12. Change settings only when needed

| Situation | What to change |
| --- | --- |
| Different username or project folder | Nothing in the source. Open PowerShell in the new project root. |
| MongoDB uses another local port | Change `MONGODB_URI` in `backend/.env` to that port. |
| An existing local database already uses `accord` for another purpose | Choose a fresh name, for example `mongodb://127.0.0.1:27017/accord_fresh`, in `backend/.env`. |
| The website must use another port | Change `PORT`, for example to `4001`. Open the matching website URL. If using the Vite development UI, update its proxy target in `frontend/vite.config.mjs`. |
| The wallet RPC port must change | Change `RPC_URL`, for example to `http://127.0.0.1:8546`, and update that network's RPC URL in MetaMask. Restart the app. |
| The internal blockchain port conflicts | Set `LOCAL_CHAIN_PORT` in `backend/.env` to a free local port. The normal default is `18547` when the wallet RPC is `8545`. |
| You need a separate local blockchain-data directory | Set `DATA_DIR` in `backend/.env`. A relative path is resolved from `backend/`. Use a fresh directory with a fresh database for an independent workspace. |

Keep `CHAIN_ID=31337` for this launcher. Do not replace it with Ethereum mainnet or another public chain's ID. Public hosting and sharing one live blockchain across several PCs require a different deployment setup; cloning onto two PCs creates two independent local installations.

## 13. Troubleshooting

| Problem | What to check |
| --- | --- |
| `node` or `npm` is not recognized | Reopen PowerShell after installing Node.js. Check that the installer added Node.js to PATH. |
| PowerShell refuses to run `npm.ps1` | Use `npm.cmd` and `npx.cmd` as shown in this guide. |
| `npm ci` fails | Check internet access and Node.js version. Run it from the project root with the committed lockfile. Do not copy `node_modules` from another PC. |
| MongoDB connection refused or timed out | Check `Get-Service MongoDB`, start the service, and verify `MONGODB_URI`. Compass alone is not the database server. |
| The app says to compile contracts | Run `npm.cmd run compile` from the project root, then start again. |
| The frontend is missing or still shows old changes | Run `npm.cmd run build`; then refresh the browser. |
| Connect wallet shows setup instructions | Open the website in Chrome or Edge in the profile with MetaMask installed and enabled. Unlock the extension. |
| A MetaMask request is already pending | Open MetaMask and approve or cancel the earlier request, then try Connect wallet again. |
| Wrong linked wallet | Select the wallet address linked to that website account, then reconnect. Use a separate website account for a different person's wallet. |
| Local network cannot connect | Keep `npm.cmd start` running and check the network RPC URL and chain ID. |
| Port already in use | Stop a duplicate app instance, or choose a free port using the settings above. Do not start a separate Hardhat node on wallet port 8545. |
| Blockchain backup does not match this node | Keep the backup. Stop unrelated local chain processes and restart through `npm.cmd start`. Do not delete the journal to bypass the message. |
| Fresh setup shows old users | You connected to an existing MongoDB database or copied old `backend/data`. For an independent setup, choose a new database name and start with a fresh data directory. |
| Test ETH is unavailable | Confirm the local network is selected. Funding is subject to the balance threshold and one-hour cooldown. |

Backend logs are stored under `backend/data` when the launcher starts its blockchain. The running terminal shows API startup errors. You can check the live service in another PowerShell window:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/health'
```

The normal result reports `ok: true`, `mode: chain`, `storage: mongodb`, and your database name.

## 14. What GitHub contains

GitHub contains the reusable source code and this setup guide. `.gitignore` excludes:

- `.env` and other real environment configuration files.
- `backend/data`, blockchain journals, logs, session keys, and recovery backups.
- `node_modules`, frontend build output, Solidity artifacts/cache, and test outputs.

Keep `backend/.env.example` in GitHub as the configuration template. The repository does not transfer your MetaMask wallet, MongoDB database, accounts, or balances. A normal fresh installation recreates the generated folders itself.
