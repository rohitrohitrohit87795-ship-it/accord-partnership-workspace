import React, { useState } from 'react';
import { Wallet, Coins, Plus, Trash2, Copy } from 'lucide-react';
import { api } from './api';
import { PageTitle, Panel, Button, Empty, Loading, Badge } from './ui';

// Keep the exact decimal balance, including values too small to round to four digits.
const amount = (value) => {
  const [integer, fraction] = String(value).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = fraction?.replace(/0+$/, '');
  return grouped + (trimmed ? '.' + trimmed : '');
};

export default function WalletPage({
  user,
  config,
  portfolio,
  error,
  connected,
  connectWallet,
  walletBusy,
  fundWallet,
  reload,
  notify,
}) {
  const [busy, setBusy] = useState(false);
  async function removeToken(address) {
    setBusy(true);
    try {
      await api(`/wallet/tokens/${address}`, { method: 'DELETE' });
      await reload();
      notify('Token removed from your list. Your tokens stay in your wallet.');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(user.wallet);
      notify('Wallet address copied.');
    } catch {
      notify('Select your wallet address to copy it.', 'info');
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR ASSETS, AT A GLANCE"
        title="My wallet"
        description="Your personal balance and token holdings on the local network."
      >
        {!connected && (
          <Button icon={Wallet} onClick={connectWallet} busy={walletBusy}>
            {user.wallet ? 'Reconnect wallet' : 'Connect wallet'}
          </Button>
        )}
      </PageTitle>
      {!user.wallet ? (
        <Panel>
          <Empty
            icon={Wallet}
            title="Connect your wallet to see your assets"
            description="Verify your own wallet to view its balance."
            action={
              <Button onClick={connectWallet} busy={walletBusy}>
                Connect wallet
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          {error && (
            <div className="error-banner" role="alert">
              <span>Wallet updates paused. {error} Your last balances may be out of date.</span>
              <button onClick={() => reload()}>Retry</button>
            </div>
          )}
          <section className="wallet-overview">
            <div className="wallet-balance-card">
              <span className="wallet-card-label">
                <Wallet size={18} /> AVAILABLE IN YOUR WALLET
              </span>
              <div className="wallet-total" data-testid="native-balance">
                {portfolio?.balance != null ? amount(portfolio.balance) : '—'} <span>ETH</span>
              </div>
              <p>Personal balance · separate from partnership treasuries</p>
              {portfolio?.balance != null && Number(portfolio.balance) < 25 && (
                <Button variant="secondary" icon={Plus} onClick={fundWallet} busy={walletBusy}>
                  Get test ETH
                </Button>
              )}
            </div>
            <Panel title="Wallet details" className="wallet-details">
              <div className="wallet-detail-row">
                <span>Network</span>
                <strong>Local network · {config.chainId}</strong>
              </div>
              <div className="wallet-detail-row">
                <span>Status</span>
                <Badge tone={connected ? 'green' : ''}>
                  {connected ? 'Connected' : 'Viewing balances'}
                </Badge>
              </div>
              <div className="wallet-address">
                <span>Your wallet address</span>
                <div>
                  <code>{user.wallet}</code>
                  <button
                    className="icon-button"
                    aria-label="Copy wallet address"
                    onClick={copyAddress}
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <small>Test assets on this network have no monetary value.</small>
            </Panel>
          </section>
          <div className="wallet-assets-grid">
            <Panel title="Your holdings" caption="Balances update automatically every few seconds.">
              {!portfolio && !error ? (
                <Loading />
              ) : (
                <div className="wallet-holdings">
                  <div className="wallet-asset">
                    <span className="asset-icon">
                      <Wallet size={20} />
                    </span>
                    <div className="asset-description">
                      <strong>Ethereum</strong>
                      <small>Native currency · ETH</small>
                    </div>
                    <strong className="asset-amount">
                      {portfolio?.balance != null ? amount(portfolio.balance) : 'Unavailable'}
                      <small>ETH</small>
                    </strong>
                  </div>
                  {(portfolio?.tokens || []).map((token) => (
                    <div className="wallet-asset" key={token.address}>
                      <span className="asset-icon token">
                        <Coins size={20} />
                      </span>
                      <div className="asset-description">
                        <strong>{token.name || 'Imported token'}</strong>
                        <small className="token-address" title={token.address}>
                          {token.address}
                        </small>
                      </div>
                      <strong className="asset-amount" title={token.balance ?? token.error}>
                        {token.balance != null ? amount(token.balance) : 'Unavailable'}
                        <small>{token.symbol || 'ERC-20'}</small>
                      </strong>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Remove ${token.symbol || token.address} from list`}
                        onClick={() => removeToken(token.address)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
