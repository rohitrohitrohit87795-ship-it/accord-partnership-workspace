const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/index.cjs');
const E = require('../src/engine.cjs');

test('local calendar end dates allow today and the API rejects past or invalid deadlines', async () => {
  const { localDate, endOfDay } = await import('../../frontend/src/dates.mjs');
  const previousTimezone = process.env.TZ;
  const previousNow = Date.now;
  process.env.TZ = 'Asia/Kolkata';
  Date.now = () => new Date('2026-10-03T18:45:00Z').getTime();
  try {
    const user = { id: 'date-test', wallet: '0x1111111111111111111111111111111111111111' };
    const input = {
      name: 'Calendar test',
      description: 'Verify local calendar date validation.',
      quorum: 66,
      partners: [
        { name: 'Partner One', wallet: user.wallet, expected: '1', ownership: 50 },
        {
          name: 'Partner Two',
          wallet: '0x2222222222222222222222222222222222222222',
          expected: '1',
          ownership: 50,
        },
      ],
    };
    assert.equal(localDate(new Date(Date.now())), '2026-10-04');
    const today = endOfDay('2026-10-04').toISOString();
    assert.equal(today, '2026-10-04T18:29:59.000Z');
    assert.equal(E.normalize({ ...input, endsAt: today }, user).endsAt, today);
    assert.throws(
      () => E.normalize({ ...input, endsAt: endOfDay('2026-10-03').toISOString() }, user),
      /Choose a future end date/,
    );
    assert.throws(
      () => E.normalize({ ...input, endsAt: 'invalid-date' }, user),
      /Choose a future end date/,
    );
    assert.equal(endOfDay('2026-02-30'), null);
    assert.equal(endOfDay(''), null);
  } finally {
    Date.now = previousNow;
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
test('personal registration, empty workspace, authorization, login/logout and removal of legacy endpoints', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'accord-account-test-'));
  const { app, store } = await createApp({ mode: 'chain', dataDir: dir, mongoUri: '' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  let cookie = '';
  async function req(route, body) {
    const response = await fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  }
  try {
    assert.equal(store.db.users.length, 0);
    assert.equal(store.db.partnerships.length, 0);
    assert.equal((await req('/auth/demo', { account: 'Alice' })).status, 404);
    assert.equal((await req('/demo/load', {})).status, 404);
    assert.equal((await req('/partnerships')).status, 401);
    assert.equal((await req('/wallet/portfolio')).status, 401);
    const registered = await req('/auth/register', {
      name: 'Rohit',
      email: 'rohit@example.com',
      password: 'My-private-password',
      role: 'auditor',
    });
    assert.equal(registered.status, 200);
    assert.equal(registered.data.user.role, 'partner');
    assert.equal(registered.data.user.wallet, null);
    assert.equal((await req('/wallet/portfolio')).data.address, null);
    assert.deepEqual((await req('/wallet/portfolio')).data.tokens, []);
    assert.equal((await req('/wallet/tokens', { address: '0xinvalid' })).status, 403);
    assert.deepEqual((await req('/partnerships')).data.partnerships, []);
    assert.deepEqual((await req('/audit')).data.events, []);
    assert.equal((await req('/partnerships', { name: 'My venture' })).status, 403);
    assert.equal((await req('/auth/me')).data.user.name, 'Rohit');
    assert.equal(
      (
        await req('/auth/register', {
          name: 'Other',
          email: 'rohit@example.com',
          password: 'Another-password',
        })
      ).status,
      409,
    );
    await req('/auth/logout', {});
    assert.equal((await req('/auth/me')).status, 401);
    assert.equal(
      (await req('/auth/login', { email: 'rohit@example.com', password: 'wrong' })).status,
      401,
    );
    assert.equal(
      (await req('/auth/login', { email: 'rohit@example.com', password: 'My-private-password' }))
        .status,
      200,
    );
    const persisted = JSON.parse(await fs.readFile(path.join(dir, 'workspace.json'), 'utf8'));
    assert.equal(persisted.users.length, 1);
    assert.ok(persisted.users[0].passwordHash);
    assert.ok(!persisted.users[0].isDemo);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('legacy cleanup preserves personally registered users and makes a backup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'accord-migration-test-'));
  await fs.writeFile(
    path.join(dir, 'workspace.json'),
    JSON.stringify({
      users: [
        { id: 'old', isDemo: true },
        { id: 'personal', name: 'Rohit' },
      ],
      sessions: [{ userId: 'old' }, { userId: 'personal' }],
      partnerships: [
        { id: 'sample', creatorId: 'old' },
        { id: 'mine', creatorId: 'personal', mode: 'chain' },
      ],
      events: [{ partnershipId: 'sample' }, { partnershipId: 'mine' }],
    }),
  );
  const { store } = await createApp({ mode: 'chain', dataDir: dir, mongoUri: '' });
  try {
    assert.deepEqual(
      store.db.users.map((u) => u.id),
      ['personal'],
    );
    assert.deepEqual(
      store.db.partnerships.map((p) => p.id),
      ['mine'],
    );
    assert.equal(store.db.events.length, 1);
    assert.ok((await fs.readdir(dir)).some((f) => f.startsWith('workspace-before-cleanup-')));
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
