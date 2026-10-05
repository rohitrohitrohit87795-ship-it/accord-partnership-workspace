import { BrowserProvider, Contract, parseEther, formatEther } from 'ethers';
import { api, post } from './api';
import {
  getWalletProvider,
  requireWalletProvider,
  ensureWalletNetwork,
  walletErrorCode,
} from './wallet-network.mjs';
export async function restoreWallet(config, user) {
  const injected = getWalletProvider();
  if (!injected || !user.wallet || config.mode !== 'chain') return null;
  const [chainId, accounts] = await Promise.all([
    injected.request({ method: 'eth_chainId' }),
    injected.request({ method: 'eth_accounts' }),
  ]);
  if (
    Number(BigInt(chainId)) !== config.chainId ||
    !accounts.length ||
    accounts[0].toLowerCase() !== user.wallet.toLowerCase()
  )
    return null;
  const provider = new BrowserProvider(injected, undefined, { cacheTimeout: -1 });
  return {
    user,
    address: accounts[0],
    balance: formatEther(await provider.getBalance(accounts[0])),
    provider,
    signer: await provider.getSigner(),
  };
}
export async function connect(config, expectedWallet) {
  const injected = requireWalletProvider();
  await injected.request({ method: 'eth_requestAccounts' });
  await ensureWalletNetwork(injected, config);
  // Initialize ethers after switching, so its cached network is never stale.
  const provider = new BrowserProvider(injected, undefined, { cacheTimeout: -1 });
  const signer = await provider.getSigner(),
    address = await signer.getAddress();
  if (expectedWallet && address.toLowerCase() !== expectedWallet.toLowerCase())
    throw new Error('Select the wallet linked to this account in MetaMask.');
  const challenge = await post('/wallet/challenge', { wallet: address });
  const signature = await signer.signMessage(challenge.message);
  const { user } = await post('/wallet/verify', { signature });
  return {
    user,
    address,
    balance: formatEther(await provider.getBalance(address)),
    signer,
    provider,
  };
}
export async function signerFor(config, wallet) {
  const injected = requireWalletProvider();
  await ensureWalletNetwork(injected, config);
  const provider = new BrowserProvider(injected, undefined, { cacheTimeout: -1 });
  const accounts = await provider.send('eth_accounts', []);
  if (!accounts.length || !wallet || accounts[0].toLowerCase() !== wallet.toLowerCase())
    throw new Error('Connect the wallet linked to your account.');
  return provider.getSigner();
}
async function confirmed(tx, pending) {
  pending(tx.hash);
  let receipt;
  try {
    receipt = await tx.wait();
  } catch (e) {
    if (e.code === 'TRANSACTION_REPLACED' && !e.cancelled) receipt = e.receipt;
    else throw e;
  }
  if (!receipt || receipt.status !== 1)
    throw new Error('Transaction failed. Your form has been kept.');
  return receipt.hash;
}
export async function chainAction(config, user, p, action, data, pending) {
  const signer = await signerFor(config, user.wallet),
    { partnership: abi } = await api('/chain/artifacts');
  const c = new Contract(p.address, abi, signer);
  let tx;
  switch (action) {
    case 'sign':
      tx = await c.approveAgreement();
      break;
    case 'contribute':
      tx = await c.depositContribution({ value: parseEther(data.amount) });
      break;
    case 'revenue':
      tx = await c.depositRevenue({ value: parseEther(data.amount) });
      break;
    case 'proposeExpense':
      tx = await c.proposeExpense(
        data.title,
        data.description || '',
        data.recipient,
        parseEther(data.amount),
      );
      break;
    case 'approveExpense':
    case 'rejectExpense':
      tx = await c.approveExpense(data.id, action === 'approveExpense');
      break;
    case 'executeExpense':
      tx = await c.executeExpense(data.id);
      break;
    case 'distribute':
      tx = await c.distributeProfit(parseEther(data.amount));
      break;
    case 'createProposal':
      tx = await c.createProposal(
        data.title,
        data.description || '',
        Math.floor(Date.now() / 1000) + Number(data.days || 7) * 86400,
      );
      break;
    case 'vote':
      tx = await c.vote(data.id, data.support);
      break;
    case 'closeProposal':
      tx = await c.closeProposal(data.id);
      break;
    case 'requestExit':
      tx = await c.requestExit(parseEther(data.amount), data.reason || '');
      break;
    case 'approveExit':
      tx = await c.approveExit(data.id);
      break;
    case 'settleExit':
      tx = await c.settleExit(data.id);
      break;
    default:
      throw new Error('Unknown action.');
  }
  const hash = await confirmed(tx, pending);
  return post(`/partnerships/${p.id}/sync`, { hash });
}
export async function chainCreate(config, user, input, pending) {
  if (!config.factoryAddress)
    throw new Error('Start the local blockchain and run npm run deploy first.');
  const signer = await signerFor(config, user.wallet),
    { factory: abi } = await api('/chain/artifacts');
  const c = new Contract(config.factoryAddress, abi, signer);
  const tx = await c.createPartnership(
    input.name,
    input.partners.map((x) => x.wallet),
    input.partners.map((x) => parseEther(String(x.expected))),
    input.partners.map((x) => Math.round(Number(x.ownership) * 100)),
    Number(input.quorum),
    Math.floor(new Date(input.endsAt).getTime() / 1000),
  );
  const hash = await confirmed(tx, pending);
  try {
    return await post('/partnerships', { ...input, hash });
  } catch (error) {
    error.confirmedHash = hash;
    error.message = `Contract creation confirmed. Metadata could not be saved; use Retry save. ${error.message}`;
    throw error;
  }
}
export function readableError(error) {
  const code = walletErrorCode(error);
  if (Number(code) === 4001 || error.code === 'ACTION_REJECTED')
    return 'The wallet request was cancelled. You can try again.';
  if (Number(code) === -32002)
    return 'A request is already open in MetaMask. Open the extension and approve or cancel it before trying again.';
  if (error.code === 'INSUFFICIENT_FUNDS')
    return 'Your wallet needs enough test ETH for the amount and transaction fee.';
  return (
    error.reason || error.shortMessage || error.message || 'The action could not be completed.'
  );
}
