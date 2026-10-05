import React, { useState } from 'react';
import { parseEther, formatEther } from 'ethers';
import {
  ArrowLeft,
  Fingerprint,
  Landmark,
  Receipt,
  TrendingUp,
  Vote,
  DoorOpen,
  Plus,
  Check,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  FileText,
  Wallet,
  X,
} from 'lucide-react';
import {
  PageTitle,
  Panel,
  Badge,
  Button,
  Avatar,
  Address,
  short,
  eth,
  date,
  same,
  Progress,
  Notice,
  Modal,
  Field,
  Empty,
} from './ui';
const TABS = [
  { key: 'agreement', label: 'Agreement & signatures', icon: Fingerprint },
  { key: 'capital', label: 'Capital vault', icon: Landmark },
  { key: 'expenses', label: 'Multi-sig expenses', icon: Receipt },
  { key: 'revenue', label: 'Revenue & profit', icon: TrendingUp },
  { key: 'governance', label: 'Governance & voting', icon: Vote },
  { key: 'exit', label: 'Exit & buyout', icon: DoorOpen },
];
function amountSplits(amount, members) {
  try {
    const total = members.reduce((n, x) => n + x.weight, 0),
      value = parseEther(amount || '0');
    if (value < 0n || !total) return [];
    let paid = 0n;
    return members.map((x, i) => {
      const share =
        i === members.length - 1 ? value - paid : (value * BigInt(x.weight)) / BigInt(total);
      paid += share;
      return { ...x, amount: formatEther(share) };
    });
  } catch {
    return [];
  }
}
function ActionModal({ action, close, execute, p, me, config }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const names = {
    contribute: 'Deposit your contribution',
    proposeExpense: 'Propose an expense',
    revenue: 'Record new revenue',
    createProposal: 'Start a collective decision',
    requestExit: 'Request a partner exit',
  };
  async function submit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await execute(action, data);
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={names[action]}
      description={'Your connected wallet will sign a local blockchain transaction.'}
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        {['proposeExpense', 'createProposal'].includes(action) && (
          <>
            <Field
              label="Title"
              name="title"
              required
              maxLength={120}
              placeholder={
                action === 'proposeExpense'
                  ? 'e.g. Product design retainer'
                  : 'e.g. Expand into a new market'
              }
            />
            <Field label="Description">
              <textarea
                name="description"
                rows={3}
                maxLength={2000}
                placeholder="Give your partners the context they need."
              />
            </Field>
          </>
        )}
        {action === 'proposeExpense' && (
          <Field
            label="Recipient wallet"
            name="recipient"
            required
            placeholder="0x…"
            pattern="0x[a-fA-F0-9]{40}"
          />
        )}
        {action !== 'createProposal' && (
          <Field
            label={action === 'requestExit' ? 'Proposed settlement (ETH)' : 'Amount (ETH)'}
            name="amount"
            required
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={
              action === 'contribute'
                ? formatEther(parseEther(me.expected) - parseEther(me.deposited))
                : undefined
            }
            hint={
              action === 'contribute'
                ? `Remaining obligation: ${eth(Number(me.expected) - Number(me.deposited))} ETH`
                : undefined
            }
          />
        )}{' '}
        {action === 'createProposal' && (
          <Field
            label="Voting period (days)"
            name="days"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            required
          />
        )}
        {action === 'requestExit' && (
          <Field label="Reason for leaving">
            <textarea
              name="reason"
              rows={3}
              maxLength={2000}
              placeholder="Share a note with your partners."
            />
          </Field>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <Button variant="ghost" type="button" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} type="submit" icon={ArrowRight}>
            {action === 'contribute'
              ? 'Deposit contribution'
              : action === 'revenue'
                ? 'Record revenue'
                : action === 'requestExit'
                  ? 'Submit exit request'
                  : 'Submit proposal'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export default function Detail({
  partnership: p,
  user,
  config,
  wallet,
  act,
  events,
  navigate,
  notify,
  busy,
  connectWallet,
}) {
  const [tab, setTab] = useState('agreement'),
    [modal, setModal] = useState(null),
    [distribution, setDistribution] = useState(''),
    [confirm, setConfirm] = useState(null);
  const members = p.partners.filter((x) => !x.exited),
    me = members.find((x) => same(x.wallet, user.wallet)),
    permitted = user.role !== 'auditor' && Boolean(me),
    ready = permitted && Boolean(wallet),
    active = p.status === 'Active',
    expired = new Date(p.endsAt) < new Date(),
    operational = ready && active && !expired,
    quorum = Math.ceil((members.length * p.quorum) / 100),
    signed = p.partners.filter((x) => x.signed).length;
  async function execute(action, data) {
    return act(p, action, data);
  }
  function run(action, data) {
    execute(action, data).catch(() => {});
  }
  const approvalCount = (list) => list.filter((w) => members.some((x) => same(x.wallet, w))).length;
  const split = amountSplits(distribution, members),
    totalWeight = members.reduce((n, x) => n + x.weight, 0);
  let validDistribution = false;
  try {
    const amount = parseEther(distribution || '0');
    validDistribution =
      amount > 0n && amount <= parseEther(p.profitReserve) && amount <= parseEther(p.treasury);
  } catch {
    /* Keep malformed input in the form so the user can correct it. */
  }
  const contribution = p.partners.reduce((n, x) => n + Number(x.deposited), 0),
    expected = p.partners.reduce((n, x) => n + Number(x.expected), 0);
  function actionConfirm(title, action, data, explanation) {
    setConfirm({ title, action, data, explanation });
  }
  return (
    <>
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} />
        Back to partnerships
      </button>
      <div className="detail-heading">
        <div className="detail-status">
          <Badge tone={active ? 'green' : 'amber'}>{p.status}</Badge>
          <span>{p.category}</span>
          <span className="detail-rule">
            <ShieldCheck size={13} />
            {p.quorum}% approval quorum
          </span>
        </div>
        <div className="detail-title-row">
          <h1>{p.name}</h1>
          <div className="detail-treasury">
            <span>PARTNERSHIP TREASURY</span>
            <strong>
              {eth(p.treasury)} <small>ETH</small>
            </strong>
          </div>
        </div>
        <p>{p.description}</p>
        <div className="detail-meta">
          <Address value={p.address} notify={notify} />
          <span>
            <UsersIcon /> {members.length} current partners
          </span>
          <span>
            <Clock3 size={13} />
            Until {new Date(p.endsAt).toLocaleDateString('en-IN')}
          </span>
        </div>
      </div>
      {!permitted && (
        <Notice>
          {user.role === 'auditor'
            ? 'Auditor view: inspect this partnership and its records. Financial actions are restricted to current partners.'
            : 'Your partner exit is settled. You can continue to read the partnership and its audit history.'}
        </Notice>
      )}
      {permitted && config.mode === 'chain' && !wallet && (
        <Notice tone="warning">
          Connect your verified wallet to sign or submit transactions.{' '}
          <button className="text-button" onClick={connectWallet}>
            Connect wallet
          </button>
        </Notice>
      )}
      {expired && (
        <Notice tone="warning">
          The partnership has reached its end date. Funding, expenses, revenue, and new voting are
          closed. Exit settlement and proposal closure remain available.
        </Notice>
      )}
      <div className="detail-tabs" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            aria-controls="module-panel"
            onClick={() => setTab(key)}
            className={tab === key ? 'selected' : ''}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div id="module-panel" role="tabpanel">
        {tab !== 'agreement' && !active && (
          <div className="activation-gate">
            <span>
              <Fingerprint size={26} />
            </span>
            <h2>A shared agreement comes first.</h2>
            <p>
              All {p.partners.length} partners must sign before funding, expenses, revenue, voting,
              and exits become available.
            </p>
            <Progress
              value={(signed / p.partners.length) * 100}
              label={`${signed} of ${p.partners.length} signatures`}
            />
            <Button onClick={() => setTab('agreement')} icon={ArrowRight}>
              Review the agreement
            </Button>
          </div>
        )}
        {tab === 'agreement' && (
          <div className="module-grid">
            <Panel
              title="The partnership charter"
              caption="A clear foundation for everything you do together."
            >
              <div className="charter">
                <div className="charter-document">
                  <FileText size={22} />
                  <div>
                    <strong>{p.name}</strong>
                    <small>PARTNERSHIP AGREEMENT · V1.0</small>
                  </div>
                </div>
                <p>
                  The partners agree to operate <strong>{p.name}</strong> with transparent capital
                  commitments, collective expense approvals, and ownership-based profit sharing.
                </p>
                <div className="charter-clause">
                  <span>01</span>
                  <div>
                    <h3>Shared ownership & capital</h3>
                    <p>
                      Capital commitments and ownership are listed alongside each partner.
                      Contributions remain capital and cannot be distributed as profit.
                    </p>
                  </div>
                </div>
                <div className="charter-clause">
                  <span>02</span>
                  <div>
                    <h3>Collective approval</h3>
                    <p>
                      Activation requires every partner’s signature. Expenses require {p.quorum}% of
                      current partners ({quorum} approvals). Governance uses ownership-weighted
                      votes.
                    </p>
                  </div>
                </div>
                <div className="charter-clause">
                  <span>03</span>
                  <div>
                    <h3>Profit & settlement</h3>
                    <p>
                      Distributable profit comes from revenue after expenses and prior
                      distributions. Exits require {p.quorum}% approval from the remaining partners;
                      their effective ownership is normalized after settlement.
                    </p>
                  </div>
                </div>
                <div className="charter-clause">
                  <span>04</span>
                  <div>
                    <h3>Duration & transparency</h3>
                    <p>
                      The operating period ends on {new Date(p.endsAt).toLocaleDateString('en-IN')}.
                      Actions are recorded in the audit trail. The charter is a prototype operating
                      agreement.
                    </p>
                  </div>
                </div>
              </div>
            </Panel>
            <div>
              <Panel
                title="Partner signatures"
                caption={`${signed} of ${p.partners.length} partners have signed.`}
              >
                <div className="signature-list">
                  {p.partners.map((x, i) => (
                    <div key={x.wallet}>
                      <Avatar name={x.name} index={i} />
                      <div>
                        <strong>
                          {x.name}
                          {same(x.wallet, user.wallet) && <small className="you-label">YOU</small>}
                        </strong>
                        <span className="mono">{short(x.wallet)}</span>
                        <small>{x.weight / 100}% original ownership</small>
                      </div>
                      <Badge tone={x.signed ? 'green' : 'amber'}>
                        {x.signed ? <Check size={12} /> : <Clock3 size={12} />}{' '}
                        {x.signed ? 'Signed' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="signature-progress">
                  <Progress
                    value={(signed / p.partners.length) * 100}
                    label="Activation progress"
                  />
                  {active ? (
                    <div className="signature-success">
                      <CheckCircle2 size={16} />
                      Agreement complete. Your venture is active.
                    </div>
                  ) : me?.signed ? (
                    <Notice>
                      Your signature is recorded. Ask the other partners to sign using their own
                      accounts.
                    </Notice>
                  ) : (
                    <Button
                      disabled={!ready || busy || expired}
                      icon={Fingerprint}
                      onClick={() =>
                        actionConfirm(
                          'Sign the partnership agreement',
                          'sign',
                          {},
                          'Confirm that you have reviewed the charter, ownership, contributions, quorum, and duration.',
                        )
                      }
                    >
                      Sign agreement
                    </Button>
                  )}
                </div>
              </Panel>
              <div className="small-note">
                <ShieldCheck size={16} />
                Each partner signs with their own verified wallet. The contract records the
                approval.
              </div>
            </div>
          </div>
        )}
        {active && tab === 'capital' && (
          <>
            <div className="module-summary">
              <div>
                <small>EXPECTED CAPITAL</small>
                <strong>
                  {eth(expected)} <span>ETH</span>
                </strong>
              </div>
              <div>
                <small>DEPOSITED</small>
                <strong>
                  {eth(contribution)} <span>ETH</span>
                </strong>
              </div>
              <div>
                <small>REMAINING</small>
                <strong>
                  {eth(expected - contribution)} <span>ETH</span>
                </strong>
              </div>
              <Button
                icon={Plus}
                disabled={!operational || busy || Number(me?.deposited) >= Number(me?.expected)}
                onClick={() => setModal('contribute')}
              >
                Deposit contribution
              </Button>
            </div>
            <Panel
              title="Capital commitments"
              caption="What each partner pledged. What each partner has contributed."
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Partner</th>
                      <th>Expected</th>
                      <th>Deposited</th>
                      <th>Remaining</th>
                      <th>Funding progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.partners.map((x, i) => (
                      <tr key={x.wallet}>
                        <td>
                          <div className="table-person">
                            <Avatar name={x.name} index={i} small />
                            <div>
                              <strong>{x.name}</strong>
                              <small>
                                {short(x.wallet)}
                                {x.exited && ' · Exited'}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>{eth(x.expected)} ETH</td>
                        <td>{eth(x.deposited)} ETH</td>
                        <td>{eth(Number(x.expected) - Number(x.deposited))} ETH</td>
                        <td>
                          <Progress
                            value={(Number(x.deposited) / Number(x.expected)) * 100}
                            label={
                              Number(x.deposited) >= Number(x.expected) ? 'Complete' : 'In progress'
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <History
              events={events.filter((x) => x.action === 'Contribution')}
              navigate={navigate}
            />
          </>
        )}
        {active && tab === 'expenses' && (
          <Panel
            title="Shared spending, shared approval"
            caption={`Expenses require ${quorum} of ${members.length} partner approvals before execution.`}
            action={
              <Button
                icon={Plus}
                disabled={!operational || busy}
                onClick={() => setModal('proposeExpense')}
              >
                Propose expense
              </Button>
            }
          >
            {p.expenses.length ? (
              <div className="proposal-list">
                {[...p.expenses].reverse().map((e) => {
                  const count = approvalCount(e.approvals),
                    voted = [...e.approvals, ...e.rejections].some((w) => same(w, user.wallet));
                  return (
                    <article className="proposal-card" key={e.id}>
                      <div className="proposal-top">
                        <div>
                          <div className="eyebrow">EXPENSE #{e.id + 1}</div>
                          <h3>{e.title}</h3>
                        </div>
                        <Badge
                          tone={
                            e.executed
                              ? 'green'
                              : e.cancelled
                                ? 'red'
                                : count >= quorum
                                  ? 'green'
                                  : 'amber'
                          }
                        >
                          {e.executed
                            ? 'Executed'
                            : e.cancelled
                              ? 'Rejected'
                              : count >= quorum
                                ? 'Ready to execute'
                                : 'Pending approval'}
                        </Badge>
                      </div>
                      <p>{e.description}</p>
                      <div className="proposal-facts">
                        <div>
                          <small>AMOUNT</small>
                          <strong>{eth(e.amount)} ETH</strong>
                        </div>
                        <div>
                          <small>RECIPIENT</small>
                          <span className="mono" title={e.recipient}>
                            {short(e.recipient)}
                          </span>
                        </div>
                        <div>
                          <small>APPROVALS</small>
                          <strong>
                            {count} / {quorum}
                          </strong>
                        </div>
                      </div>
                      <Progress value={(count / quorum) * 100} />
                      <div className="proposal-actions">
                        <span>
                          {e.executed
                            ? 'Payment recorded in the audit trail.'
                            : e.cancelled
                              ? 'The required approval threshold can no longer be reached.'
                              : voted
                                ? 'Your vote has been recorded.'
                                : 'Review the expense and cast your approval.'}
                        </span>
                        {!e.executed && !e.cancelled && (
                          <div>
                            <Button
                              variant="ghost"
                              disabled={!operational || busy || voted}
                              icon={X}
                              onClick={() => run('rejectExpense', { id: e.id })}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={!operational || busy || voted}
                              icon={Check}
                              onClick={() => run('approveExpense', { id: e.id })}
                            >
                              Approve
                            </Button>
                            {count >= quorum && (
                              <Button
                                disabled={!operational || busy}
                                onClick={() =>
                                  actionConfirm(
                                    'Execute this expense',
                                    'executeExpense',
                                    { id: e.id },
                                    `Transfer ${e.amount} ETH from the treasury to ${e.recipient}.`,
                                  )
                                }
                              >
                                Execute expense
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty
                icon={Receipt}
                title="Spend with collective confidence"
                description="Propose an expense, gather partner approvals, and execute it when quorum is reached."
              />
            )}
          </Panel>
        )}
        {active && tab === 'revenue' && (
          <>
            <div className="module-summary">
              <div>
                <small>TOTAL REVENUE</small>
                <strong>
                  {eth(p.revenue)} <span>ETH</span>
                </strong>
              </div>
              <div>
                <small>EXECUTED EXPENSES</small>
                <strong>
                  {eth(p.spent)} <span>ETH</span>
                </strong>
              </div>
              <div>
                <small>DISTRIBUTABLE PROFIT</small>
                <strong className="text-green">
                  {eth(p.profitReserve)} <span>ETH</span>
                </strong>
              </div>
              <Button
                icon={Plus}
                disabled={!operational || busy}
                onClick={() => setModal('revenue')}
              >
                Record revenue
              </Button>
            </div>
            <div className="module-grid">
              <Panel
                title="Share the upside"
                caption="Preview ownership-based payouts before distributing."
              >
                <div className="distribution-form">
                  <Field
                    label="Distribution amount (ETH)"
                    placeholder="0.00"
                    inputMode="decimal"
                    value={distribution}
                    onChange={(e) => setDistribution(e.target.value)}
                    hint={`Available profit: ${eth(p.profitReserve)} ETH. Capital contributions are excluded.`}
                  />
                  <div className="split-list">
                    {members.map((x, i) => (
                      <div key={x.wallet}>
                        <Avatar name={x.name} index={i} />
                        <div>
                          <strong>{x.name}</strong>
                          <small>
                            {((x.weight / totalWeight) * 100).toFixed(2)}% effective share
                          </small>
                        </div>
                        <strong>
                          {eth(split[i]?.amount || 0, 8)} <small>ETH</small>
                        </strong>
                      </div>
                    ))}
                  </div>
                  <Button
                    disabled={!operational || busy || !split.length || !validDistribution}
                    icon={TrendingUp}
                    onClick={() =>
                      actionConfirm(
                        'Confirm profit distribution',
                        'distribute',
                        { amount: distribution },
                        `Distribute ${distribution} ETH to ${members.length} current partners at the shares shown. The final partner receives any wei rounding remainder.`,
                      )
                    }
                  >
                    Execute distribution
                  </Button>
                </div>
              </Panel>
              <Panel title="The numbers behind the split">
                <div className="financial-breakdown">
                  <div>
                    <span>Revenue received</span>
                    <strong>{eth(p.revenue)} ETH</strong>
                  </div>
                  <div>
                    <span>Expenses executed</span>
                    <strong>{eth(p.spent)} ETH</strong>
                  </div>
                  <div>
                    <span>Previously distributed</span>
                    <strong>{eth(p.distributed)} ETH</strong>
                  </div>
                  <div>
                    <span>Settled buyouts</span>
                    <strong>{eth(p.settledTotal || '0')} ETH</strong>
                  </div>
                  <div>
                    <span>Available profit reserve</span>
                    <strong className="text-green">{eth(p.profitReserve)} ETH</strong>
                  </div>
                  <div>
                    <span>Total treasury</span>
                    <strong>{eth(p.treasury)} ETH</strong>
                  </div>
                </div>
                <Notice>
                  Available profit is revenue minus executed expenses, earlier distributions, and
                  settled buyouts. Later revenue recoups spending from capital before it becomes
                  profit. Payouts cannot exceed the treasury.
                </Notice>
              </Panel>
            </div>
            <History
              events={events.filter((x) => ['Revenue', 'Profit distributed'].includes(x.action))}
              navigate={navigate}
            />
          </>
        )}
        {active && tab === 'governance' && (
          <Panel
            title="Make your next move, together"
            caption={`Votes are weighted by ownership. Passing requires ${p.quorum}% of the proposal’s snapshot ownership.`}
            action={
              <Button
                icon={Plus}
                disabled={!operational || busy}
                onClick={() => setModal('createProposal')}
              >
                New proposal
              </Button>
            }
          >
            {p.proposals.length ? (
              <div className="proposal-list">
                {[...p.proposals].reverse().map((g) => {
                  const voted = Boolean(g.votes[user.wallet?.toLowerCase()]),
                    passed = g.forWeight * 100 >= g.totalWeight * g.threshold,
                    rejected = g.againstWeight * 100 > g.totalWeight * (100 - g.threshold),
                    ended = new Date(g.deadline) <= new Date(),
                    canClose = passed || rejected || ended;
                  return (
                    <article className="proposal-card" key={g.id}>
                      <div className="proposal-top">
                        <div>
                          <div className="eyebrow">DECISION #{g.id + 1}</div>
                          <h3>{g.title}</h3>
                        </div>
                        <Badge tone={g.closed ? (g.passed ? 'green' : 'red') : 'amber'}>
                          {g.closed
                            ? g.passed
                              ? 'Passed'
                              : 'Rejected'
                            : canClose
                              ? 'Ready to close'
                              : 'Voting open'}
                        </Badge>
                      </div>
                      <p>{g.description}</p>
                      <div className="vote-bars">
                        <Progress value={(g.forWeight / g.totalWeight) * 100} label="For" />
                        <div className="against">
                          <Progress
                            value={(g.againstWeight / g.totalWeight) * 100}
                            label="Against"
                          />
                        </div>
                      </div>
                      <div className="proposal-actions">
                        <span>
                          <Clock3 size={13} />
                          Deadline: {date(g.deadline)}
                        </span>
                        {!g.closed && (
                          <div>
                            <Button
                              variant="ghost"
                              disabled={!operational || busy || voted || ended}
                              onClick={() => run('vote', { id: g.id, support: false })}
                            >
                              Vote against
                            </Button>
                            <Button
                              variant="secondary"
                              icon={Check}
                              disabled={!operational || busy || voted || ended}
                              onClick={() => run('vote', { id: g.id, support: true })}
                            >
                              Vote for
                            </Button>
                            {canClose && (
                              <Button
                                disabled={!ready || busy}
                                onClick={() => run('closeProposal', { id: g.id })}
                              >
                                Close decision
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {voted && <small className="text-green">Your vote has been recorded.</small>}
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty
                icon={Vote}
                title="Every voice has a stake"
                description="Create a business proposal and let your partners vote. Outcomes are recorded decisions; they do not change contract rules automatically."
              />
            )}
          </Panel>
        )}
        {active && tab === 'exit' && (
          <>
            <div className="module-grid">
              <Panel
                title="Leave on clear terms"
                caption="A structured exit protects both the partner and the venture."
              >
                <div className="exit-intro">
                  <DoorOpen size={30} />
                  <p>
                    Propose a settlement, gather approval from the other partners, and complete your
                    buyout from the treasury.
                  </p>
                  {me && (
                    <div className="review-rules">
                      <div>
                        <small>YOUR CURRENT SHARE</small>
                        <strong>{((me.weight / totalWeight) * 100).toFixed(2)}%</strong>
                      </div>
                      <div>
                        <small>YOUR CONTRIBUTION</small>
                        <strong>{eth(me.deposited)} ETH</strong>
                      </div>
                    </div>
                  )}
                  <Button
                    disabled={
                      !ready ||
                      busy ||
                      members.length <= 1 ||
                      p.exits.some((e) => same(e.partner, user.wallet) && !e.settled)
                    }
                    icon={DoorOpen}
                    onClick={() => setModal('requestExit')}
                  >
                    Request exit
                  </Button>
                </div>
              </Panel>
              <Panel title="How settlement works">
                <div className="settlement-steps">
                  {[
                    'Submit your proposed settlement and reason.',
                    'Other partners approve under the quorum rule.',
                    'An eligible partner executes the settlement.',
                    'Your membership closes; remaining ownership is normalized.',
                  ].map((s, i) => (
                    <div key={s}>
                      <span>{i + 1}</span>
                      <p>{s}</p>
                    </div>
                  ))}
                </div>
                <Notice>
                  The last remaining partner cannot exit. Settlement requires enough treasury
                  balance and cannot be approved by the exiting partner.
                </Notice>
              </Panel>
            </div>
            <Panel title="Exit requests" caption="A transparent record of partner transitions.">
              {p.exits.length ? (
                <div className="proposal-list">
                  {[...p.exits].reverse().map((e) => {
                    const name = p.partners.find((x) => same(x.wallet, e.partner))?.name,
                      count = approvalCount(e.approvals),
                      needed = Math.ceil(((members.length - 1) * p.quorum) / 100);
                    return (
                      <article className="proposal-card" key={e.id}>
                        <div className="proposal-top">
                          <h3>{name}’s exit request</h3>
                          <Badge tone={e.settled ? 'green' : 'amber'}>
                            {e.settled ? 'Settled' : 'Awaiting settlement'}
                          </Badge>
                        </div>
                        <p>{e.reason || 'No additional reason provided.'}</p>
                        <div className="proposal-facts">
                          <div>
                            <small>SETTLEMENT</small>
                            <strong>{eth(e.amount)} ETH</strong>
                          </div>
                          <div>
                            <small>APPROVALS</small>
                            <strong>{e.settled ? 'Complete' : `${count} / ${needed}`}</strong>
                          </div>
                        </div>
                        {!e.settled && (
                          <div className="proposal-actions">
                            <span>Remaining partners approve the buyout.</span>
                            <div>
                              <Button
                                variant="secondary"
                                disabled={
                                  !ready ||
                                  busy ||
                                  same(e.partner, user.wallet) ||
                                  e.approvals.some((w) => same(w, user.wallet))
                                }
                                onClick={() => run('approveExit', { id: e.id })}
                              >
                                Approve exit
                              </Button>
                              {count >= needed && (
                                <Button
                                  disabled={!ready || busy}
                                  onClick={() =>
                                    actionConfirm(
                                      'Settle this partner exit',
                                      'settleExit',
                                      { id: e.id },
                                      `Transfer ${e.amount} ETH to ${name}. Their membership will end and the remaining effective ownership shares will be normalized.`,
                                    )
                                  }
                                >
                                  Settle exit
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title="No exit requests"
                  description="When a partner is ready for their next chapter, their request will appear here."
                />
              )}
            </Panel>
          </>
        )}
      </div>
      {modal && (
        <ActionModal
          action={modal}
          close={() => setModal(null)}
          execute={execute}
          p={p}
          me={me}
          config={config}
        />
      )}{' '}
      {confirm && (
        <ConfirmModal
          confirm={confirm}
          busy={busy}
          close={() => setConfirm(null)}
          execute={execute}
        />
      )}
    </>
  );
}
function UsersIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m0 5a5 5 0 0 1 4 5" />
    </svg>
  );
}
function ConfirmModal({ confirm, close, execute, busy }) {
  const [error, setError] = useState('');
  return (
    <Modal
      title={confirm.title}
      description={confirm.explanation}
      close={() => {
        if (!busy) close();
      }}
    >
      <Notice>
        Review the details before confirming. The action will appear in the partnership’s audit
        history.
      </Notice>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="form-footer">
        <Button variant="ghost" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          busy={busy}
          icon={Check}
          onClick={async () => {
            try {
              await execute(confirm.action, confirm.data);
              close();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Confirm action
        </Button>
      </div>
    </Modal>
  );
}
function History({ events, navigate }) {
  return (
    <Panel
      className="history-panel"
      title="Recent records"
      action={
        <Button variant="ghost" icon={ArrowUpRight} onClick={() => navigate('/audit')}>
          Audit explorer
        </Button>
      }
    >
      {events.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Partner</th>
                <th>Amount</th>
                <th>Timestamp</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <td>{e.action}</td>
                  <td>{e.actorName}</td>
                  <td>{eth(e.amount)} ETH</td>
                  <td>{date(e.timestamp)}</td>
                  <td>
                    <Badge tone={e.mode === 'chain' ? 'green' : ''}>{e.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No records yet"
          description="Confirmed actions in this module will appear here."
        />
      )}
    </Panel>
  );
}
