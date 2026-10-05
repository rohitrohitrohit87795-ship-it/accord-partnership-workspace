import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureWalletNetwork, walletErrorCode } from '../src/wallet-network.mjs';
const config = { chainId: 31337, rpcUrl: 'http://127.0.0.1:8545' };

test('an already selected network needs no switch request', async () => {
  const calls = [];
  await ensureWalletNetwork(
    {
      request: async ({ method }) => {
        calls.push(method);
        return '0x7a69';
      },
    },
    config,
  );
  assert.deepEqual(calls, ['eth_chainId']);
});

test('switches an existing local network and verifies the selected chain', async () => {
  let chain = '0x1';
  await ensureWalletNetwork(
    {
      request: async ({ method, params }) => {
        if (method === 'eth_chainId') return chain;
        assert.equal(method, 'wallet_switchEthereumChain');
        chain = params[0].chainId;
      },
    },
    config,
  );
  assert.equal(chain, '0x7a69');
});

test('nested unknown-network errors add the chain and explicitly switch when adding does not select it', async () => {
  let chain = '0x1',
    added = false,
    switches = 0;
  await ensureWalletNetwork(
    {
      request: async ({ method, params }) => {
        if (method === 'eth_chainId') return chain;
        if (method === 'wallet_switchEthereumChain') {
          switches++;
          if (!added) throw { code: 'UNKNOWN_ERROR', info: { error: { code: 4902 } } };
          chain = params[0].chainId;
        } else {
          assert.equal(method, 'wallet_addEthereumChain');
          assert.equal(params[0].chainId, '0x7a69');
          assert.deepEqual(params[0].rpcUrls, [config.rpcUrl]);
          added = true;
        }
      },
    },
    config,
  );
  assert.equal(switches, 2);
  assert.equal(chain, '0x7a69');
});

test('does not ask to switch again if adding selected the chain', async () => {
  let chain = '0x1',
    switches = 0;
  await ensureWalletNetwork(
    {
      request: async ({ method, params }) => {
        if (method === 'eth_chainId') return chain;
        if (method === 'wallet_switchEthereumChain') {
          switches++;
          throw { code: 4902 };
        }
        chain = params[0].chainId;
      },
    },
    config,
  );
  assert.equal(switches, 1);
});

for (const code of [4001, -32002]) {
  test(`preserves wallet error ${code} instead of misreporting it as a wrong network`, async () => {
    const original = { code };
    await assert.rejects(
      ensureWalletNetwork(
        {
          request: async ({ method }) => {
            if (method === 'eth_chainId') return '0x1';
            throw original;
          },
        },
        config,
      ),
      (error) => error === original,
    );
  });
}

test('stops rather than recursing if the wallet never selects the requested chain', async () => {
  let switches = 0;
  await assert.rejects(
    ensureWalletNetwork(
      {
        request: async ({ method }) => {
          if (method === 'eth_chainId') return '0x1';
          switches++;
        },
      },
      config,
    ),
    /did not switch/,
  );
  assert.equal(switches, 1);
});

test('unwraps numeric codes from wallet and ethers errors', () => {
  assert.equal(
    Number(walletErrorCode({ error: { data: { originalError: { code: '4902' } } } })),
    4902,
  );
  assert.equal(walletErrorCode({ code: 'ACTION_REJECTED', info: { error: { code: 4001 } } }), 4001);
});
