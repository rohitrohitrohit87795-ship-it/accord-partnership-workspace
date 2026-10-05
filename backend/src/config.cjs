const path = require('node:path');
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env'), quiet: true });

module.exports = {
  backendRoot,
  frontendRoot: path.resolve(backendRoot, '../frontend'),
  dataDir: path.resolve(backendRoot, process.env.DATA_DIR || 'data'),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/accord',
};
