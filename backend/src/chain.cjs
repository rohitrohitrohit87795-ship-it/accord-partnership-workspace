const fs = require('node:fs');
const path = require('node:path');
const { JsonRpcProvider, Contract, Interface, formatEther } = require('ethers');
const { fail, same } = require('./engine.cjs');
function createChain(root, config) {
  const artifact = (name) => {
    try {
      return JSON.parse(
        fs.readFileSync(
          path.join(root, 'artifacts/contracts/Partnership.sol', name + '.json'),
          'utf8',
        ),
      );
    } catch {
      fail('Compile contracts with npm run compile before starting blockchain mode.', 503);
    }
  };
  // Never serve a pre-transaction balance from ethers' short-lived RPC cache.
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId, {
    staticNetwork: true,
    cacheTimeout: -1,
  });
  function factoryAddress() {
    if (process.env.FACTORY_ADDRESS) return process.env.FACTORY_ADDRESS;
    try {
      return JSON.parse(fs.readFileSync(path.join(config.dataDir, 'chain.json'), 'utf8'))
        .factoryAddress;
    } catch {
      return null;
    }
  }
  const get = (address) => new Contract(address, artifact('Partnership').abi, provider);
  async function receipt(hash) {
    if (!/^0x[0-9a-f]{64}$/i.test(hash || '')) fail('A valid transaction hash is required.');
    const r = await provider.getTransactionReceipt(hash);
    if (!r || r.status !== 1) fail('Transaction is not confirmed successfully.');
    return r;
  }
  async function verifyCreation(hash, user, draft) {
    const factory = factoryAddress();
    if (!factory) fail('Deploy the partnership factory first.', 503);
    const r = await receipt(hash);
    if (!same(r.from, user.wallet) || !same(r.to, factory))
      fail('Transaction does not belong to this wallet or factory.', 403);
    const iface = new Interface(artifact('PartnershipFactory').abi);
    const event = r.logs
      .filter((l) => same(l.address, factory))
      .map((l) => {
        try {
          return iface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l) => l?.name === 'PartnershipCreated');
    if (!event || !same(event.args.creator, user.wallet))
      fail('No matching partnership creation event.');
    const c = get(event.args.partnership);
    const [name, count, q, end] = await Promise.all([
      c.name(),
      c.partnerCount(),
      c.quorum(),
      c.endsAt(),
    ]);
    if (
      name !== draft.name ||
      Number(count) !== draft.partners.length ||
      Number(q) !== draft.quorum ||
      Number(end) !== Math.floor(new Date(draft.endsAt).getTime() / 1000)
    )
      fail('Metadata does not match the deployed contract.');
    for (let i = 0; i < draft.partners.length; i++) {
      const cp = await c.partners(i),
        p = draft.partners[i];
      if (
        !same(cp.wallet, p.wallet) ||
        formatEther(cp.expected) !== p.expected ||
        Number(cp.weight) !== p.weight
      )
        fail('Partner metadata does not match the contract.');
    }
    return {
      address: event.args.partnership,
      creationBlock: r.blockNumber,
      creationHash: hash,
      creatorWallet: user.wallet,
    };
  }
  async function read(p) {
    const c = get(p.address);
    const [active, balance, revenue, spent, distributed, settledTotal, profitReserve, ne, ng, nx] =
      await Promise.all([
        c.active(),
        provider.getBalance(p.address),
        c.revenue(),
        c.spent(),
        c.distributed(),
        c.settledTotal(),
        c.profitReserve(),
        c.expenseCount(),
        c.proposalCount(),
        c.exitCount(),
      ]);
    const members = await Promise.all(
      p.partners.map(async (meta, i) => {
        const x = await c.partners(i);
        return { ...meta, deposited: formatEther(x.deposited), signed: x.signed, exited: x.exited };
      }),
    );
    const expenses = await Promise.all(
      Array.from({ length: Number(ne) }, async (_, id) => {
        const e = await c.expenses(id);
        const v = await Promise.all(members.map((x) => c.expenseVotes(id, x.wallet)));
        return {
          id,
          title: e.title,
          description: e.description,
          recipient: e.recipient,
          amount: formatEther(e.amount),
          creator: e.creator,
          executed: e.executed,
          cancelled: e.cancelled,
          approvals: members.filter((_, i) => v[i] === 1n).map((x) => x.wallet),
          rejections: members.filter((_, i) => v[i] === 2n).map((x) => x.wallet),
        };
      }),
    );
    const proposals = await Promise.all(
      Array.from({ length: Number(ng) }, async (_, id) => {
        const g = await c.proposals(id),
          v = await Promise.all(members.map((x) => c.votes(id, x.wallet)));
        return {
          id,
          title: g.title,
          description: g.description,
          creator: g.creator,
          deadline: new Date(Number(g.deadline) * 1000).toISOString(),
          forWeight: Number(g.forWeight),
          againstWeight: Number(g.againstWeight),
          totalWeight: Number(g.totalWeight),
          threshold: Number(g.threshold),
          closed: g.closed,
          passed: g.passed,
          votes: Object.fromEntries(members.map((x, i) => [x.wallet.toLowerCase(), Number(v[i])])),
        };
      }),
    );
    const exits = await Promise.all(
      Array.from({ length: Number(nx) }, async (_, id) => {
        const e = await c.exits(id),
          v = await Promise.all(members.map((x) => c.exitApprovals(id, x.wallet)));
        return {
          id,
          partner: e.partner,
          amount: formatEther(e.amount),
          reason: e.reason,
          settled: e.settled,
          approvals: members.filter((_, i) => v[i]).map((x) => x.wallet),
        };
      }),
    );
    return {
      ...p,
      status: active ? 'Active' : 'Proposed',
      partners: members,
      treasury: formatEther(balance),
      revenue: formatEther(revenue),
      spent: formatEther(spent),
      distributed: formatEther(distributed),
      settledTotal: formatEther(settledTotal),
      profitReserve: formatEther(profitReserve),
      expenses,
      proposals,
      exits,
    };
  }
  async function events(p, users) {
    const c = get(p.address),
      logs = await c.queryFilter(c.filters.Activity(), p.creationBlock, 'latest');
    const blocks = new Map();
    const rows = [];
    if (p.creationHash) {
      const block = await provider.getBlock(p.creationBlock);
      blocks.set(p.creationBlock, block);
      rows.push({
        id: `${p.creationHash}:creation`,
        partnershipId: p.id,
        partnershipName: p.name,
        actor: p.creatorWallet,
        actorName: users.find((u) => same(u.wallet, p.creatorWallet))?.name || 'Creator',
        action: 'Partnership created',
        amount: '0.0',
        itemId: null,
        timestamp: new Date(block.timestamp * 1000).toISOString(),
        hash: p.creationHash,
        blockNumber: p.creationBlock,
        status: 'Confirmed',
        mode: 'chain',
      });
    }
    for (const log of logs) {
      if (!blocks.has(log.blockNumber))
        blocks.set(log.blockNumber, await provider.getBlock(log.blockNumber));
      rows.push({
        id: `${log.transactionHash}:${log.index}`,
        partnershipId: p.id,
        partnershipName: p.name,
        actor: log.args.actor,
        actorName: users.find((u) => same(u.wallet, log.args.actor))?.name || 'Partner',
        action: log.args.action,
        amount: formatEther(log.args.amount),
        itemId: Number(log.args.itemId),
        timestamp: new Date(blocks.get(log.blockNumber).timestamp * 1000).toISOString(),
        hash: log.transactionHash,
        blockNumber: log.blockNumber,
        status: 'Confirmed',
        mode: 'chain',
      });
    }
    return rows;
  }
  return { provider, artifact, factoryAddress, receipt, verifyCreation, read, events };
}
module.exports = { createChain };
