import React, { useMemo, useState } from 'react';
import {
  ScanLine,
  Search,
  Download,
  ShieldCheck,
  ArrowUpRight,
  CheckCircle2,
  Layers3,
  Clock3,
  Filter,
  Copy,
} from 'lucide-react';
import { post } from './api';
import {
  PageTitle,
  Panel,
  Stat,
  Button,
  Badge,
  short,
  eth,
  date,
  Empty,
  Modal,
  Loading,
  DownloadCSV,
  Notice,
} from './ui';
export default function Audit({
  user,
  config,
  events,
  partnerships,
  navigate,
  notify,
  admin,
  loading,
}) {
  const [query, setQuery] = useState(''),
    [partnership, setPartnership] = useState(''),
    [action, setAction] = useState(''),
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [verification, setVerification] = useState(null);
  const actions = [...new Set(events.map((e) => e.action))].sort();
  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          (!partnership || e.partnershipId === partnership) &&
          (!action || e.action === action) &&
          (!status || e.status === status) &&
          `${e.actor} ${e.actorName} ${e.hash || ''} ${e.action} ${e.partnershipName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [events, partnership, action, status, query],
  );
  function exportReport() {
    DownloadCSV(admin ? 'accord-audit-report.csv' : 'accord-activity.csv', [
      [
        'Timestamp',
        'Partnership',
        'Action',
        'Actor name',
        'Wallet',
        'Amount ETH',
        'Transaction hash',
        'Status',
        'Mode',
        'Block',
      ],
      ...filtered.map((e) => [
        e.timestamp,
        e.partnershipName,
        e.action,
        e.actorName,
        e.actor,
        e.amount,
        e.hash || '',
        e.status,
        e.mode,
        e.blockNumber || '',
      ]),
    ]);
    notify(`Exported ${filtered.length} filtered audit records.`);
  }
  async function verify() {
    setBusy(true);
    setVerification(null);
    try {
      const result = await post('/audit/verify', { hash: selected.hash });
      setVerification(result);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  if (admin && user.role !== 'auditor')
    return (
      <Empty
        title="Auditor access required"
        description="This console is available to authorized auditor accounts."
      />
    );
  return (
    <>
      <PageTitle
        eyebrow={admin ? 'INDEPENDENT OVERSIGHT' : 'TRANSPARENCY, AT EVERY STEP'}
        title={admin ? 'A clear view of every venture.' : 'Every action. A clear record.'}
        description={
          admin
            ? 'Inspect partnership relationships, verify receipts, and export audit reports.'
            : 'Follow contributions, decisions, and financial activity across your partnerships.'
        }
      >
        <Button
          icon={Download}
          variant="secondary"
          disabled={!filtered.length}
          onClick={exportReport}
        >
          {admin ? 'Export audit report' : 'Export records'}
        </Button>
      </PageTitle>
      {admin && (
        <>
          <div className="stats-grid">
            <Stat
              label="Partnerships monitored"
              value={partnerships.length}
              icon={Layers3}
              detail={`${partnerships.filter((p) => p.status === 'Active').length} active partnerships`}
            />
            <Stat
              label="Activity records"
              value={events.length}
              icon={ScanLine}
              detail="Across all visible partnerships"
            />
            <Stat
              label="Blockchain confirmations"
              value={events.filter((e) => e.status === 'Confirmed').length}
              icon={ShieldCheck}
              detail={'Read from confirmed contract event logs'}
            />
            <Stat
              label="Awaiting activation"
              value={partnerships.filter((p) => p.status === 'Proposed').length}
              icon={Clock3}
              detail="Partnerships with incomplete signatures"
            />
          </div>
          <Panel
            title="Partnership register"
            caption="Inspect contract membership and operating status."
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Partnership</th>
                    <th>Contract</th>
                    <th>Partners</th>
                    <th>Treasury</th>
                    <th>Status</th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerships.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <small className="table-sub">{p.category}</small>
                      </td>
                      <td className="mono" title={p.address || 'Contract address unavailable'}>
                        {short(p.address)}
                      </td>
                      <td>{p.partners.filter((x) => !x.exited).length}</td>
                      <td>{eth(p.treasury)} ETH</td>
                      <td>
                        <Badge tone={p.status === 'Active' ? 'green' : 'amber'}>{p.status}</Badge>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Inspect ${p.name}`}
                          onClick={() => navigate(`/partnership/${p.id}`)}
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      <Panel
        title={admin ? 'Audit records' : 'Activity ledger'}
        caption={`${filtered.length} records match your current filters.`}
        action={<Badge tone="green">{`CHAIN ${config.chainId}`}</Badge>}
      >
        <div className="audit-filters">
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Search audit"
              placeholder="Wallet, hash, partner, or action…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by partnership"
            value={partnership}
            onChange={(e) => setPartnership(e.target.value)}
          >
            <option value="">All partnerships</option>
            {partnerships.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {['Confirmed', 'Pending', 'Failed'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {(query || partnership || action || status) && (
            <button
              className="text-button"
              onClick={() => {
                setQuery('');
                setPartnership('');
                setAction('');
                setStatus('');
              }}
            >
              Reset
            </button>
          )}
        </div>
        {loading && !events.length ? (
          <Loading />
        ) : filtered.length ? (
          <div className="table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Action / partnership</th>
                  <th>Actor</th>
                  <th>Amount</th>
                  <th>Timestamp</th>
                  <th>Transaction</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.action}</strong>
                      <button
                        className="table-link"
                        onClick={() => navigate(`/partnership/${e.partnershipId}`)}
                      >
                        {e.partnershipName}
                      </button>
                    </td>
                    <td>
                      <strong>{e.actorName}</strong>
                      <small className="table-sub mono" title={e.actor}>
                        {short(e.actor)}
                      </small>
                    </td>
                    <td className="nowrap">
                      {Number(e.amount) > 0 ? `${eth(e.amount)} ETH` : '—'}
                    </td>
                    <td className="nowrap muted">{date(e.timestamp)}</td>
                    <td className="mono" title={e.hash || 'Transaction hash unavailable'}>
                      {e.hash ? short(e.hash) : 'Unavailable'}
                    </td>
                    <td>
                      <Badge
                        tone={
                          e.status === 'Confirmed' ? 'green' : e.status === 'Failed' ? 'red' : ''
                        }
                      >
                        {e.status}
                      </Badge>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`View ${e.action} record`}
                        onClick={() => {
                          setSelected(e);
                          setVerification(null);
                        }}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No matching activity"
            description="Try adjusting your filters, or take an action in a partnership."
          />
        )}
      </Panel>
      {selected && (
        <Modal
          title={selected.action}
          description="The details behind this partnership record."
          close={() => {
            setSelected(null);
            setVerification(null);
          }}
        >
          <dl className="record-details">
            {[
              ['Partnership', selected.partnershipName],
              ['Actor', selected.actorName],
              ['Wallet', selected.actor],
              ['Amount', `${selected.amount} ETH`],
              ['Timestamp', date(selected.timestamp)],
              ['Status', selected.status],
              ['Transaction hash', selected.hash || 'Not available'],
              ['Block', selected.blockNumber || 'Not applicable'],
              ['Record ID', selected.id],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={k.includes('hash') || k === 'Wallet' ? 'mono break-all' : ''}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {verification && (
            <Notice tone={verification.verified ? 'success' : 'warning'}>
              {verification.message}
              {verification.blockNumber && ` Block ${verification.blockNumber}.`}
            </Notice>
          )}
          <div className="form-footer">
            <Button
              variant="ghost"
              onClick={() => navigate(`/partnership/${selected.partnershipId}`)}
            >
              Open partnership
            </Button>
            {user.role === 'auditor' && (
              <Button icon={ShieldCheck} busy={busy} onClick={verify}>
                Verify receipt
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
