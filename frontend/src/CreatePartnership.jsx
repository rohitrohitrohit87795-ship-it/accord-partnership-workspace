import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  ShieldCheck,
  Users,
  FileText,
  Wallet,
  Layers3,
} from 'lucide-react';
import { isAddress, parseEther } from 'ethers';
import { Button, Field, PageTitle, Panel, Badge, Avatar, short, eth, Notice } from './ui';
import { post } from './api';
import { localDate, endOfDay } from './dates.mjs';
export default function CreatePartnership({ user, config, create, navigate, reload, notify }) {
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmedHash, setConfirmedHash] = useState(null);
  const [today, setToday] = useState(() => localDate());
  useEffect(() => {
    let timer;
    function updateToday() {
      const now = new Date();
      setToday(localDate(now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      clearTimeout(timer);
      timer = setTimeout(updateToday, midnight.getTime() - now.getTime() + 50);
    }
    updateToday();
    window.addEventListener('focus', updateToday);
    document.addEventListener('visibilitychange', updateToday);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', updateToday);
      document.removeEventListener('visibilitychange', updateToday);
    };
  }, []);
  const [form, setForm] = useState({
    name: '',
    category: 'Technology',
    description: '',
    quorum: '66',
    endsAt: localDate(new Date(Date.now() + 365 * 86400000)),
    partners: [
      { name: user.name, wallet: user.wallet || '', expected: '', ownership: '50' },
      { name: '', wallet: '', expected: '', ownership: '50' },
    ],
  });
  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError('');
  };
  const updatePartner = (i, key, value) =>
    set(
      'partners',
      form.partners.map((p, n) => (n === i ? { ...p, [key]: value } : p)),
    );
  function validate(which = step) {
    if (which === 0 || which === 2) {
      if (form.name.trim().length < 2 || form.name.length > 100)
        return 'Use a partnership name with 2–100 characters.';
      if (form.description.trim().length < 10 || form.description.length > 2000)
        return 'Describe your partnership in 10–2000 characters.';
      const end = endOfDay(form.endsAt);
      if (!end || form.endsAt < localDate() || end.getTime() <= Date.now())
        return 'Choose today or a later end date.';
      if (
        Number(form.quorum) < 51 ||
        Number(form.quorum) > 100 ||
        !Number.isInteger(Number(form.quorum))
      )
        return 'Quorum must be a whole percentage between 51 and 100.';
    }
    if (which === 1 || which === 2) {
      if (!user.wallet) return 'Connect and verify your wallet before creating a partnership.';
      const seen = new Set();
      let total = 0;
      for (const p of form.partners) {
        if (!p.name.trim() || p.name.length > 80) return 'Enter a name for every partner.';
        if (!isAddress(p.wallet) || /^0x0{40}$/i.test(p.wallet))
          return 'Every partner needs a valid non-zero wallet address.';
        if (seen.has(p.wallet.toLowerCase())) return 'Partner wallets must be unique.';
        seen.add(p.wallet.toLowerCase());
        try {
          if (parseEther(String(p.expected)) <= 0n)
            return 'Each expected contribution must be positive.';
        } catch {
          return 'Enter valid ETH contributions with at most 18 decimal places.';
        }
        const weight = Number(p.ownership) * 100;
        if (!(weight > 0) || Math.abs(weight - Math.round(weight)) > 0.00001)
          return 'Ownership must be positive with at most 2 decimal places.';
        total += Math.round(weight);
      }
      if (total !== 10000) return 'Partner ownership must total exactly 100%.';
      if (!seen.has(user.wallet.toLowerCase()))
        return 'Include your connected wallet in the partner list.';
    }
  }
  function next() {
    const e = validate();
    if (e) setError(e);
    else {
      setError('');
      setStep((s) => s + 1);
    }
  }
  async function submit() {
    const e = validate(2);
    if (e) return setError(e);
    setBusy(true);
    setError('');
    try {
      const input = { ...form, endsAt: endOfDay(form.endsAt).toISOString() };
      if (confirmedHash) {
        const { partnership } = await post('/partnerships', { ...input, hash: confirmedHash });
        await reload();
        notify('Partnership metadata saved.');
        navigate(`/partnership/${partnership.id}`);
      } else await create(input);
    } catch (e) {
      if (e.confirmedHash) setConfirmedHash(e.confirmedHash);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} />
        Back to partnerships
      </button>
      <PageTitle
        eyebrow="TURN AN IDEA INTO A SHARED VENTURE"
        title="Create a partnership."
        description="Define the people, the capital, and the ground rules."
      />
      {config.mode === 'chain' && !user.wallet && (
        <Notice tone="warning">
          Connect your MetaMask wallet using the top-right button before continuing.
        </Notice>
      )}
      <div className="create-layout">
        <section>
          <div className="stepper">
            {['The basics', 'Partners & capital', 'Review & create'].map((label, i) => (
              <button
                disabled={busy || Boolean(confirmedHash) || i > step}
                key={label}
                onClick={() => {
                  setStep(i);
                  setError('');
                }}
                className={`${i === step ? 'current' : ''} ${i < step ? 'complete' : ''}`}
              >
                <span>{i < step ? <Check size={14} /> : i + 1}</span>
                {label}
              </button>
            ))}
          </div>
          <Panel
            className="create-panel"
            title={
              [
                'Give your venture an identity',
                'Bring your partners together',
                'A clear agreement, from day one',
              ][step]
            }
            caption={
              [
                'Start with what you’re building and how you’ll decide.',
                'Define each partner’s contribution and ownership.',
                'Review your terms before inviting partners to sign.',
              ][step]
            }
          >
            {step === 0 && (
              <div className="form-grid">
                <Field
                  label="Partnership name"
                  placeholder="Your partnership name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  maxLength={100}
                />
                <Field label="Category">
                  <select value={form.category} onChange={(e) => set('category', e.target.value)}>
                    {[
                      'Technology',
                      'Creative',
                      'Real estate',
                      'Commerce',
                      'Consulting',
                      'Business',
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Description">
                  <textarea
                    placeholder="What are you building together?"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    maxLength={2000}
                    rows={4}
                  />
                </Field>
                <div className="two-fields">
                  <Field
                    label="Partnership end date"
                    type="date"
                    min={today}
                    required
                    value={form.endsAt}
                    onChange={(e) => set('endsAt', e.target.value)}
                    hint="Choose today or a later date. Ends at 11:59:59 PM in your local time."
                  />
                  <Field
                    label="Approval quorum (%)"
                    type="number"
                    min={51}
                    max={100}
                    value={form.quorum}
                    onChange={(e) => set('quorum', e.target.value)}
                    hint="Expense approvals use partner count. Votes use ownership weight."
                  />
                </div>
              </div>
            )}
            {step === 1 && (
              <>
                <div className="partner-editor-list">
                  {form.partners.map((p, i) => (
                    <div className="partner-editor" key={i}>
                      <div className="partner-editor-heading">
                        <span className="number-chip">{String(i + 1).padStart(2, '0')}</span>
                        <h3>Partner {i + 1}</h3>
                        {i === 0 && <Badge>You</Badge>}
                        {form.partners.length > 2 && (
                          <button
                            className="icon-button"
                            aria-label={`Remove partner ${i + 1}`}
                            onClick={() =>
                              set(
                                'partners',
                                form.partners.filter((_, n) => n !== i),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                      <div className="two-fields">
                        <Field
                          label="Name"
                          value={p.name}
                          maxLength={80}
                          onChange={(e) => updatePartner(i, 'name', e.target.value)}
                        />
                        <Field
                          label="Wallet address"
                          placeholder="0x…"
                          value={p.wallet}
                          onChange={(e) => updatePartner(i, 'wallet', e.target.value)}
                        />
                      </div>
                      <div className="two-fields">
                        <Field
                          label="Expected capital (ETH)"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={p.expected}
                          onChange={(e) => updatePartner(i, 'expected', e.target.value)}
                        />
                        <Field
                          label="Ownership (%)"
                          inputMode="decimal"
                          value={p.ownership}
                          onChange={(e) => updatePartner(i, 'ownership', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="partner-editor-footer">
                  <Button
                    variant="secondary"
                    icon={Plus}
                    disabled={form.partners.length >= 20}
                    onClick={() =>
                      set('partners', [
                        ...form.partners,
                        { name: '', wallet: '', expected: '', ownership: '' },
                      ])
                    }
                  >
                    Add partner
                  </Button>
                  <span
                    className={
                      Math.abs(
                        form.partners.reduce((n, p) => n + Number(p.ownership || 0), 0) - 100,
                      ) < 0.0001
                        ? 'text-green'
                        : 'text-amber'
                    }
                  >
                    Ownership total:{' '}
                    {form.partners.reduce((n, p) => n + Number(p.ownership || 0), 0)}%
                  </span>
                </div>
              </>
            )}
            {step === 2 && (
              <div className="review">
                <div className="review-title">
                  <span className="venture-icon">
                    <Layers3 size={26} />
                  </span>
                  <div>
                    <Badge>{form.category}</Badge>
                    <h2>{form.name}</h2>
                  </div>
                  <Badge tone="amber">Proposed on creation</Badge>
                </div>
                <p>{form.description}</p>
                <div className="review-rules">
                  <div>
                    <small>EXPECTED CAPITAL</small>
                    <strong>
                      {eth(form.partners.reduce((n, p) => n + Number(p.expected), 0))} ETH
                    </strong>
                  </div>
                  <div>
                    <small>QUORUM</small>
                    <strong>{form.quorum}%</strong>
                  </div>
                  <div>
                    <small>ENDS ON</small>
                    <strong>{endOfDay(form.endsAt)?.toLocaleDateString('en-IN')}</strong>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Partner</th>
                        <th>Wallet</th>
                        <th>Capital</th>
                        <th>Ownership</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.partners.map((p, i) => (
                        <tr key={i}>
                          <td>
                            <div className="table-person">
                              <Avatar name={p.name} index={i} small />
                              {p.name}
                            </div>
                          </td>
                          <td className="mono">{short(p.wallet)}</td>
                          <td>{p.expected} ETH</td>
                          <td>{p.ownership}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Notice>
                  All partners must sign before activation. Financial actions then use the defined
                  quorum. Governance records decisions; changing partners or contract rules is
                  outside this prototype.
                </Notice>
                {confirmedHash && (
                  <Notice tone="warning">
                    Contract creation was confirmed:{' '}
                    <span className="mono break-all">{confirmedHash}</span>. Retry saving the
                    metadata without sending another deployment.
                  </Notice>
                )}
              </div>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="form-footer">
              <Button
                variant="ghost"
                disabled={step === 0 || busy || Boolean(confirmedHash)}
                icon={ArrowLeft}
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
              {step < 2 ? (
                <Button icon={ArrowRight} onClick={next}>
                  Continue
                </Button>
              ) : (
                <Button busy={busy} icon={Check} onClick={submit}>
                  {confirmedHash ? 'Retry save' : 'Create partnership'}
                </Button>
              )}
            </div>
          </Panel>
        </section>
        <aside className="create-aside">
          <div className="trust-card">
            <ShieldCheck size={26} />
            <h3>
              Good partnerships
              <br />
              start with clarity.
            </h3>
            <p>Every partner knows their commitment. Every decision follows the same rules.</p>
            <ul>
              <li>
                <Check size={14} />
                Ownership totals 100%
              </li>
              <li>
                <Check size={14} />
                All partners sign the agreement
              </li>
              <li>
                <Check size={14} />
                Expenses require shared approval
              </li>
              <li>
                <Check size={14} />
                Every action leaves a record
              </li>
            </ul>
          </div>
          <div className="small-note">
            <Wallet size={16} />
            Your wallet signs the creation. Use test ETH on the local network.
          </div>
        </aside>
      </div>
    </>
  );
}
