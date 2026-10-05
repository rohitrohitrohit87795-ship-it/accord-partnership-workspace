const settings = require('../src/config.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { JsonRpcProvider, ContractFactory } = require('ethers');
const { createApp } = require('../src/index.cjs');
const { ChainJournal, createRpcGateway } = require('../src/chain-journal.cjs');
const root = settings.backendRoot;
async function main() {
  const { app, store, config, syncChainRecords } = await createApp();
  const dataDir = config.dataDir;
  fs.mkdirSync(dataDir, { recursive: true });
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const rpc = new URL(rpcUrl),
    chainId = Number(process.env.CHAIN_ID || 31337);
  if (!['127.0.0.1', 'localhost'].includes(rpc.hostname) || chainId !== 31337)
    throw new Error(
      'This launcher supports the local network on chain 31337. For other networks, configure and run the API separately.',
    );
  const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true, cacheTimeout: -1 });
  const journal = new ChainJournal(dataDir);
  let backupProvider = provider;
  let gateway;
  try {
    let connected = false;
    try {
      connected = Number(BigInt(await provider.send('eth_chainId', []))) === chainId;
    } catch {}
    if (!connected) {
      const internalPort = Number(process.env.LOCAL_CHAIN_PORT || Number(rpc.port || 8545) + 10002);
      const upstream = `http://127.0.0.1:${internalPort}`;
      backupProvider = new JsonRpcProvider(upstream, chainId, {
        staticNetwork: true,
        cacheTimeout: -1,
      });
      let internalConnected = false;
      try {
        internalConnected =
          Number(BigInt(await backupProvider.send('eth_chainId', []))) === chainId;
      } catch {}
      if (!internalConnected) {
        const child = spawn(
          process.execPath,
          [
            require.resolve('hardhat/internal/cli/cli.js'),
            'node',
            '--hostname',
            '127.0.0.1',
            '--port',
            String(internalPort),
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              ...(journal.data ? { CHAIN_INITIAL_DATE: journal.data.initialDate } : {}),
            },
            detached: true,
            windowsHide: true,
            stdio: [
              'ignore',
              fs.openSync(path.join(dataDir, 'blockchain.log'), 'a'),
              fs.openSync(path.join(dataDir, 'blockchain-error.log'), 'a'),
            ],
          },
        );
        fs.writeFileSync(path.join(dataDir, 'blockchain.pid'), String(child.pid));
        child.unref();
      }
      for (let i = 0; i < 60; i++) {
        try {
          connected = Number(BigInt(await backupProvider.send('eth_chainId', []))) === chainId;
          if (connected) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!connected)
        throw new Error('The local blockchain could not start. See data/blockchain-error.log.');
      await journal.restore(backupProvider);
      if (journal.data)
        console.log('Restored the local blockchain from its saved transaction history.');
      gateway = createRpcGateway(upstream, backupProvider, journal);
      await new Promise((resolve, reject) => {
        gateway.once('error', reject);
        gateway.listen(Number(rpc.port || 8545), '127.0.0.1', resolve);
      });
    } else {
      await journal.restore(provider);
    }
    let deployment;
    const deploymentPath = path.join(dataDir, 'chain.json');
    try {
      deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    } catch {}
    const factoryAddress = process.env.FACTORY_ADDRESS || deployment?.factoryAddress;
    if (!factoryAddress || (await provider.getCode(factoryAddress)) === '0x') {
      if (store.db.partnerships.some((p) => p.mode === 'chain'))
        throw new Error(
          'The local chain was reset while partnership records remain. Restore the chain or archive the old workspace before starting a fresh chain.',
        );
      const artifact = JSON.parse(
        fs.readFileSync(
          path.join(root, 'artifacts/contracts/Partnership.sol/PartnershipFactory.json'),
          'utf8',
        ),
      );
      const factory = await new ContractFactory(
        artifact.abi,
        artifact.bytecode,
        await provider.getSigner(0),
      ).deploy();
      await factory.waitForDeployment();
      fs.writeFileSync(
        deploymentPath,
        JSON.stringify({ factoryAddress: await factory.getAddress(), chainId }, null, 2),
      );
      console.log('Local partnership contracts are ready.');
    }
    await journal.capture(backupProvider);
  } catch (error) {
    gateway?.close();
    if (backupProvider !== provider) backupProvider.destroy();
    await store.close();
    throw error;
  }
  const backupTimer = setInterval(
    () =>
      journal
        .capture(backupProvider)
        .catch((error) => console.error('Blockchain backup failed:', error.message)),
    1000,
  );
  backupTimer.unref();
  const port = Number(process.env.PORT || 4000),
    host = process.env.HOST || '127.0.0.1';
  await syncChainRecords();
  const server = app.listen(port, host, () => {
    fs.writeFileSync(path.join(dataDir, 'server.pid'), String(process.pid));
    console.log(
      `Accord is ready at http://${host}:${port}. Storage: MongoDB database ${store.connection?.name || 'local test storage'}.`,
    );
  });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(backupTimer);
    try {
      await journal.capture(backupProvider);
    } catch (error) {
      console.error('Final blockchain backup failed:', error.message);
    }
    server.close();
    gateway?.close();
    await store.close();
    backupProvider.destroy();
    if (backupProvider !== provider) provider.destroy();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
