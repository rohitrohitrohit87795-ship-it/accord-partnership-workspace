import React from 'react';
import { Copy, ArrowUpRight } from 'lucide-react';
import { Modal, Button } from './ui';

export default function WalletSetup({ config, close, retry, notify }) {
  const website = window.location.origin;
  async function copyWebsite() {
    try {
      await navigator.clipboard.writeText(website);
      notify('Website address copied. Paste it into Chrome or Edge.');
    } catch {
      notify(
        'Select and copy the website address below, then paste it into Chrome or Edge.',
        'info',
      );
    }
  }
  return (
    <Modal
      title="Connect with MetaMask"
      eyebrow="WALLET CONNECTION"
      close={close}
      description="No wallet extension was detected in this browser. Open this website in Chrome or Edge with MetaMask installed and enabled."
    >
      <ol className="wallet-setup-steps">
        <li>Open Chrome or Edge using the browser profile where you use MetaMask.</li>
        <li>Paste the website address below and sign in with your existing account.</li>
        <li>
          Click Connect wallet. Approve the local network request, then sign the wallet-verification
          message.
        </li>
      </ol>
      <label className="field">
        <span>Website address</span>
        <input readOnly value={website} onFocus={(event) => event.target.select()} />
      </label>
      <div className="wallet-setup-actions">
        <Button icon={Copy} onClick={copyWebsite}>
          Copy website address
        </Button>
        <a
          className="button secondary"
          href="https://metamask.io/download"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get MetaMask <ArrowUpRight size={16} />
        </a>
      </div>
      <p className="wallet-setup-network">
        The app sets up the local network automatically. If you need to add it manually in MetaMask:
      </p>
      <dl className="wallet-setup-details">
        <div>
          <dt>Network name</dt>
          <dd>Accord Local Test Network</dd>
        </div>
        <div>
          <dt>RPC URL</dt>
          <dd>{config.rpcUrl}</dd>
        </div>
        <div>
          <dt>Chain ID</dt>
          <dd>{config.chainId}</dd>
        </div>
        <div>
          <dt>Currency symbol</dt>
          <dd>ETH</dd>
        </div>
      </dl>
      <Button variant="secondary" onClick={retry}>
        Try connecting again
      </Button>
    </Modal>
  );
}
