import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Layers3, Wallet, Check } from 'lucide-react';
import { Logo, Button, Field, Badge } from './ui';
import { post } from './api';
export default function Auth({ config, onLogin }) {
  const [tab, setTab] = useState('register'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      const { user } = await fn();
      onLogin(user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function submit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    run(() => post(`/auth/${tab}`, data));
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Logo />
        <Badge tone="green">THE PARTNERSHIP WORKSPACE</Badge>
        <h1>
          Build together.
          <br />
          Decide together.
          <br />
          <em>Grow together.</em>
        </h1>
        <p>
          A transparent home for shared capital, collective decisions, and the people behind your
          next venture.
        </p>
        <div className="network-art" aria-hidden="true">
          <div className="network-orbit orbit-one" />
          <div className="network-orbit orbit-two" />
          <div className="network-core">
            <Layers3 size={36} />
            <span>
              Shared vision.
              <br />
              One workspace.
            </span>
          </div>
          <span className="network-node node-one">
            <ShieldCheck size={22} />
          </span>
          <span className="network-node node-two">
            <Wallet size={22} />
          </span>
          <span className="network-node node-three">
            <Check size={22} />
          </span>
          <div className="network-label">CONNECTED BY TRUST</div>
        </div>
        <div className="auth-story-footer">
          <ShieldCheck size={16} /> Transparent by design. Accountable at every step.
        </div>
      </div>
      <main className="auth-form-side">
        <div className="auth-form">
          <div className="eyebrow">WELCOME TO ACCORD</div>
          <h2>
            Your next chapter
            <br />
            starts here.
          </h2>
          <p>Enter your workspace and move forward, together.</p>
          <div className="auth-tabs">
            <button
              onClick={() => {
                setTab('login');
                setError('');
              }}
              className={tab === 'login' ? 'selected' : ''}
            >
              Sign in
            </button>
            <button
              onClick={() => {
                setTab('register');
                setError('');
              }}
              className={tab === 'register' ? 'selected' : ''}
            >
              Create account
            </button>
          </div>
          <form onSubmit={submit}>
            {tab === 'register' && (
              <Field
                label="Full name"
                name="name"
                placeholder="Your name"
                required
                minLength={2}
                maxLength={80}
              />
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
            <Field
              label="Password"
              name="password"
              type="password"
              placeholder={tab === 'register' ? 'At least 8 characters' : 'Enter your password'}
              required
              minLength={tab === 'register' ? 8 : 1}
              maxLength={128}
              autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
            />
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <Button busy={busy} type="submit" icon={ArrowRight}>
              {tab === 'login' ? 'Sign in to your workspace' : 'Create your account'}
            </Button>
          </form>
          <div className="auth-secure">
            <ShieldCheck size={14} />
            Your account · Your wallet · Your partnerships
          </div>
        </div>
        <div className="auth-bottom">
          © {new Date().getFullYear()} Accord <span>Shared ambition. Clear agreements.</span>
        </div>
      </main>
    </div>
  );
}
