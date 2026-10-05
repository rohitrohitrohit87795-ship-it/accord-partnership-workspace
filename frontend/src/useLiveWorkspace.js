import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export default function useLiveWorkspace(user) {
  const [partnerships, setPartnerships] = useState([]);
  const [events, setEvents] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [walletError, setWalletError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [expired, setExpired] = useState(false);
  const current = useRef(null);

  const reload = useCallback(
    async ({ quiet = false } = {}) => {
      const context = current.current;
      if (!context || context.cancelled || context.userId !== user?.id) return;
      // A user action requests a fresh read after any pending background read finishes.
      if (context.flight) {
        await context.flight;
        if (quiet || context.cancelled) return;
      }
      if (!quiet) setLoading(true);
      context.flight = (async () => {
        const options = { signal: context.controller.signal, cache: 'no-store' };
        const [workspace, holdings] = await Promise.allSettled([
          Promise.all([api('/partnerships', options), api('/audit', options)]),
          api('/wallet/portfolio', options),
        ]);
        if (context.cancelled) return;
        if (workspace.status === 'fulfilled') {
          setPartnerships(workspace.value[0].partnerships);
          setEvents(workspace.value[1].events);
          setDataError('');
          setUpdatedAt(Date.now());
        } else {
          setDataError('Updates paused: ' + workspace.reason.message);
          if (workspace.reason.status === 401) setExpired(true);
        }
        if (holdings.status === 'fulfilled') {
          setPortfolio(holdings.value);
          setWalletError('');
        } else {
          setWalletError(holdings.reason.message);
          if (holdings.reason.status === 401) setExpired(true);
        }
      })().finally(() => {
        context.flight = null;
        if (!context.cancelled) setLoading(false);
      });
      await context.flight;
    },
    [user?.id, user?.wallet],
  );

  useEffect(() => {
    setPartnerships([]);
    setEvents([]);
    setPortfolio(null);
    setUpdatedAt(null);
    setExpired(false);
    setDataError('');
    setWalletError('');
    if (!user?.id) return;
    const context = { userId: user.id, controller: new AbortController(), cancelled: false };
    current.current = context;
    reload();
    const refresh = () => {
      if (document.visibilityState !== 'hidden') reload({ quiet: true });
    };
    const interval = setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      context.cancelled = true;
      context.controller.abort();
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);

  return {
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
  };
}
