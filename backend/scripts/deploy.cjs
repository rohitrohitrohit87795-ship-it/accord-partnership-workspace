const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const settings = require('../src/config.cjs');
async function main() {
  const factory = await (await hre.ethers.getContractFactory('PartnershipFactory')).deploy();
  await factory.waitForDeployment();
  fs.mkdirSync(settings.dataDir, { recursive: true });
  const address = await factory.getAddress();
  fs.writeFileSync(
    path.join(settings.dataDir, 'chain.json'),
    JSON.stringify({ factoryAddress: address, chainId: 31337 }, null, 2),
  );
  console.log(`Factory deployed at ${address}. Set APP_MODE=chain in .env, then start the app.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
