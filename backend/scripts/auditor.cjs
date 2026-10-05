const settings = require('../src/config.cjs');
const { Store } = require('../src/store.cjs');
async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email)
    throw new Error('Usage: npm run auditor -- registered-email@example.com (stop the API first).');
  const store = await new Store(settings.dataDir, settings.mongoUri).init();
  try {
    await store.write((db) => {
      const u = db.users.find((x) => x.email === email);
      if (!u) throw new Error('Register this account before granting auditor access.');
      u.role = 'auditor';
    });
    console.log(`Auditor access granted to ${email}. Restart the API.`);
  } finally {
    await store.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
