# Accord — Partnership Workspace

Create your own account, connect your own wallet, and manage your own partnerships. Every financial and governance action is signed on the local Ethereum blockchain.

## Start the app

For a fresh installation on another PC, follow **[SETUP.md](SETUP.md)**. It covers required software, configuration, MongoDB, MetaMask, auditor accounts, updates, and troubleshooting. Existing data is not included in the repository.

After completing the initial setup, double-click start.bat or run this command from the project root:

```powershell
npm start
```

Open http://127.0.0.1:4000. The launcher starts the local blockchain if needed, restores saved blockchain history, and deploys the partnership factory only for a new workspace. Your existing accounts and partnerships remain available.

MongoDB must be running before starting the app. On this laptop it runs as the MongoDB Windows service. Compass is the viewer used to browse that server.

## Open your data in MongoDB Compass

Connect with:

```text
mongodb://127.0.0.1:27017/accord
```

Open the **accord** database. It contains **workspaces**, the persisted application document, and separate **users**, **sessions**, **partnerships**, and **events** views. These read-only views let you browse each type of record easily in Compass. Use the website to change application data.

Existing accounts, sessions, wallet links, and partnership records are imported automatically from the saved JSON workspace on the first MongoDB startup. A dated backup is made before importing. An existing MongoDB workspace is never overwritten by an old JSON file.

Partnership snapshots and confirmed audit records are also saved in MongoDB and updated as the app reads the chain. The blockchain remains the source for payments, signatures, votes, and settlements.

## Your first partnership

1. Choose Create account and enter your name, email, and password.
2. Install MetaMask and click Connect wallet.
3. Approve adding/switching to the local network, then sign the wallet-verification message. The network is chain 31337 at http://127.0.0.1:8545.
4. If your wallet needs funds, click Test ETH in the top bar. It provides 25 ETH on this local test network, with a one-hour cooldown.
5. Create a partnership with your own name, description, partner names, wallet addresses, capital commitments, ownership shares, duration, and quorum.
6. Every partner registers separately and connects their own wallet. A partnership becomes visible to a partner once their verified wallet matches a listed partner address.
7. Every partner signs the agreement to activate it.
8. Fund contributions, propose/approve/execute expenses, deposit revenue, preview and distribute profits, vote on proposals, and request/settle exits.
9. Use Audit explorer to inspect confirmed transactions and export records.

A wallet is linked to one application account. When another partner uses the same browser, sign out, sign in to their account, select the matching MetaMask wallet, and reconnect. There is no account impersonation or quick account switching.

## Included modules

- Sign up, sign in, one-day protected sessions, sign out.
- Dashboard, name/address search, Active/Proposed filters, treasury and dividend totals.
- My wallet: exact personal ETH balance, full wallet address, and balances for previously tracked ERC-20 tokens. Removing a token only removes it from your list.
- Automatic updates every 3 seconds in visible tabs, with an immediate refresh when returning to the tab. Partnership changes, audit history and wallet balances update without reloading the page or clearing forms. If the service is unavailable, the app retains the last data and retries automatically.
- Validated creation with 2–20 unique partners and exactly 100% ownership.
- Agreement, signatures, and activation.
- Capital vault and contribution history.
- Multi-signature expense approvals and execution.
- Revenue deposits and ownership-based profit splits.
- Weighted governance with voting snapshots and deadlines.
- Partner exits, approval, buyout settlement, and normalized remaining ownership.
- Blockchain audit, transaction details, CSV export.
- Auditor console, receipt verification, and reporting.
- Responsive help and management screens.

## Financial and governance rules

All monetary calculations use integer wei. Profit available for distribution is:

```text
max(total revenue − executed expenses − prior distributions − settled buyouts, 0)
```

Capital-funded spending must be recouped by later revenue before it becomes profit. Distributions are also bounded by treasury balance.

Every partner must sign for activation. Expenses need ceil(current partner count × quorum / 100) approvals. Governance uses snapshot ownership weights. Exit approval excludes the exiting partner and uses the remaining partner count. The final partner receives payout rounding remainders; the last remaining partner cannot exit.

The operating period closes funding, expenses, revenue, and new votes after the end date. Exit settlements and proposal closure remain available. Governance records business decisions; it does not execute arbitrary contract calls or change membership automatically.

## Configuration and storage

The backend configuration is in **backend/.env**. Use backend/.env.example as the template when setting up another copy:

| Variable           | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| APP_MODE           | chain; only blockchain transactions are supported                                 |
| PORT / HOST        | 4000 / 127.0.0.1                                                                  |
| RPC_URL / CHAIN_ID | http://127.0.0.1:8545 / 31337                                                     |
| FACTORY_ADDRESS    | Optional override for the factory saved in backend/data/chain.json                |
| MONGODB_URI        | MongoDB connection string; defaults to mongodb://127.0.0.1:27017/accord           |
| DATA_DIR           | Optional alternative local data directory                                         |
| JWT_SECRET         | Optional secret; a random persistent local secret is created if omitted           |
| APP_ORIGIN         | Additional allowed browser origin                                                 |
| COOKIE_SECURE      | Set false only when intentionally using plain local HTTP with NODE_ENV=production |

The app stores its data in MongoDB. If MongoDB is unavailable, startup fails with a connection error instead of silently switching to JSON. The local JSON mode is used only by isolated tests. The storage is intended for a single API process. Backend/data holds migration backups, the persistent session signing key, factory deployment details, and local logs.

The first startup after upgrading removes only the previously built-in accounts and the partnerships they created. A backup is saved before cleanup. Personally registered accounts and their records are preserved.

## Local blockchain lifecycle

Start with **npm start** or **start.bat**. The launcher saves the local chain to **backend/data/blockchain-journal.json** and restores it automatically after a laptop or blockchain restart. The wallet RPC on port 8545 saves mined transactions before returning a successful response. A previous copy is kept alongside the journal. Accounts and application metadata stay in MongoDB; the journal preserves contract transactions, balances, signatures, approvals and blockchain history.

Keep **backend/data** and your MongoDB database when moving or backing up the project. Do not delete the journal or run a separate fresh node on port 8545. The launcher protects the saved history if an unrelated chain is running. If you use a development API, keep the npm-start launcher and its wallet RPC running while developing the frontend.

Local test ETH has no monetary value. The test funding endpoint is restricted to the loopback RPC on chain 31337. It does not send funds on a public network.

For development, run **npm run dev** from the project root to start both folders. You can also start them separately:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

The development website is http://127.0.0.1:5173. Keep the local blockchain running; npm start prepares it for you. Commands for chain, compile, and deploy are available from the project root and are forwarded to the backend.

## Auditor account

Register a normal account first, stop the API, then run:

```powershell
npm run auditor -- your-auditor-email@example.com
```

Restart the app and sign in. Registration cannot request privileged roles. Auditors have read-only partnership access.

## Verification

```powershell
npm run test:all
```

This runs account/authorization tests, cleanup preservation tests, MongoDB migration and restart tests, ten smart-contract tests, a local-blockchain integration test backed by an isolated MongoDB database, and the production frontend build. MongoDB must be running. Test databases have unique accord*test* names and are removed afterward.

For browser checks:

```powershell
npx playwright install chromium
npm run test:browser
```

The browser test starts an isolated application with a temporary database. It tests personal registration, an empty workspace, wallet requirements, sign in/out, session restoration, and mobile layout. It does not create accounts in your workspace. To use installed Chrome or Edge, set BROWSER_EXECUTABLE to its executable path.

## Source layout

```text
projectt/
├── frontend/
│   ├── src/                 React screens, styles, wallet actions
│   ├── public/              Browser assets
│   ├── tests/               Browser checks
│   ├── dist/                Built website
│   ├── index.html
│   ├── vite.config.mjs
│   └── package.json
├── backend/
│   ├── src/                 API, authentication, MongoDB, blockchain reads
│   ├── contracts/           Solidity partnership and factory
│   ├── scripts/             Local launcher, deployment, auditor setup
│   ├── tests/               API, MongoDB, blockchain, and contract tests
│   ├── artifacts/           Compiled contracts
│   ├── data/                Keys, deployment details, logs, migration backups
│   ├── .env                 Server configuration
│   ├── .env.example
│   ├── hardhat.config.cjs
│   └── package.json
├── package.json             Commands for both npm workspaces
├── package-lock.json
├── node_modules/            Shared dependencies managed by npm
├── start.bat
└── README.md
```

Frontend and backend each have their own package.json. Dependencies are installed once from the project root with npm install. Backend credentials stay in backend/.env and are not shipped in the browser bundle.

This project uses the local/test blockchain described in the supplied specification. Public-network deployment and real-money use require a separate contract audit and deployment review.
