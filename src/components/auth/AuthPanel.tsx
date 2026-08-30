import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { loginFn, logoutFn } from '#/lib/auth.functions'
import type { Account } from '#/lib/auth.server'

import cls from './AuthPanel.module.css'

export function AuthPanel({ account }: { account: Account | null }) {
  const login = useServerFn(loginFn)
  const logout = useServerFn(logoutFn)
  const [identifier, setIdentifier] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await login({ data: { identifier } })
    } catch (cause) {
      setPending(false)
      setError(cause instanceof Error ? cause.message : 'Unable to sign in')
    }
  }

  async function handleLogout() {
    setPending(true)
    setError('')
    try {
      await logout()
    } catch (cause) {
      setPending(false)
      setError(cause instanceof Error ? cause.message : 'Unable to sign out')
    }
  }

  if (account) {
    return (
      <section className={cls.panel} aria-label="Account">
        <div className={cls.identity}>
          <span className={cls.status}>Signed in with ATProto</span>
          <strong>{account.handle ? `@${account.handle}` : account.did}</strong>
          {account.handle && <span className={cls.did}>{account.did}</span>}
        </div>
        <button
          className={cls.secondaryButton}
          disabled={pending}
          onClick={handleLogout}
          type="button"
        >
          {pending ? 'Signing out…' : 'Sign out'}
        </button>
        {error && (
          <p className={cls.error} role="alert">
            {error}
          </p>
        )}
      </section>
    )
  }

  return (
    <section className={cls.panel} aria-labelledby="atproto-login-title">
      <form className={cls.form} onSubmit={handleLogin}>
        <div className={cls.intro}>
          <strong id="atproto-login-title">Sign in with Bluesky</strong>
          <span>Use any ATProto handle, DID, or PDS address.</span>
        </div>
        <div className={cls.controls}>
          <label className={cls.field}>
            <span>Account</span>
            <input
              autoCapitalize="none"
              autoComplete="username"
              disabled={pending}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="alice.bsky.social"
              required
              spellCheck={false}
              type="text"
              value={identifier}
            />
          </label>
          <button
            className={cls.primaryButton}
            disabled={pending}
            type="submit"
          >
            {pending ? 'Redirecting…' : 'Continue'}
          </button>
        </div>
        {error && (
          <p className={cls.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
