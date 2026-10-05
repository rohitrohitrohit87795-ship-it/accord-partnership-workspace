const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Wallet, getBytes, verifyMessage } = require('ethers');
const { createApp } = require('../../backend/src/index.cjs');

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'accord-connect-ui-'));
  const { app, store } = await createApp({ mode: 'chain', dataDir: dir, mongoUri: '' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    });
    const fixtureWallet = Wallet.createRandom();
    const errors = [];
    async function openPage(mode) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
      const page = await context.newPage();
      let linkedWallet = null;
      const user = () => ({
        id: 'wallet-test',
        name: 'Account',
        email: 'wallet-test@example.com',
        role: 'partner',
        wallet: linkedWallet,
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: user() } }));
      await page.route('**/api/config', (route) =>
        route.fulfill({ json: { mode: 'chain', chainId: 31337, rpcUrl: 'http://127.0.0.1:8545' } }),
      );
      await page.route('**/api/partnerships', (route) =>
        route.fulfill({ json: { partnerships: [] } }),
      );
      await page.route('**/api/audit', (route) => route.fulfill({ json: { events: [] } }));
      await page.route('**/api/wallet/portfolio', (route) =>
        route.fulfill({ json: { address: linkedWallet, balance: '25.0', tokens: [] } }),
      );
      await page.route('**/api/wallet/challenge', (route) => {
        assert.equal(
          route.request().postDataJSON().wallet.toLowerCase(),
          fixtureWallet.address.toLowerCase(),
        );
        return route.fulfill({ json: { message: 'Wallet browser test verification' } });
      });
      await page.route('**/api/wallet/verify', (route) => {
        const signature = route.request().postDataJSON().signature;
        assert.equal(
          verifyMessage('Wallet browser test verification', signature),
          fixtureWallet.address,
        );
        linkedWallet = fixtureWallet.address;
        return route.fulfill({ json: { user: user() } });
      });
      if (mode !== 'missing') {
        await page.exposeFunction('signFixtureMessage', async (data) =>
          fixtureWallet.signMessage(getBytes(data)),
        );
        await page.addInitScript(
          ({ address, mode }) => {
            let chain = '0x1',
              added = false;
            window.walletTestCalls = [];
            window.ethereum = {
              isMetaMask: true,
              on() {},
              removeListener() {},
              async request({ method, params }) {
                window.walletTestCalls.push(method);
                if (method === 'eth_chainId') return chain;
                if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
                if (method === 'wallet_switchEthereumChain') {
                  if (mode === 'cancelled') throw { code: 4001, message: 'Rejected' };
                  if (mode === 'pending') throw { code: -32002, message: 'Pending' };
                  if (!added) throw { code: 'UNKNOWN_ERROR', info: { error: { code: 4902 } } };
                  chain = params[0].chainId;
                  return null;
                }
                if (method === 'wallet_addEthereumChain') {
                  added = true;
                  return null;
                }
                if (method === 'eth_getBalance') return '0x15af1d78b58c40000';
                if (method === 'personal_sign') return window.signFixtureMessage(params[0]);
                throw new Error('Unexpected wallet method: ' + method);
              },
            };
          },
          { address: fixtureWallet.address, mode },
        );
      }
      await page.goto(url);
      await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
      return { page, context };
    }
    const missing = await openPage('missing');
    const dialog = missing.page.getByRole('dialog', { name: 'Connect with MetaMask' });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Chrome or Edge/);
    assert.equal(await missing.page.getByLabel('Website address').inputValue(), url);
    assert.equal(
      await dialog.getByRole('link', { name: 'Get MetaMask' }).getAttribute('href'),
      'https://metamask.io/download',
    );
    if (process.env.WALLET_SETUP_SCREENSHOT) {
      await fs.mkdir(path.dirname(process.env.WALLET_SETUP_SCREENSHOT), { recursive: true });
      await dialog.screenshot({ path: process.env.WALLET_SETUP_SCREENSHOT });
    }
    await missing.page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await missing.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
    await missing.page.getByRole('button', { name: 'Try connecting again' }).click();
    await dialog.waitFor();
    await missing.page.getByRole('button', { name: 'Close dialog' }).click();
    await assert.rejects(dialog.waitFor({ state: 'visible', timeout: 100 }));
    await missing.context.close();

    const connected = await openPage('connect');
    await connected.page.getByText('Wallet verified and connected.', { exact: true }).waitFor();
    const calls = await connected.page.evaluate(() => window.walletTestCalls);
    assert.equal(calls.filter((method) => method === 'eth_requestAccounts').length, 1);
    assert.equal(calls.filter((method) => method === 'wallet_addEthereumChain').length, 1);
    assert.equal(calls.filter((method) => method === 'wallet_switchEthereumChain').length, 2);
    assert.equal(calls.filter((method) => method === 'personal_sign').length, 1);
    assert.match(await connected.page.locator('.topbar-right').innerText(), /25 ETH/);
    await connected.context.close();

    for (const [mode, message] of [
      ['cancelled', 'The wallet request was cancelled. You can try again.'],
      [
        'pending',
        'A request is already open in MetaMask. Open the extension and approve or cancel it before trying again.',
      ],
    ]) {
      const result = await openPage(mode);
      await result.page.getByText(message, { exact: true }).waitFor();
      const methods = await result.page.evaluate(() => window.walletTestCalls);
      assert.ok(!methods.includes('personal_sign'));
      assert.ok(!methods.includes('wallet_addEthereumChain'));
      await result.context.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      'Wallet browser checks passed: missing-extension guidance, mobile layout, add then switch, signed verification, cancellation and pending requests.',
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
