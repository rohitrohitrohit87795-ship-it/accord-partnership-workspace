const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Store } = require('../src/store.cjs');
const { createApp } = require('../src/index.cjs');

function testUri() {
  return `mongodb://127.0.0.1:27017/accord_test_${crypto.randomBytes(12).toString('hex')}`;
}
async function dispose(store, dir) {
  if (store) {
    await store.queue;
    assert.match(store.connection.name, /^accord_test_[0-9a-f]+$/);
    await store.connection.dropDatabase();
    await store.close();
  }
  await fs.rm(dir, { recursive: true, force: true });
}

test('MongoDB migration preserves records, provides Compass views, and survives restarts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'accord-mongo-test-'));
  const uri = testUri();
  const saved = {
    users: [{ id: 'personal', name: 'Rohit', wallet: null, role: 'partner', counter: 0 }],
    sessions: [{ id: 'session', userId: 'personal', expiresAt: Date.now() + 86400000 }],
    partnerships: [
      { id: 'partnership', name: 'My partnership', creatorId: 'personal', mode: 'chain' },
    ],
    events: [{ id: 'event', partnershipId: 'partnership', action: 'Partnership created' }],
  };
  await fs.writeFile(path.join(dir, 'workspace.json'), JSON.stringify(saved));
  let store;
  try {
    store = await new Store(dir, uri).init();
    assert.ok(store.migrated);
    assert.deepEqual(store.db, saved);
    assert.equal(
      (await fs.readdir(dir)).filter((name) => name.startsWith('workspace-before-mongodb-')).length,
      1,
    );
    for (const name of ['users', 'sessions', 'partnerships', 'events']) {
      assert.deepEqual(await store.connection.db.collection(name).find({}).toArray(), saved[name]);
    }
    await Promise.all(
      Array.from({ length: 10 }, () =>
        store.write((db) => {
          db.users[0].counter++;
        }),
      ),
    );
    assert.equal(store.db.users[0].counter, 10);
    assert.equal((await store.connection.db.collection('users').findOne()).counter, 10);
    const update = store.Model.updateOne;
    store.Model.updateOne = () => Promise.reject(new Error('Test persistence failure'));
    await assert.rejects(
      store.write((db) => {
        db.users[0].counter = 999;
      }),
      /Test persistence failure/,
    );
    store.Model.updateOne = update;
    assert.equal(store.db.users[0].counter, 10);
    await store.close();
    // A stale JSON file must never overwrite the data already saved in MongoDB.
    await fs.writeFile(path.join(dir, 'workspace.json'), JSON.stringify({ ...saved, users: [] }));
    store = await new Store(dir, uri).init();
    assert.equal(store.db.users.length, 1);
    assert.equal(store.db.users[0].counter, 10);
    assert.ok(!store.migrated);
  } finally {
    await dispose(store, dir);
  }
});

test('MongoDB-backed account and session remain available after restarting the API', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'accord-mongo-api-'));
  const uri = testUri();
  let store, server;
  try {
    let result = await createApp({ dataDir: dir, mongoUri: uri });
    store = result.store;
    server = result.app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    let base = `http://127.0.0.1:${server.address().port}/api`;
    const response = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mongo Partner',
        email: 'mongo-test@example.com',
        password: 'private-test-password',
      }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const registered = await response.json();
    assert.equal((await (await fetch(base + '/health')).json()).storage, 'mongodb');
    assert.equal((await store.connection.db.collection('users').findOne()).id, registered.user.id);
    assert.equal(await store.connection.db.collection('sessions').countDocuments(), 1);
    await new Promise((r) => server.close(r));
    await store.close();
    result = await createApp({ dataDir: dir, mongoUri: uri });
    store = result.store;
    server = result.app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
    const me = await fetch(base + '/auth/me', { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.id, registered.user.id);
    await assert.rejects(fs.access(path.join(dir, 'workspace.json')), { code: 'ENOENT' });
  } finally {
    if (server?.listening) await new Promise((r) => server.close(r));
    await dispose(store, dir);
  }
});
