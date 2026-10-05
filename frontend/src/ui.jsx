import React, { useEffect, useRef, useId } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  X,
  LoaderCircle,
  Inbox,
  Copy,
  Check,
  CircleHelp,
} from 'lucide-react';
export const short = (address) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Contract pending';
export const eth = (value, digits = 4) =>
  Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits });
export const date = (value) =>
  new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
export const same = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
export const initials = (name) =>
  name
    ?.split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('') || '?';
export function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        a<span>•</span>
      </span>
      <span>
        accord<span className="logo-dot">.</span>
      </span>
    </div>
  );
}
export function Badge({ children, tone = '' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Button({ children, variant = 'primary', busy, icon: Icon, ...props }) {
  return (
    <button className={`button ${variant}`} disabled={busy || props.disabled} {...props}>
      {busy ? <LoaderCircle size={16} className="spin" /> : Icon && <Icon size={16} />}
      {children}
    </button>
  );
}
export function PageTitle({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function Panel({ title, caption, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {caption && <p>{caption}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({ title = 'Nothing here yet', description, action, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <span>
        <Icon size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Field({ label, hint, children, ...props }) {
  const id = useId();
  const accessibility = {
    'aria-labelledby': `${id}-label`,
    'aria-describedby': hint ? `${id}-hint` : undefined,
  };
  return (
    <label className="field">
      <span id={`${id}-label`}>{label}</span>
      {children ? (
        React.cloneElement(children, accessibility)
      ) : (
        <input {...props} {...accessibility} />
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
export function Progress({ value, label }) {
  return (
    <div className="progress-wrap">
      {label && (
        <div className="progress-label">
          {label}
          <span>{Math.round(value)}%</span>
        </div>
      )}
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
      </div>
    </div>
  );
}
export function Avatar({ name, index = 0, small }) {
  return (
    <span className={`avatar avatar-${index % 4} ${small ? 'small' : ''}`}>{initials(name)}</span>
  );
}
export function Address({ value, notify }) {
  return (
    <button
      className="address"
      title={value || 'No contract address is available yet.'}
      onClick={async () => {
        if (!value) return;
        try {
          await navigator.clipboard.writeText(value);
          notify?.('Address copied.');
        } catch {
          notify?.('Copy is unavailable in this browser.', 'error');
        }
      }}
    >
      <span>{short(value)}</span>
      {value && <Copy size={12} />}
    </button>
  );
}
export function Loading({ label = 'Loading your workspace…' }) {
  return (
    <div className="loading">
      <LoaderCircle size={24} className="spin" />
      <span>{label}</span>
    </div>
  );
}
export function Notice({ children, tone = 'info' }) {
  return (
    <div className={`notice ${tone}`}>
      <CircleHelp size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Modal({ title, description, children, close, eyebrow = 'PARTNERSHIP ACTION' }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const list = [
          ...ref.current.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), textarea, select, [tabindex="0"]',
          ),
        ];
        if (!list.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="modal"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button className="icon-button modal-close" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        {children}
      </section>
    </div>
  );
}
export function Stat({ label, value, unit, icon: Icon, detail }) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        <span className="stat-icon">
          <Icon size={17} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        {unit && <span>{unit}</span>}
      </div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
export function DownloadCSV(filename, rows) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const csv = rows.map((row) => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
