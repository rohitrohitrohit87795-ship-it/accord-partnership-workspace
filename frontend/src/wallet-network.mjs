export function walletErrorCode(error) {
  const codes = [
    error?.code,
    error?.error?.code,
    error?.info?.error?.code,
    error?.data?.originalError?.code,
    error?.error?.data?.originalError?.code,
  ];
  return (
    codes.find((code) => typeof code === 'number' || /^-?\d+$/.test(String(code))) ?? error?.code
  );
}

export function getWalletProvider() {
  const injected = typeof window === 'undefined' ? null : window.ethereum;
  return injected?.providers?.find((provider) => provider.isMetaMask) || injected;
}

export function requireWalletProvider() {
  const injected = getWalletProvider();
  if (typeof injected?.request !== 'function') {
    const error = new Error(
      'No wallet extension is available in this browser. Open this website in Chrome or Edge with MetaMask enabled.',
    );
    error.code = 'MISSING_WALLET';
    throw error;
  }
  return injected;
}

export async function ensureWalletNetwork(injected, config) {
  const chainId = `0x${Number(config.chainId).toString(16)}`;
  const matches = async () =>
    BigInt(await injected.request({ method: 'eth_chainId' })) === BigInt(config.chainId);
  if (await matches()) return;
  const switchChain = () =>
    injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  try {
    await switchChain();
  } catch (error) {
    if (Number(walletErrorCode(error)) !== 4902) throw error;
    await injected.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: 'Accord Local Test Network',
          rpcUrls: [config.rpcUrl],
          nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
        },
      ],
    });
    // Adding a network does not require a wallet to select it (EIP-3085).
    if (!(await matches())) await switchChain();
  }
  if (!(await matches()))
    throw new Error(
      'The wallet did not switch networks. Select Accord Local Test Network in MetaMask, then try again.',
    );
}
