const { Contract, formatEther, formatUnits } = require('ethers');
const E = require('./engine.cjs');

const abi = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
];

function walletRoutes(app, auth, chain, config, store) {
  const tracked = (user) => (user.tokens || []).filter((t) => t.chainId === config.chainId);
  async function readToken(address, wallet, blockTag) {
    const token = new Contract(address, abi, chain.provider);
    const [name, symbol, decimals, amount] = await Promise.all([
      token.name({ blockTag }),
      token.symbol({ blockTag }),
      token.decimals({ blockTag }),
      token.balanceOf(wallet, { blockTag }),
    ]);
    // Ethers supports formatting up to 80 decimal places; never convert balances to Number.
    if (Number(decimals) > 80 || !symbol.trim()) throw new Error('Unsupported token metadata.');
    return {
      address,
      name: name.slice(0, 120),
      symbol: symbol.slice(0, 40),
      decimals: Number(decimals),
      balance: formatUnits(amount, decimals),
    };
  }
  app.get('/api/wallet/portfolio', auth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user.wallet)
      return res.json({ address: null, chainId: config.chainId, balance: null, tokens: [] });
    const blockNumber = await chain.provider.getBlockNumber();
    const [amount, tokens] = await Promise.all([
      chain.provider.getBalance(req.user.wallet, blockNumber),
      Promise.all(
        tracked(req.user).map(async ({ address }) => {
          try {
            return await readToken(address, req.user.wallet, blockNumber);
          } catch {
            return { address, balance: null, error: 'Token balance unavailable.' };
          }
        }),
      ),
    ]);
    res.json({
      address: req.user.wallet,
      chainId: config.chainId,
      balance: formatEther(amount),
      tokens,
      blockNumber,
      updatedAt: new Date().toISOString(),
    });
  });
  app.post('/api/wallet/tokens', auth, async (req, res) => {
    if (!req.user.wallet) E.fail('Connect and verify your wallet first.', 403);
    const address = E.address(req.body.address);
    let token;
    try {
      const block = await chain.provider.getBlockNumber();
      if ((await chain.provider.getCode(address, block)) === '0x') throw new Error();
      token = await readToken(address, req.user.wallet, block);
    } catch {
      E.fail('Cannot read this ERC-20 token. Check the contract address and local network.');
    }
    await store.write((db) => {
      const u = db.users.find((x) => x.id === req.user.id);
      if (tracked(u).some((t) => E.same(t.address, address)))
        E.fail('This token is already in your wallet list.', 409);
      if (tracked(u).length >= 20) E.fail('You can track up to 20 tokens on this network.');
      (u.tokens ||= []).push({ address, chainId: config.chainId });
    });
    res.status(201).json({ token });
  });
  app.delete('/api/wallet/tokens/:address', auth, async (req, res) => {
    const address = E.address(req.params.address);
    await store.write((db) => {
      const u = db.users.find((x) => x.id === req.user.id);
      u.tokens = (u.tokens || []).filter(
        (t) => t.chainId !== config.chainId || !E.same(t.address, address),
      );
    });
    res.json({ ok: true });
  });
}
module.exports = { walletRoutes };
