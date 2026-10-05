const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../../backend/src/index.cjs');
async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'accord-personal-ui-'));
  const { app, store } = await createApp({ mode: 'chain', dataDir: dir, mongoUri: '' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  process.env.APP_ORIGIN = url;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 950 },
      reducedMotion: 'reduce',
      timezoneId: 'Asia/Kolkata',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // October 4 locally, while UTC is still October 3.
    await page.clock.install({ time: new Date('2026-10-03T18:45:00Z') });
    await page.goto(url);
    await page.getByLabel('Full name', { exact: true }).fill('Rohit');
    assert.ok(
      !/demo|Alice|Bob|Charlie|Meridian Studio|ABC Ventures/i.test(
        await page.locator('body').innerText(),
      ),
    );
    await page.getByLabel('Email address', { exact: true }).fill('rohit-ui@example.com');
    await page.getByLabel('Password', { exact: true }).fill('My-private-password');
    await page.getByRole('button', { name: 'Create your account', exact: true }).click();
    await page.getByRole('heading', { name: 'Good to see you, Rohit.' }).waitFor();
    await page.getByRole('heading', { name: 'Make room for your next idea' }).waitFor();
    assert.equal(await page.getByLabel('Demo account').count(), 0);
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog', { name: 'Connect with MetaMask' }).waitFor();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'New partnership', exact: true }).last().click();
    await page
      .getByText('Connect your MetaMask wallet using the top-right button before continuing.')
      .waitFor();
    const endDate = page.getByLabel('Partnership end date', { exact: true });
    assert.equal(await endDate.getAttribute('min'), '2026-10-04');
    await page.getByLabel('Partnership name', { exact: true }).fill('My partnership');
    await page
      .getByLabel('Description', { exact: true })
      .fill('A partnership to verify end-date validation.');
    await endDate.fill('2026-10-03');
    assert.ok(await endDate.evaluate((input) => input.validity.rangeUnderflow));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Choose today or a later end date.', { exact: true }).waitFor();
    await endDate.fill('');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Choose today or a later end date.', { exact: true }).waitFor();
    await endDate.fill('2026-10-04');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Bring your partners together', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.clock.setSystemTime(new Date('2026-10-04T18:29:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.fastForward(61000);
    assert.equal(await endDate.getAttribute('min'), '2026-10-05');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Choose today or a later end date.', { exact: true }).waitFor();
    await endDate.fill('2026-10-05');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Bring your partners together', exact: true })
      .waitFor();
    assert.ok(
      !/demo|Alice|Bob|Charlie|Meridian Studio|ABC Ventures/i.test(
        await page.locator('body').innerText(),
      ),
    );
    await page.getByRole('button', { name: 'Help & guide', exact: true }).click();
    await page.getByRole('heading', { name: 'Build with confidence.' }).waitFor();
    assert.ok(
      !/demo|Alice|Bob|Charlie|Meridian Studio|ABC Ventures/i.test(
        await page.locator('body').innerText(),
      ),
    );
    await page.reload();
    await page.getByRole('heading', { name: 'Build with confidence.' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Rohit', exact: false }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill('rohit-ui@example.com');
    await page.getByLabel('Password', { exact: true }).fill('My-private-password');
    await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'Good to see you, Rohit.' }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'Personal-account browser checks passed: registration, clean workspace, wallet requirement, clean help, sessions, login/logout and mobile layout.',
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
