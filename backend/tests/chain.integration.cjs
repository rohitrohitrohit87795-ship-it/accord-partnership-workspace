const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const {
  JsonRpcProvider,
  ContractFactory,
  Contract,
  Wallet,
  parseEther,
  formatUnits,
} = require('ethers');
const { createApp } = require('../src/index.cjs');
test(
  'real local blockchain creation, wallet proof, financial writes and independent audit reads',
  { timeout: 120000 },
  async () => {
    const root = path.resolve(__dirname, '..'),
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'accord-chain-test-'));
    const rpc = 'http://127.0.0.1:18545';
    process.env.RPC_URL = rpc;
    const node = spawn(
      process.execPath,
      [
        require.resolve('hardhat/internal/cli/cli.js'),
        'node',
        '--hostname',
        '127.0.0.1',
        '--port',
        '18545',
      ],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let nodeOutput = '';
    node.stdout.on('data', (x) => {
      nodeOutput += x;
    });
    node.stderr.on('data', (x) => {
      nodeOutput += x;
    });
    const provider = new JsonRpcProvider(rpc, 31337, { staticNetwork: true });
    let server, store;
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          await provider.getBlockNumber();
          ready = true;
          break;
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.ok(ready, `Local chain did not start: ${nodeOutput}`);
      const accounts = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i))),
        wallets = await Promise.all(accounts.map((x) => x.getAddress()));
      const fa = JSON.parse(
        await fs.readFile(
          path.join(root, 'artifacts/contracts/Partnership.sol/PartnershipFactory.json'),
          'utf8',
        ),
      );
      const pa = JSON.parse(
        await fs.readFile(
          path.join(root, 'artifacts/contracts/Partnership.sol/Partnership.json'),
          'utf8',
        ),
      );
      const factory = await new ContractFactory(fa.abi, fa.bytecode, accounts[0]).deploy();
      await factory.waitForDeployment();
      process.env.FACTORY_ADDRESS = await factory.getAddress();
      const result = await createApp({
        mode: 'chain',
        dataDir: dir,
        mongoUri: `mongodb://127.0.0.1:27017/accord_test_${crypto.randomBytes(12).toString('hex')}`,
      });
      store = result.store;
      server = result.app.listen(0, '127.0.0.1');
      await new Promise((r) => server.once('listening', r));
      const base = `http://127.0.0.1:${server.address().port}/api`,
        cookies = [];
      async function req(route, body, i = 0, method = body ? 'POST' : 'GET') {
        const r = await fetch(base + route, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(cookies[i] ? { Cookie: cookies[i] } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (r.headers.get('set-cookie')) cookies[i] = r.headers.get('set-cookie').split(';')[0];
        return { status: r.status, data: await r.json() };
      }
      assert.equal((await req('/auth/demo', { account: 'Alice' })).status, 404);
      for (let i = 0; i < 4; i++) {
        assert.equal(
          (
            await req(
              '/auth/register',
              {
                name: ['Alice', 'Bob', 'Charlie', 'Auditor'][i],
                email: `chain${i}@example.com`,
                password: 'test-password-strong',
              },
              i,
            )
          ).status,
          200,
        );
        const challenge = await req('/wallet/challenge', { wallet: wallets[i] }, i);
        if (i === 0)
          assert.equal(
            (
              await req(
                '/wallet/verify',
                { signature: await accounts[1].signMessage(challenge.data.message) },
                i,
              )
            ).status,
            403,
          );
        assert.equal(
          (
            await req(
              '/wallet/verify',
              { signature: await accounts[i].signMessage(challenge.data.message) },
              i,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await req(
              '/wallet/verify',
              { signature: await accounts[i].signMessage(challenge.data.message) },
              i,
            )
          ).status,
          400,
        );
      }
      await store.write((db) => {
        db.users.find((u) => u.email === 'chain3@example.com').role = 'auditor';
      });
      const personalWallet = Wallet.createRandom();
      await req(
        '/auth/register',
        {
          name: 'Personal wallet',
          email: 'personal-wallet@example.com',
          password: 'test-password-strong',
        },
        4,
      );
      const fundingChallenge = await req(
        '/wallet/challenge',
        { wallet: personalWallet.address },
        4,
      );
      await req(
        '/wallet/verify',
        { signature: await personalWallet.signMessage(fundingChallenge.data.message) },
        4,
      );
      const funded = await req('/wallet/fund', {}, 4);
      assert.equal(funded.status, 200);
      assert.equal(funded.data.balance, '25.0');
      assert.equal((await req('/wallet/fund', {}, 4)).status, 429);
      const native = await req('/wallet/portfolio', undefined, 4);
      assert.equal(native.data.address, personalWallet.address);
      assert.equal(native.data.balance, '25.0');
      assert.deepEqual(native.data.tokens, []);
      const compiled = JSON.parse(
        require('solc').compile(
          JSON.stringify({
            language: 'Solidity',
            sources: {
              'TestToken.sol': {
                content: `pragma solidity ^0.8.28;
          contract TestToken {
            string public constant name = 'Precision Token';
            string public constant symbol = 'PTK';
            uint8 public constant decimals = 6;
            mapping(address => uint256) public balanceOf;
            function mint(address to, uint256 value) external { balanceOf[to] += value; }
          }`,
              },
            },
            settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
          }),
        ),
      );
      const tokenArtifact = compiled.contracts['TestToken.sol'].TestToken;
      const token = await new ContractFactory(
        tokenArtifact.abi,
        tokenArtifact.evm.bytecode.object,
        accounts[0],
      ).deploy();
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();
      const exactAmount = 1234567890123456789012345678n;
      await (await token.mint(personalWallet.address, exactAmount)).wait();
      assert.equal((await req('/wallet/tokens', { address: wallets[0] }, 4)).status, 400);
      const imported = await req('/wallet/tokens', { address: tokenAddress }, 4);
      assert.equal(imported.status, 201);
      assert.equal(imported.data.token.balance, formatUnits(exactAmount, 6));
      assert.equal(imported.data.token.symbol, 'PTK');
      assert.equal((await req('/wallet/tokens', { address: tokenAddress }, 4)).status, 409);
      assert.deepEqual((await req('/wallet/portfolio', undefined, 1)).data.tokens, []);
      await req(`/wallet/tokens/${tokenAddress}`, undefined, 1, 'DELETE');
      assert.equal((await req('/wallet/portfolio', undefined, 4)).data.tokens.length, 1);
      await (await token.mint(personalWallet.address, 1n)).wait();
      await (
        await accounts[0].sendTransaction({ to: personalWallet.address, value: parseEther('1.5') })
      ).wait();
      const changed = await req('/wallet/portfolio?wallet=' + wallets[0], undefined, 4);
      assert.equal(changed.data.balance, '26.5');
      assert.equal(changed.data.tokens[0].balance, formatUnits(exactAmount + 1n, 6));
      // An unavailable contract must not show a misleading zero or hide the native balance.
      await provider.send('hardhat_setCode', [tokenAddress, '0x']);
      const unavailable = await req('/wallet/portfolio', undefined, 4);
      assert.equal(unavailable.data.balance, '26.5');
      assert.equal(unavailable.data.tokens[0].balance, null);
      assert.ok(unavailable.data.tokens[0].error);
      assert.equal(
        (await req(`/wallet/tokens/${tokenAddress}`, undefined, 4, 'DELETE')).status,
        200,
      );
      assert.deepEqual((await req('/wallet/portfolio', undefined, 4)).data.tokens, []);
      const input = {
        name: 'Onchain ABC',
        description: 'A real local blockchain integration test partnership.',
        category: 'Technology',
        quorum: 66,
        endsAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        partners: wallets.slice(0, 3).map((wallet, i) => ({
          name: ['Alice', 'Bob', 'Charlie'][i],
          wallet,
          expected: [5, 3, 2][i],
          ownership: [50, 30, 20][i],
        })),
      };
      const tx = await factory.createPartnership(
        input.name,
        wallets.slice(0, 3),
        [parseEther('5'), parseEther('3'), parseEther('2')],
        [5000, 3000, 2000],
        66,
        Math.floor(new Date(input.endsAt).getTime() / 1000),
      );
      const receipt = await tx.wait();
      assert.equal(
        (await req('/partnerships', { ...input, name: 'Forged metadata', hash: receipt.hash }))
          .status,
        400,
      );
      const created = await req('/partnerships', { ...input, hash: receipt.hash });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const p = created.data.partnership;
      const contracts = accounts.slice(0, 3).map((s) => new Contract(p.address, pa.abi, s));
      async function sync(tx, i = 0) {
        const r = await tx.wait();
        const result = await req(`/partnerships/${p.id}/sync`, { hash: r.hash }, i);
        assert.equal(result.status, 200, JSON.stringify(result.data));
        return result.data.partnership;
      }
      for (let i = 0; i < 3; i++) await sync(await contracts[i].approveAgreement(), i);
      let read = (await req(`/partnerships/${p.id}`)).data.partnership;
      assert.equal(read.status, 'Active');
      for (let i = 0; i < 3; i++)
        await sync(
          await contracts[i].depositContribution({ value: parseEther(['5', '3', '2'][i]) }),
          i,
        );
      await sync(
        await contracts[0].proposeExpense('Onchain expense', '', wallets[3], parseEther('1')),
      );
      await sync(await contracts[0].approveExpense(0, true));
      await sync(await contracts[1].approveExpense(0, true), 1);
      await sync(await contracts[0].executeExpense(0));
      await sync(await contracts[0].depositRevenue({ value: parseEther('2') }));
      read = await sync(await contracts[0].distributeProfit(parseEther('1')));
      assert.equal(read.distributed, '1.0');
      assert.equal(read.treasury, '10.0');
      const now = (await provider.getBlock('latest')).timestamp;
      await sync(await contracts[0].createProposal('Expansion', 'Decision', now + 86400));
      await sync(await contracts[0].vote(0, true));
      await sync(await contracts[1].vote(0, true), 1);
      await sync(await contracts[0].closeProposal(0));
      await sync(await contracts[2].requestExit(parseEther('1'), 'New role'), 2);
      await sync(await contracts[0].approveExit(0));
      await sync(await contracts[1].approveExit(0), 1);
      read = await sync(await contracts[0].settleExit(0));
      assert.equal(read.partners[2].exited, true);
      assert.equal(read.treasury, '9.0');
      const audit = await req('/audit', null, 3);
      assert.ok(audit.data.events.some((e) => e.action === 'Exit settled'));
      assert.ok(
        audit.data.events.every(
          (e) => e.status === 'Confirmed' && /^0x[0-9a-f]{64}$/i.test(e.hash),
        ),
      );
      const verified = await req('/audit/verify', { hash: audit.data.events[0].hash }, 3);
      await store.write((db) => {
        db.partnerships.find((record) => record.id === p.id).distributed = '0.0';
        db.events = [];
      });
      await result.syncChainRecords();
      assert.equal(
        (await store.connection.db.collection('partnerships').findOne({ id: p.id })).distributed,
        '1.0',
      );
      assert.ok((await store.connection.db.collection('events').countDocuments()) > 0);
      assert.equal(verified.data.verified, true);
      const creationVerified = await req('/audit/verify', { hash: receipt.hash }, 3);
      assert.equal(creationVerified.data.verified, true);
      assert.equal(
        (await req(`/partnerships/${p.id}/actions`, { action: 'revenue', amount: '1' })).status,
        404,
      );
      assert.equal((await req('/partnerships', { ...input, hash: receipt.hash })).status, 409);
    } finally {
      if (server) await new Promise((r) => server.close(r));
      if (store) {
        assert.match(store.connection.name, /^accord_test_[0-9a-f]+$/);
        await store.connection.dropDatabase();
        await store.close();
      }
      provider.destroy();
      node.kill();
      await new Promise((r) => {
        if (node.exitCode !== null) r();
        else {
          node.once('exit', r);
          setTimeout(r, 3000).unref();
        }
      });
      delete process.env.RPC_URL;
      delete process.env.FACTORY_ADDRESS;
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
