const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { JsonRpcProvider, parseEther } = require('ethers');
const { ChainJournal, createRpcGateway } = require('../src/chain-journal.cjs');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test(
  'wallet responses persist transactions and replay preserves blocks, balances and nonces',
  { timeout: 60000 },
  async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accord-chain-journal-'));
    const port = await freePort();
    const upstream = `http://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      [
        require.resolve('hardhat/internal/cli/cli.js'),
        'node',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        windowsHide: true,
        env: { ...process.env, CHAIN_INITIAL_DATE: '2026-10-04T09:55:00.000Z' },
        stdio: 'ignore',
      },
    );
    const provider = new JsonRpcProvider(upstream, 31337, {
      staticNetwork: true,
      cacheTimeout: -1,
    });
    let gateway, walletProvider;
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          await provider.send('eth_chainId', []);
          ready = true;
          break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, 'Isolated blockchain started');
      const journal = new ChainJournal(dataDir);
      await journal.capture(provider);
      gateway = createRpcGateway(upstream, provider, journal);
      await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
      walletProvider = new JsonRpcProvider(`http://127.0.0.1:${gateway.address().port}`, 31337, {
        staticNetwork: true,
        cacheTimeout: -1,
      });
      const signer = await walletProvider.getSigner(0),
        recipient = await (await provider.getSigner(1)).getAddress();
      for (const type of [2, 0, 1]) {
        const tx = await signer.sendTransaction({ to: recipient, value: parseEther('2'), type });
        const saved = JSON.parse(fs.readFileSync(journal.file, 'utf8'));
        assert.ok(saved.blocks.at(-1).transactions.length, 'Saved before RPC success response');
        assert.equal((await tx.wait()).status, 1);
      }
      await provider.send('evm_setAutomine', [false]);
      const internalSigner = await provider.getSigner(0);
      await internalSigner.sendTransaction({ to: recipient, value: 1n, nonce: 3 });
      await internalSigner.sendTransaction({ to: recipient, value: 2n, nonce: 4 });
      await provider.send('evm_mine', []);
      await provider.send('evm_mine', []);
      await provider.send('evm_setAutomine', [true]);
      await journal.capture(provider);
      assert.equal(journal.data.blocks.at(-2).transactions.length, 2);
      assert.equal(journal.data.blocks.at(-1).transactions.length, 0);
      const hashes = journal.data.blocks.map((b) => b.hash);
      const balance = await provider.getBalance(recipient);
      const nonce = await provider.getTransactionCount(await signer.getAddress());
      await provider.send('hardhat_reset', []);
      const reopened = new ChainJournal(dataDir);
      await reopened.restore(provider);
      await reopened.capture(provider);
      assert.deepEqual(
        reopened.data.blocks.map((b) => b.hash),
        hashes,
      );
      assert.equal(await provider.getBalance(recipient), balance);
      assert.equal(await provider.getTransactionCount(await signer.getAddress()), nonce);
      const contents = fs.readFileSync(journal.file, 'utf8');
      await provider.send('hardhat_reset', []);
      await provider.send('evm_mine', []);
      await assert.rejects(reopened.restore(provider), /does not match/);
      await assert.rejects(reopened.capture(provider), /differs/);
      assert.equal(fs.readFileSync(journal.file, 'utf8'), contents, 'Mismatch preserves backup');
    } finally {
      walletProvider?.destroy();
      provider.destroy();
      if (gateway) {
        gateway.closeAllConnections();
        await new Promise((resolve) => gateway.close(resolve));
      }
      child.kill();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  },
);
