const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
class Store {
  constructor(dir, mongoUri = '') {
    this.dir = dir;
    this.file = path.join(dir, 'workspace.json');
    this.mongoUri = mongoUri;
    this.queue = Promise.resolve();
  }
  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    if (this.mongoUri) {
      this.connection = await mongoose
        .createConnection(this.mongoUri, {
          serverSelectionTimeoutMS: 5000,
        })
        .asPromise();
      this.Model = this.connection.model(
        'Workspace',
        new mongoose.Schema(
          { _id: String, payload: mongoose.Schema.Types.Mixed },
          { minimize: false },
        ),
      );
      try {
        const existing = await this.Model.findById('workspace').lean();
        if (!existing) {
          let imported;
          try {
            imported = JSON.parse(await fs.readFile(this.file, 'utf8'));
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }
          const initial = imported || { users: [], sessions: [], partnerships: [], events: [] };
          if (
            !['users', 'sessions', 'partnerships', 'events'].every((key) =>
              Array.isArray(initial[key]),
            )
          )
            throw new Error('The saved workspace is invalid. MongoDB migration was stopped.');
          if (imported)
            await fs.copyFile(
              this.file,
              path.join(this.dir, `workspace-before-mongodb-${Date.now()}.json`),
            );
          // Insert only when the destination is empty; never overwrite an existing database.
          await this.Model.updateOne(
            { _id: 'workspace' },
            { $setOnInsert: { payload: initial } },
            { upsert: true },
          );
          this.migrated = Boolean(imported);
        }
        this.db = (await this.Model.findById('workspace').lean()).payload;
        if (
          !['users', 'sessions', 'partnerships', 'events'].every((key) =>
            Array.isArray(this.db?.[key]),
          )
        )
          throw new Error(
            'The MongoDB workspace is invalid. Restore a valid backup before starting.',
          );
        // A single atomic document keeps related writes consistent on a standalone local
        // MongoDB server. Views expose each record type separately in Compass.
        for (const name of ['users', 'sessions', 'partnerships', 'events']) {
          const collections = await this.connection.db.listCollections({ name }).toArray();
          if (!collections.length)
            await this.connection.db.createCollection(name, {
              viewOn: this.Model.collection.name,
              pipeline: [
                { $match: { _id: 'workspace' } },
                { $unwind: `$payload.${name}` },
                { $replaceWith: `$payload.${name}` },
              ],
            });
          else if (
            collections[0].type !== 'view' ||
            collections[0].options.viewOn !== this.Model.collection.name
          )
            throw new Error(
              `MongoDB already has an unrelated ${name} collection. Choose a separate database.`,
            );
        }
      } catch (e) {
        await this.connection.close();
        throw e;
      }
    } else {
      try {
        this.db = JSON.parse(await fs.readFile(this.file, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    this.db ||= { users: [], sessions: [], partnerships: [], events: [] };
    return this;
  }
  async save(db) {
    if (this.Model)
      await this.Model.updateOne({ _id: 'workspace' }, { payload: db }, { upsert: true });
    else {
      await fs.writeFile(`${this.file}.tmp`, JSON.stringify(db, null, 2));
      await fs.rename(`${this.file}.tmp`, this.file);
    }
  }
  write(fn) {
    const job = this.queue.then(async () => {
      const draft = structuredClone(this.db);
      const result = await fn(draft);
      if (JSON.stringify(draft) !== JSON.stringify(this.db)) await this.save(draft);
      this.db = draft;
      return result;
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async close() {
    await this.queue;
    if (this.connection) await this.connection.close();
  }
}
module.exports = { Store };
