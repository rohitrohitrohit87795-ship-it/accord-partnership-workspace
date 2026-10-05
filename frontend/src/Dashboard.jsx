import React, { useState } from 'react';
import {
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  Layers3,
  Landmark,
  TrendingUp,
  Fingerprint,
  FileText,
  Clock3,
  Users,
  ShieldCheck,
} from 'lucide-react';
import {
  PageTitle,
  Stat,
  Button,
  Badge,
  Panel,
  Avatar,
  Address,
  eth,
  date,
  Empty,
  Loading,
} from './ui';
export default function Dashboard({
  user,
  config,
  partnerships,
  events,
  loading,
  navigate,
  notify,
}) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('All');
  const filtered = partnerships.filter(
    (p) =>
      (filter === 'All' || p.status === filter) &&
      `${p.name} ${p.address || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const treasury = partnerships.reduce((n, p) => n + Number(p.treasury), 0),
    dividends = partnerships.reduce((n, p) => n + Number(p.distributed), 0),
    active = partnerships.filter((p) => p.status === 'Active').length;
  return (
    <>
      <PageTitle
        eyebrow="YOUR SHARED AMBITION, IN ONE PLACE"
        title={`Good to see you, ${user.name.split(' ')[0]}.`}
        description="A clear view of your ventures. A shared path forward."
      >
        {user.role !== 'auditor' && (
          <Button icon={Plus} onClick={() => navigate('/create')}>
            New partnership
          </Button>
        )}
      </PageTitle>
      <div className="stats-grid">
        <Stat
          label="Total partnerships"
          value={partnerships.length.toString().padStart(2, '0')}
          icon={Layers3}
          detail={
            <>
              <span className="tiny-dot green" />
              {active} active · {partnerships.length - active} awaiting signatures
            </>
          }
        />
        <Stat
          label="Treasury reserves"
          value={eth(treasury)}
          unit="ETH"
          icon={Landmark}
          detail="Combined balance across your ventures"
        />
        <Stat
          label="Dividends distributed"
          value={eth(dividends)}
          unit="ETH"
          icon={TrendingUp}
          detail="Profit shared with your partners"
        />
        <Stat
          label="Consensus engine"
          value="Multi-sig"
          icon={Fingerprint}
          detail={
            <>
              <span className="tiny-dot green" />
              Collective approval, built in
            </>
          }
        />
      </div>
      <div className="dashboard-grid">
        <section className="partnership-section">
          <div className="section-heading">
            <div>
              <h2>
                Your partnerships <span className="count">{partnerships.length}</span>
              </h2>
              <p>Ideas become ventures. Ventures become shared success.</p>
            </div>
          </div>
          <div className="list-controls">
            <div className="segmented">
              {['All', 'Active', 'Proposed'].map((f) => (
                <button
                  key={f}
                  className={filter === f ? 'selected' : ''}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Search partnerships"
                placeholder="Search name or contract…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {loading && !partnerships.length ? (
            <Loading />
          ) : filtered.length ? (
            <div className="partnership-grid">
              {filtered.map((p, index) => (
                <article className="partnership-card" key={p.id}>
                  <div className="card-top">
                    <span className={`venture-icon venture-${index % 3}`}>
                      <Layers3 size={24} />
                    </span>
                    <Badge tone={p.status === 'Active' ? 'green' : 'amber'}>
                      <span className="tiny-dot" />
                      {p.status}
                    </Badge>
                  </div>
                  <div className="card-category">{p.category}</div>
                  <button className="card-title" onClick={() => navigate(`/partnership/${p.id}`)}>
                    {p.name}
                    <ArrowUpRight size={20} />
                  </button>
                  <p className="card-description">{p.description}</p>
                  <Address value={p.address} notify={notify} />
                  <div className="card-metrics">
                    <div>
                      <span>Treasury</span>
                      <strong>
                        {eth(p.treasury)} <small>ETH</small>
                      </strong>
                    </div>
                    <div>
                      <span>Quorum</span>
                      <strong>
                        {p.quorum}
                        <small>%</small>
                      </strong>
                    </div>
                  </div>
                  <div className="card-bottom">
                    <div className="partner-stack">
                      {p.partners
                        .filter((x) => !x.exited)
                        .slice(0, 3)
                        .map((x, i) => (
                          <Avatar key={x.wallet} name={x.name} index={i} small />
                        ))}
                      <span>{p.partners.filter((x) => !x.exited).length} partners</span>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Open ${p.name}`}
                      onClick={() => navigate(`/partnership/${p.id}`)}
                    >
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </article>
              ))}
              {user.role !== 'auditor' && filter === 'All' && !query && (
                <button className="new-partnership-card" onClick={() => navigate('/create')}>
                  <span>
                    <Plus size={25} />
                  </span>
                  <h3>Your next venture starts here</h3>
                  <p>
                    Bring your people, define your terms,
                    <br />
                    and build something together.
                  </p>
                  <strong>
                    Create a partnership <ArrowRight size={14} />
                  </strong>
                </button>
              )}
            </div>
          ) : (
            <Panel>
              <Empty
                title={
                  query || filter !== 'All'
                    ? 'No matching partnerships'
                    : 'Make room for your next idea'
                }
                description={
                  query || filter !== 'All'
                    ? 'Try another search or filter.'
                    : config.mode === 'chain' && !user.wallet
                      ? 'Connect your wallet, then create your first partnership.'
                      : 'Create your first partnership to start working together.'
                }
                action={
                  user.role !== 'auditor' && (
                    <Button onClick={() => navigate('/create')} icon={Plus}>
                      Create partnership
                    </Button>
                  )
                }
              />
            </Panel>
          )}
        </section>
        <aside className="activity-column">
          <Panel
            title="Recent activity"
            action={
              <span className="live-label">
                <span className="tiny-dot green" />
                ON-CHAIN
              </span>
            }
          >
            {events.length ? (
              <div className="activity-list">
                {events.slice(0, 5).map((e, i) => (
                  <button key={e.id} onClick={() => navigate(`/partnership/${e.partnershipId}`)}>
                    <span className="activity-icon">
                      {e.action.includes('sign') ? (
                        <Fingerprint size={15} />
                      ) : e.action.includes('Revenue') || e.action.includes('Contribution') ? (
                        <Landmark size={15} />
                      ) : (
                        <Clock3 size={15} />
                      )}
                    </span>
                    <div>
                      <strong>{e.action}</strong>
                      <span>{e.partnershipName}</span>
                      <small>{date(e.timestamp)}</small>
                    </div>
                    {Number(e.amount) > 0 && (
                      <b>
                        {eth(e.amount)}
                        <small> ETH</small>
                      </b>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Your story starts here"
                description="Partnership activity will appear as you take action."
              />
            )}
            <button className="panel-link" onClick={() => navigate('/audit')}>
              View all activity
              <ArrowUpRight size={15} />
            </button>
          </Panel>
          <div className="trust-card">
            <ShieldCheck size={25} />
            <h3>
              Trust is a shared
              <br />
              responsibility.
            </h3>
            <p>
              Every approval, contribution, and decision is recorded in your partnership’s audit
              trail.
            </p>
            <button onClick={() => navigate('/help')}>
              How Accord works <ArrowUpRight size={14} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
