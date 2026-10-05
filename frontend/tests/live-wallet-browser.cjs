const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../../backend/src/index.cjs');
const E = require('../../backend/src/engine.cjs');

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'accord-live-ui-'));
  const { app, store } = await createApp({ mode: 'chain', dataDir: dir, mongoUri: '' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  process.env.APP_ORIGIN = url;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    });
    const user = {
      id: 'fixture-user',
      name: 'Rohit',
      role: 'partner',
      email: 'live-ui@example.com',
      wallet: '0x1111111111111111111111111111111111111111',
    };
    const partnership = {
      ...E.normalize(
        {
          name: 'Live partnership',
          description: 'Browser fixture for automatic partnership updates.',
          quorum: 60,
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          partners: [
            { name: 'Rohit', wallet: user.wallet, ownership: 50, expected: '2' },
            {
              name: 'Second partner',
              wallet: '0x2222222222222222222222222222222222222222',
              ownership: 50,
              expected: '2',
            },
          ],
        },
        user,
      ),
      address: '0x3333333333333333333333333333333333333333',
      mode: 'chain',
    };
    let portfolio = {
      address: user.wallet,
      chainId: 31337,
      balance: '25.0',
      tokens: [
        {
          address: '0x4444444444444444444444444444444444444444',
          name: 'Precision Token',
          symbol: 'PTK',
          decimals: 6,
          balance: '12345678901234567890.123456',
        },
      ],
    };
    let workspaceFails = false;
    let polls = 0;
    const errors = [],
      pages = [];
    // Only browser responses are fixtures. No account or partnership is added to the running app.
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user } }));
      await page.route('**/api/partnerships', (route) => {
        polls++;
        return route.fulfill(
          workspaceFails
            ? { status: 503, json: { error: 'Temporarily unavailable.' } }
            : { json: { partnerships: [partnership] } },
        );
      });
      await page.route('**/api/audit', (route) => route.fulfill({ json: { events: [] } }));
      await page.route('**/api/wallet/portfolio', (route) => route.fulfill({ json: portfolio }));
      await page.goto(`${url}/#/partnership/${partnership.id}`);
      await page.getByText('0 of 2 partners have signed.', { exact: true }).waitFor();
      pages.push(page);
    }
    const originalDocuments = await Promise.all(
      pages.map((page) =>
        page.evaluate(() => {
          window.documentIdentity = Math.random();
          return window.documentIdentity;
        }),
      ),
    );
    partnership.partners[1].signed = true;
    partnership.treasury = '1.25';
    for (const page of pages) {
      await page
        .getByText('1 of 2 partners have signed.', { exact: true })
        .waitFor({ timeout: 10000 });
      assert.match(await page.locator('.detail-treasury').innerText(), /1.25/);
    }
    const page = pages[0];
    await page.getByRole('button', { name: 'My wallet', exact: true }).click();
    await page.getByRole('heading', { name: 'My wallet', exact: true }).waitFor();
    assert.equal(await page.getByTestId('native-balance').innerText(), '25 ETH');
    await page
      .locator('.asset-amount')
      .filter({ hasText: '12,345,678,901,234,567,890.123456' })
      .waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Add a token', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Token contract address').count(), 0);
    const dashboard = pages[1];
    await dashboard.getByRole('button', { name: 'Partnerships', exact: false }).first().click();
    await dashboard.getByLabel('Search partnerships').fill('Live');
    portfolio = {
      ...portfolio,
      balance: '26.500000000000000001',
      tokens: [{ ...portfolio.tokens[0], balance: '0.000001' }],
    };
    await page
      .getByTestId('native-balance')
      .filter({ hasText: '26.500000000000000001' })
      .waitFor({ timeout: 10000 });
    await page.locator('.asset-amount').filter({ hasText: '0.000001' }).waitFor();
    assert.equal(await dashboard.getByLabel('Search partnerships').inputValue(), 'Live');
    workspaceFails = true;
    await page.getByText('Updates paused', { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await dashboard.getByLabel('Search partnerships').inputValue(), 'Live');
    workspaceFails = false;
    await page.getByText('Live updates', { exact: true }).waitFor({ timeout: 10000 });
    for (let i = 0; i < pages.length; i++) {
      assert.equal(await pages[i].evaluate(() => window.documentIdentity), originalDocuments[i]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    assert.ok(polls >= 6);
    console.log(
      'Live wallet browser checks passed: two-session updates without reloading, exact ETH/token balances, preserved input, outage recovery and mobile layout.',
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.APP_ORIGIN;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
