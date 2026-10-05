import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutGrid,
  ScanLine,
  ShieldCheck,
  BookOpen,
  Plus,
  LogOut,
  Wallet,
  ChevronDown,
  ArrowUpRight,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Layers3,
  ArrowRight,
} from 'lucide-react';
import { api, post } from './api';
import { formatEther } from 'ethers';
import { connect, restoreWallet, chainAction, chainCreate, readableError } from './web3';
import { Logo, Button, Badge, Avatar, short, eth, Loading } from './ui';
import { getWalletProvider } from './wallet-network.mjs';
import WalletSetup from './WalletSetup';
import Auth from './Auth';
import Dashboard from './Dashboard';
import CreatePartnership from './CreatePartnership';
import Detail from './Detail';
import Audit from './Audit';
import Help from './Help';
import WalletPage from './WalletPage';
import useLiveWorkspace from './useLiveWorkspace';
function currentRoute() {
  const hash = location.hash.slice(1) || '/';
  if (hash.startsWith('/partnership/')) return { page: 'detail', id: hash.split('/')[2] };
  return {
    page:
      {
        '/': 'dashboard',
        '/create': 'create',
        '/audit': 'audit',
        '/admin': 'admin',
        '/help': 'help',
        '/wallet': 'wallet',
      }[hash] || 'dashboard',
  };
}
export default function App() {
  const [config, setConfig] = useState(null),
    [user, setUser] = useState(null),
    [booting, setBooting] = useState(true),
    [bootError, setBootError] = useState(''),
    [route, setRoute] = useState(currentRoute),
    [toast, setToast] = useState(null),
    [wallet, setWallet] = useState(null),
    [walletBusy, setWalletBusy] = useState(false),
    [walletSetup, setWalletSetup] = useState(false),
    [mobile, setMobile] = useState(false),
    [pending, setPending] = useState(null);
  const {
    partnerships,
    setPartnerships,
    events,
    portfolio,
    loading,
    dataError,
    walletError,
    updatedAt,
    expired,
    reload,
  } = useLiveWorkspace(user);
  const notify = useCallback(
    (message, type = 'success') => setToast({ message, type, id: Date.now() }),
    [],
  );
  const closeWalletSetup = useCallback(() => setWalletSetup(false), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.type === 'error' ? 9000 : 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const navigate = useCallback((path) => {
    location.hash = path;
    setMobile(false);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const handle = () => setRoute(currentRoute());
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, []);
  useEffect(() => {
    (async () => {
      try {
        setConfig(await api('/config'));
        try {
          const { user } = await api('/auth/me');
          setUser(user);
        } catch (e) {
          if (e.status !== 401) throw e;
        }
      } catch (e) {
        setBootError(e.message);
      } finally {
        setBooting(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (expired) {
      setUser(null);
      setWallet(null);
    }
  }, [expired]);
  useEffect(() => {
    let cancelled = false;
    if (user && config?.mode === 'chain')
      restoreWallet(config, user)
        .then((result) => {
          if (!cancelled) setWallet(result);
        })
        .catch(() => {
          if (!cancelled) setWallet(null);
        });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.wallet, config?.mode]);
  useEffect(() => {
    const injected = getWalletProvider();
    if (!injected) return;
    const changed = () => {
      setWallet(null);
      notify('Wallet or network changed. Reconnect before submitting a transaction.', 'info');
    };
    injected.on?.('accountsChanged', changed);
    injected.on?.('chainChanged', changed);
    return () => {
      injected.removeListener?.('accountsChanged', changed);
      injected.removeListener?.('chainChanged', changed);
    };
  }, [notify]);
  function loggedIn(u) {
    setUser(u);
    setWallet(null);
    setToast(null);
    navigate('/');
  }
  async function logout() {
    try {
      await post('/auth/logout');
      setUser(null);
      setWallet(null);
      navigate('/');
    } catch (e) {
      notify(e.message, 'error');
    }
  }
  async function connectWallet() {
    setWalletSetup(false);
    setWalletBusy(true);
    try {
      const result = await connect(config, user.wallet);
      setUser(result.user);
      setWallet(result);
      notify('Wallet verified and connected.');
    } catch (e) {
      if (e.code === 'MISSING_WALLET') {
        setToast(null);
        setWalletSetup(true);
      } else notify(readableError(e), 'error');
    } finally {
      setWalletBusy(false);
    }
  }
  const transactionPending = (hash) => setPending({ hash, phase: 'Waiting for confirmation' });
  async function fundWallet() {
    setWalletBusy(true);
    try {
      const result = await post('/wallet/fund');
      setWallet((current) => (current ? { ...current, balance: result.balance } : current));
      await reload();
      notify('25 test ETH added to your wallet on the local network.');
    } catch (error) {
      notify(readableError(error), 'error');
    } finally {
      setWalletBusy(false);
    }
  }
  async function act(p, action, data = {}) {
    if (pending) throw new Error('Wait for the current transaction to finish.');
    setPending({ phase: 'Confirm in MetaMask' });
    try {
      const result = await chainAction(config, user, p, action, data, transactionPending);
      setPartnerships((ps) => ps.map((x) => (x.id === p.id ? result.partnership : x)));
      if (wallet && config.mode === 'chain') {
        const balance = await wallet.provider.getBalance(wallet.address);
        setWallet((current) => (current ? { ...current, balance: formatEther(balance) } : current));
      }
      await reload();
      notify('Transaction confirmed. Your workspace is updated.');
      return result.partnership;
    } catch (e) {
      const message = readableError(e);
      notify(message, 'error');
      throw new Error(message);
    } finally {
      setPending(null);
    }
  }
  async function create(input) {
    if (pending) throw new Error('Wait for the current transaction to finish.');
    setPending({
      phase: 'Confirm creation in MetaMask',
    });
    try {
      const result = await chainCreate(config, user, input, transactionPending);
      await reload();
      notify('Partnership created. Invite every partner to sign the agreement.');
      navigate(`/partnership/${result.partnership.id}`);
      return result.partnership;
    } catch (e) {
      notify(readableError(e), 'error');
      throw e;
    } finally {
      setPending(null);
    }
  }
  if (booting) return <Loading />;
  if (bootError)
    return (
      <div className="boot-error">
        <Logo />
        <h2>Let’s get your workspace running.</h2>
        <p>{bootError}</p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </div>
    );
  if (!user) return <Auth config={config} onLogin={loggedIn} />;
  const p = partnerships.find((x) => x.id === route.id);
  const nav = [
    { page: 'dashboard', path: '/', label: 'Partnerships', icon: LayoutGrid },
    { page: 'wallet', path: '/wallet', label: 'My wallet', icon: Wallet },
    { page: 'audit', path: '/audit', label: 'Audit explorer', icon: ScanLine },
    ...(user.role === 'auditor'
      ? [{ page: 'admin', path: '/admin', label: 'Auditor console', icon: ShieldCheck }]
      : []),
    { page: 'help', path: '/help', label: 'Help & guide', icon: BookOpen },
  ];
  const activeNav = route.page === 'detail' || route.page === 'create' ? 'dashboard' : route.page;
  const balance = portfolio?.balance ?? wallet?.balance;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-chip">
          <span className="workspace-icon">
            <Layers3 size={17} />
          </span>
          <div>
            Partnership workspace
            <small>{user.role === 'auditor' ? 'Audit & oversight' : 'Shared ventures'}</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(({ page, path, label, icon: Icon }) => (
            <button
              key={page}
              className={activeNav === page ? 'active' : ''}
              onClick={() => navigate(path)}
            >
              <Icon size={18} />
              {label}
              {page === 'dashboard' && <span>{partnerships.length}</span>}
            </button>
          ))}
        </nav>
        {user.role !== 'auditor' && (
          <button className="sidebar-create" onClick={() => navigate('/create')}>
            <Plus size={17} />
            New partnership
            <ArrowUpRight size={14} />
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="network-card">
            <span className="status-dot" />
            <span>
              Local test network
              <small>{`Chain ${config.chainId} · Test ETH only`}</small>
            </span>
          </div>
          <button className="sidebar-user" onClick={logout} title="Sign out">
            <Avatar name={user.name} />
            <div>
              {user.name}
              <small>{user.role === 'auditor' ? 'Auditor' : 'Partner account'}</small>
            </div>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {mobile && <div className="nav-scrim" onClick={() => setMobile(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {
                {
                  dashboard: 'Partnerships',
                  detail: p?.name || 'Partnership',
                  create: 'Create partnership',
                  audit: 'Audit explorer',
                  admin: 'Auditor console',
                  help: 'Help & guide',
                  wallet: 'My wallet',
                }[route.page]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <span
              className={`live-updates ${dataError ? 'paused' : ''}`}
              title={
                dataError ||
                (updatedAt
                  ? 'Updates automatically every 3 seconds while this tab is open.'
                  : 'Connecting to your workspace…')
              }
            >
              <span className="status-dot" />
              {dataError ? 'Updates paused' : updatedAt ? 'Live updates' : 'Syncing…'}
            </span>
            {wallet && Number(balance) < 25 && (
              <Button
                variant="wallet"
                icon={Plus}
                busy={walletBusy}
                onClick={fundWallet}
                aria-label="Get test ETH"
              >
                <span className="fund-label">Test ETH</span>
              </Button>
            )}
            <Button
              variant="wallet"
              icon={Wallet}
              busy={walletBusy}
              onClick={wallet ? () => navigate('/wallet') : connectWallet}
            >
              {wallet ? `${eth(balance, 3)} ETH · ${short(wallet.address)}` : 'Connect wallet'}
            </Button>
          </div>
        </header>
        <main className="content">
          {dataError && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{dataError}</span>
              <button onClick={() => reload()}>Retry</button>
            </div>
          )}
          {route.page === 'dashboard' && (
            <Dashboard
              user={user}
              config={config}
              partnerships={partnerships}
              events={events}
              loading={loading}
              navigate={navigate}
              notify={notify}
            />
          )}{' '}
          {route.page === 'create' &&
            (user.role === 'auditor' ? (
              <div className="empty">Auditors have read-only access.</div>
            ) : (
              <CreatePartnership
                user={user}
                config={config}
                create={create}
                reload={reload}
                navigate={navigate}
                notify={notify}
              />
            ))}
          {route.page === 'detail' &&
            (p ? (
              <Detail
                key={p.id}
                partnership={p}
                user={user}
                config={config}
                wallet={wallet}
                act={act}
                events={events.filter((e) => e.partnershipId === p.id)}
                navigate={navigate}
                notify={notify}
                busy={Boolean(pending)}
                connectWallet={connectWallet}
              />
            ) : loading ? (
              <Loading />
            ) : (
              <div className="empty">
                <h2>Partnership unavailable</h2>
                <p>This partnership does not exist or your account does not have access.</p>
                <Button onClick={() => navigate('/')}>Back to workspace</Button>
              </div>
            ))}
          {(route.page === 'audit' || route.page === 'admin') && (
            <Audit
              user={user}
              config={config}
              events={events}
              partnerships={partnerships}
              navigate={navigate}
              notify={notify}
              admin={route.page === 'admin'}
              loading={loading}
            />
          )}{' '}
          {route.page === 'help' && <Help config={config} navigate={navigate} />}
          {route.page === 'wallet' && (
            <WalletPage
              user={user}
              config={config}
              portfolio={portfolio}
              error={walletError}
              connected={Boolean(wallet)}
              connectWallet={connectWallet}
              walletBusy={walletBusy}
              fundWallet={fundWallet}
              reload={reload}
              notify={notify}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} />
            Every decision leaves a trail.
          </span>
          <span>Accord · Local blockchain</span>
        </footer>
      </div>
      {walletSetup && (
        <WalletSetup
          config={config}
          close={closeWalletSetup}
          retry={connectWallet}
          notify={notify}
        />
      )}
      {pending && (
        <div className="pending-toast" role="status">
          <LoaderCircle className="spin" size={19} />
          <div>
            {pending.phase}
            {pending.hash && <small title={pending.hash}>{short(pending.hash)}</small>}
          </div>
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          {toast.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
