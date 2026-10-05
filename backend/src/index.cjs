const settings = require('./config.cjs');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { verifyMessage, parseEther, formatEther } = require('ethers');
const { Store } = require('./store.cjs');
const E = require('./engine.cjs');
const { createChain } = require('./chain.cjs');
const { walletRoutes } = require('./wallet.cjs');
const root = settings.backendRoot;
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  wallet: u.wallet,
});
async function createApp(options = {}) {
  const config = {
    mode: options.mode || process.env.APP_MODE || 'chain',
    dataDir: options.dataDir || settings.dataDir,
    rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
    chainId: Number(process.env.CHAIN_ID || 31337),
  };
  if (config.mode !== 'chain')
    throw new Error('Only blockchain mode is supported. Set APP_MODE=chain in .env.');
  const store = await new Store(config.dataDir, options.mongoUri ?? settings.mongoUri).init();
  let secret = process.env.JWT_SECRET;
  if (!secret) {
    const file = path.join(config.dataDir, 'session.key');
    try {
      secret = await fs.readFile(file, 'utf8');
    } catch {
      secret = crypto.randomBytes(48).toString('hex');
      await fs.writeFile(file, secret, { mode: 0o600 });
    }
  }
  const legacyAccounts = new Set(store.db.users.filter((u) => u.isDemo).map((u) => u.id));
  if (legacyAccounts.size) {
    await fs.writeFile(
      path.join(config.dataDir, `workspace-before-cleanup-${Date.now()}.json`),
      JSON.stringify(store.db, null, 2),
    );
    await store.write((db) => {
      const legacyPartnerships = new Set(
        db.partnerships.filter((p) => legacyAccounts.has(p.creatorId)).map((p) => p.id),
      );
      db.users = db.users.filter((u) => !legacyAccounts.has(u.id));
      db.sessions = db.sessions.filter((s) => !legacyAccounts.has(s.userId));
      db.partnerships = db.partnerships.filter((p) => !legacyPartnerships.has(p.id));
      db.events = db.events.filter((e) => !legacyPartnerships.has(e.partnershipId));
    });
  }
  const chain = createChain(root, config);
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", config.rpcUrl],
          fontSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin')) {
      const allowed = [
        process.env.APP_ORIGIN,
        'http://127.0.0.1:5173',
        'http://localhost:5173',
        `http://127.0.0.1:${process.env.PORT || 4000}`,
        `http://localhost:${process.env.PORT || 4000}`,
      ].filter(Boolean);
      if (!allowed.includes(req.get('origin')))
        return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    next();
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again later.' },
  });
  const cookieToken = (req) =>
    (req.get('cookie') || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('accord_session='))
      ?.slice(15);
  function auth(req, res, next) {
    try {
      const token = jwt.verify(cookieToken(req), secret, { algorithms: ['HS256'] });
      const session = store.db.sessions.find(
        (x) => x.id === token.jti && x.userId === token.sub && x.expiresAt > Date.now(),
      );
      if (!session) throw new Error();
      const user = store.db.users.find((x) => x.id === token.sub);
      if (!user) throw new Error();
      req.user = user;
      req.sessionId = session.id;
      next();
    } catch {
      res.status(401).json({ error: 'Sign in to continue.' });
    }
  }
  async function session(res, user) {
    const id = crypto.randomUUID(),
      expiresAt = Date.now() + 86400000;
    await store.write((db) => {
      db.sessions = db.sessions.filter((x) => x.expiresAt > Date.now());
      db.sessions.push({ id, userId: user.id, expiresAt });
    });
    const token = jwt.sign({}, secret, {
      algorithm: 'HS256',
      subject: user.id,
      jwtid: id,
      expiresIn: '1d',
    });
    res.cookie('accord_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
      maxAge: 86400000,
    });
    res.json({ user: publicUser(user) });
  }
  const canRead = (p, user) =>
    user.role === 'auditor' ||
    p.partners.some((x) => E.same(x.wallet, user.wallet)) ||
    p.creatorId === user.id;
  function find(id, user) {
    const p = store.db.partnerships.find((x) => x.id === id && x.mode === config.mode);
    if (!p || !canRead(p, user)) E.fail('Partnership not found.', 404);
    return p;
  }
  function financialUser(user) {
    if (user.role === 'auditor') E.fail('Auditors have read-only access.', 403);
    if (config.mode === 'chain' && !user.wallet)
      E.fail('Connect and verify your wallet first.', 403);
  }
  async function readPartnerships(ps) {
    const block = await chain.provider.getBlockNumber();
    const snapshots = await Promise.all(ps.map((p) => chain.read(p)));
    if (store.Model && snapshots.length)
      await store.write((db) => {
        for (const snapshot of snapshots) {
          const index = db.partnerships.findIndex((p) => p.id === snapshot.id);
          if (index >= 0 && (db.partnerships[index].syncedBlock ?? -1) <= block)
            db.partnerships[index] = { ...snapshot, syncedBlock: block };
        }
      });
    return snapshots;
  }
  async function saveEvents(events) {
    if (store.Model && events.length)
      await store.write((db) => {
        const saved = new Map(db.events.map((event) => [event.id, event]));
        for (const event of events) saved.set(event.id, event);
        db.events = [...saved.values()];
      });
  }
  async function syncChainRecords() {
    if (!store.Model) return;
    const ps = store.db.partnerships.filter((p) => p.mode === 'chain');
    if (!ps.length) return;
    await readPartnerships(ps);
    await saveEvents((await Promise.all(ps.map((p) => chain.events(p, store.db.users)))).flat());
  }
  app.get('/api/health', (_, res) =>
    res.json({
      ok: true,
      mode: config.mode,
      storage: store.Model ? 'mongodb' : 'local',
      database: store.connection?.name || null,
    }),
  );
  app.get('/api/config', (_, res) =>
    res.json({
      mode: config.mode,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      factoryAddress: chain?.factoryAddress() || null,
    }),
  );
  app.post('/api/auth/register', loginLimiter, async (req, res) => {
    const name = E.text(req.body.name, 'Name', 2, 80),
      email = E.text(req.body.email, 'Email', 3, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) E.fail('Enter a valid email address.');
    const password = req.body.password;
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      Buffer.byteLength(password, 'utf8') > 72
    )
      E.fail('Password must contain at least 8 characters and at most 72 UTF-8 bytes.');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await store.write((db) => {
      if (db.users.some((x) => x.email === email)) E.fail('This email is already registered.', 409);
      const wallet = null;
      if (wallet && db.users.some((u) => E.same(u.wallet, wallet)))
        E.fail('This wallet is linked to another account.', 409);
      const u = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash,
        role: 'partner',
        wallet,
      };
      db.users.push(u);
      return u;
    });
    await session(res, user);
  });
  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const user = store.db.users.find((x) => x.email === String(req.body.email).toLowerCase());
    if (
      !user?.passwordHash ||
      typeof req.body.password !== 'string' ||
      !(await bcrypt.compare(req.body.password, user.passwordHash))
    )
      E.fail('Email or password is incorrect.', 401);
    await session(res, user);
  });
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/logout', auth, async (req, res) => {
    await store.write((db) => {
      db.sessions = db.sessions.filter((x) => x.id !== req.sessionId);
    });
    res.clearCookie('accord_session');
    res.json({ ok: true });
  });
  app.post('/api/wallet/challenge', auth, async (req, res) => {
    if (!chain) E.fail('Wallet verification is available in blockchain mode.');
    const wallet = E.address(req.body.wallet),
      nonce = crypto.randomBytes(24).toString('hex');
    const message = `Accord wallet verification\nUser: ${req.user.id}\nWallet: ${wallet}\nChain: ${config.chainId}\nNonce: ${nonce}`;
    await store.write((db) => {
      const u = db.users.find((x) => x.id === req.user.id);
      u.challenge = { wallet, message, expires: Date.now() + 300000 };
    });
    res.json({ message });
  });
  app.post('/api/wallet/verify', auth, async (req, res) => {
    const user = await store.write((db) => {
      const u = db.users.find((x) => x.id === req.user.id),
        c = u.challenge;
      if (!c || c.expires < Date.now()) E.fail('Wallet verification has expired.');
      let signer;
      try {
        signer = verifyMessage(c.message, req.body.signature);
      } catch {
        E.fail('Invalid wallet signature.');
      }
      if (!E.same(signer, c.wallet)) E.fail('Wallet signature does not match.', 403);
      if (db.users.some((x) => x.id !== u.id && E.same(x.wallet, signer)))
        E.fail('This wallet is linked to another account.', 409);
      if (u.wallet && !E.same(u.wallet, signer))
        E.fail('This account is already linked to a different wallet.', 409);
      u.wallet = signer;
      delete u.challenge;
      return u;
    });
    res.json({ user: publicUser(user) });
  });
  const fundingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    message: { error: 'Try requesting test ETH later.' },
  });
  app.post('/api/wallet/fund', auth, fundingLimiter, async (req, res) => {
    if (!req.user.wallet) E.fail('Connect and verify your wallet first.', 403);
    const rpc = new URL(config.rpcUrl);
    if (
      !['localhost', '127.0.0.1'].includes(rpc.hostname) ||
      config.chainId !== 31337 ||
      Number(BigInt(await chain.provider.send('eth_chainId', []))) !== 31337
    )
      E.fail('Test ETH is available only on the local network.', 403);
    const result = await store.write(async (db) => {
      const u = db.users.find((x) => x.id === req.user.id);
      if (u.lastTestFunding && Date.now() - u.lastTestFunding < 3600000)
        E.fail('You can request test ETH once per hour.', 429);
      if ((await chain.provider.getBalance(u.wallet)) >= parseEther('25'))
        E.fail('Your wallet already has enough test ETH.');
      const sender = await chain.provider.getSigner(0);
      const tx = await sender.sendTransaction({ to: u.wallet, value: parseEther('25') });
      await tx.wait();
      u.lastTestFunding = Date.now();
      return { hash: tx.hash, balance: formatEther(await chain.provider.getBalance(u.wallet)) };
    });
    res.json(result);
  });
  walletRoutes(app, auth, chain, config, store);
  app.get('/api/partnerships', auth, async (req, res) => {
    const ps = store.db.partnerships.filter((p) => p.mode === config.mode && canRead(p, req.user));
    res.json({ partnerships: ps.length ? await readPartnerships(ps) : [] });
  });
  app.get('/api/partnerships/:id', auth, async (req, res) => {
    const p = find(req.params.id, req.user);
    res.json({ partnership: (await readPartnerships([p]))[0] });
  });
  app.post('/api/partnerships', auth, async (req, res) => {
    financialUser(req.user);
    const p = E.normalize(req.body, req.user);
    p.mode = config.mode;
    p.address = null;
    if (chain) Object.assign(p, await chain.verifyCreation(req.body.hash, req.user, p));
    await store.write((db) => {
      if (p.address && db.partnerships.some((x) => E.same(x.address, p.address)))
        E.fail('This contract is already registered.', 409);
      db.partnerships.push(p);
    });
    res.status(201).json({ partnership: p });
  });
  app.get('/api/chain/artifacts', auth, (_, res) => {
    if (!chain) E.fail('Blockchain mode is disabled.');
    res.json({
      partnership: chain.artifact('Partnership').abi,
      factory: chain.artifact('PartnershipFactory').abi,
    });
  });
  app.post('/api/partnerships/:id/sync', auth, async (req, res) => {
    if (!chain) E.fail('Blockchain mode is disabled.');
    const p = find(req.params.id, req.user);
    const r = await chain.receipt(req.body.hash);
    if (!E.same(r.to, p.address) || !E.same(r.from, req.user.wallet))
      E.fail('Transaction does not match the contract and your verified wallet.', 403);
    res.json({ partnership: (await readPartnerships([p]))[0] });
  });
  app.get('/api/audit', auth, async (req, res) => {
    const ps = store.db.partnerships.filter((p) => p.mode === config.mode && canRead(p, req.user));
    const ids = new Set(ps.map((x) => x.id));
    const events = chain
      ? (await Promise.all(ps.map((p) => chain.events(p, store.db.users)))).flat()
      : store.db.events.filter((x) => ids.has(x.partnershipId));
    await saveEvents(events);
    res.json({
      events: events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
      partnerships: ps.map((x) => ({ id: x.id, name: x.name })),
    });
  });
  app.post('/api/audit/verify', auth, async (req, res) => {
    if (req.user.role !== 'auditor') E.fail('Auditor access required.', 403);
    const r = await chain.receipt(req.body.hash);
    const known = store.db.partnerships.some(
      (p) =>
        p.mode === 'chain' &&
        (E.same(p.address, r.to) || p.creationHash?.toLowerCase() === r.hash.toLowerCase()),
    );
    res.json({
      verified: known,
      blockNumber: r.blockNumber,
      message: known
        ? 'Confirmed transaction belongs to a registered partnership.'
        : 'Transaction confirmed, but is not a registered partnership transaction.',
    });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use(express.static(path.join(settings.frontendRoot, 'dist')));
  app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api/'))
      return res.status(404).json({ error: 'API route not found.' });
    res.sendFile(path.join(settings.frontendRoot, 'dist/index.html'));
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status >= 500) console.error(error.message);
    res.status(status).json({
      error:
        status >= 500
          ? 'The service could not complete this request. Check the server and local blockchain connection.'
          : error.message,
    });
  });
  return { app, store, config, syncChainRecords };
}
if (require.main === module)
  createApp()
    .then(({ app }) => {
      const port = Number(process.env.PORT || 4000),
        host = process.env.HOST || '127.0.0.1';
      app.listen(port, host, () =>
        console.log(
          `Accord is ready at http://${host}:${port} (${process.env.APP_MODE || 'chain'} mode)`,
        ),
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
module.exports = { createApp };
