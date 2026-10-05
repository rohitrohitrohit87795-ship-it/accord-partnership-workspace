import React, { useState } from 'react';
import {
  Fingerprint,
  Wallet,
  Layers3,
  Landmark,
  Receipt,
  TrendingUp,
  Vote,
  DoorOpen,
  ScanLine,
  ChevronDown,
  ArrowRight,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import { PageTitle, Panel, Button, Notice } from './ui';
export default function Help({ config, navigate }) {
  const [open, setOpen] = useState(0);
  const guides = [
    {
      title: 'See your wallet and live updates',
      icon: Wallet,
      text: 'Open My wallet to see your personal ETH balance and full wallet address. Partnership activity, audit records, and wallet balances update every few seconds while the tab is visible, and refresh when you return. You can keep typing while updates arrive. If the connection is interrupted, the last data stays visible and the app retries automatically.',
    },
    {
      title: 'Enter your workspace',
      icon: Layers3,
      text: 'Create an account with your name, email, and a password of at least eight characters. Sign in to return to your workspace. Your session persists for one day. Sign out using your account at the bottom of the sidebar.',
    },
    {
      title: 'Connect your wallet',
      icon: Wallet,
      text: `Open this website in Chrome or Edge with MetaMask installed and enabled. Click Connect wallet; the app requests the local test network (chain ${config.chainId}, RPC ${config.rpcUrl}) automatically. Approve the network request and sign the wallet-verification message. Browsers without a wallet extension show setup instructions instead. If you need funds, use Test ETH in the top bar to receive 25 test ETH on the local network. Each account is linked to one wallet. Changing the wallet or network requires reconnecting.`,
    },
    {
      title: 'Create a partnership',
      icon: Layers3,
      text: 'Choose New partnership. Add a name, description, category, end date, and a quorum between 51% and 100%. Include 2–20 partners with unique wallet addresses, positive capital commitments, and ownership totaling exactly 100%. Review the terms, then create. The partnership starts as Proposed.',
    },
    {
      title: 'Sign and activate the agreement',
      icon: Fingerprint,
      text: 'Open Agreement & signatures and review the charter. Each partner signs once with their own identity. All partners must sign before the partnership becomes Active. The expense and governance quorum is separate from this activation requirement.',
    },
    {
      title: 'Fund the capital vault',
      icon: Landmark,
      text: 'Open Capital vault and deposit your agreed contribution. You may make partial deposits. A deposit cannot exceed your remaining obligation. Funding progress updates for every partner. Capital is tracked separately from distributable profit.',
    },
    {
      title: 'Approve and execute an expense',
      icon: Receipt,
      text: 'Propose an expense with a title, description, recipient wallet, and amount. Each current partner can approve or reject once. When the required percentage of current partners approve, Execute expense becomes available. The treasury must have enough funds. Sufficient rejection closes the proposal.',
    },
    {
      title: 'Record revenue and share profits',
      icon: TrendingUp,
      text: 'Record a revenue deposit, then enter an amount to distribute. Preview every current partner’s effective ownership share. Distributions use available profit, exclude protected capital, and cannot exceed the treasury. Expenses and exit settlements reduce the available profit reserve. The last partner receives any wei rounding remainder.',
    },
    {
      title: 'Vote on a business decision',
      icon: Vote,
      text: 'Create a governance proposal with a voting period of 1–30 days. Ownership weights are captured when the proposal opens. Each eligible partner votes For or Against once. Passing requires the configured percentage of snapshot ownership. Close the decision when it passes, cannot pass, or expires. These are recorded decisions; they do not perform arbitrary purchases, add partners, or modify contract rules.',
    },
    {
      title: 'Request an exit and settle a buyout',
      icon: DoorOpen,
      text: 'Enter a proposed settlement and optional reason. The exiting partner cannot approve their own request. The remaining partners must approve under the quorum rule. Settlement transfers the agreed amount, closes the partner’s membership, and normalizes the remaining effective shares. The last partner cannot exit. Exited partners retain read access.',
    },
    {
      title: 'Read the audit trail',
      icon: ScanLine,
      text: 'Use Audit explorer to filter by partnership, action, wallet, or status. Open a record for details. In blockchain mode, the history is read from confirmed contract events and includes real local transaction hashes. Export the filtered records as CSV. Authorized auditors can verify blockchain receipts and inspect every partnership.',
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE CLARITY GOES A LONG WAY"
        title="Build with confidence."
        description="Your guide to agreements, shared capital, and collective decisions."
      />
      <div className="help-hero">
        <div>
          <BookOpen size={30} />
          <h2>
            From a shared idea
            <br />
            to a clear audit trail.
          </h2>
          <p>
            Start with an agreement. Fund the venture. Make decisions together. Keep every step
            visible.
          </p>
        </div>
        <div className="help-flow">
          {['Create', 'Sign', 'Fund', 'Decide', 'Share', 'Audit'].map((s, i) => (
            <React.Fragment key={s}>
              <span>
                {String(i + 1).padStart(2, '0')}
                <strong>{s}</strong>
              </span>
              {i < 5 && <ArrowRight size={15} />}
            </React.Fragment>
          ))}
        </div>
      </div>
      <Notice>
        MetaMask confirms transactions on the local Ethereum network. Start by creating your account
        and connecting your wallet.
      </Notice>
      <Panel title="How the workspace works" caption="Follow the full journey, one step at a time.">
        <div className="guide-list">
          {guides.map(({ title, icon: Icon, text }, i) => (
            <section key={title} className={open === i ? 'expanded' : ''}>
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                aria-expanded={open === i}
                aria-controls={`guide-${i}`}
              >
                <span className="guide-icon">
                  <Icon size={19} />
                </span>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{title}</strong>
                <ChevronDown size={18} />
              </button>
              {open === i && <p id={`guide-${i}`}>{text}</p>}
            </section>
          ))}
        </div>
      </Panel>
      <div className="help-bottom">
        <ShieldCheck size={24} />
        <div>
          <h3>Ready to bring your people together?</h3>
          <p>Your next partnership begins with a clear agreement.</p>
        </div>
        <Button onClick={() => navigate('/')} icon={ArrowRight}>
          Back to workspace
        </Button>
      </div>
    </>
  );
}
