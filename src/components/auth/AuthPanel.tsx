import { useServerFn } from '@tanstack/react-start';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { loginFn, logoutFn } from '#/lib/auth/functions';
import type { Account } from '#/lib/auth/server';
import { m } from '#/paraglide/messages';

import { Box, Button, Field, Input, Text } from '@a-type/ui';
import cls from './AuthPanel.module.css';

export function AuthPanel({ account }: { account: Account | null }) {
  const login = useServerFn(loginFn);
  const logout = useServerFn(logoutFn);
  const [identifier, setIdentifier] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await login({ data: { identifier } });
    } catch (cause) {
      setPending(false);
      setError(
        cause instanceof Error ? cause.message : m.cozy_clean_zebra_offer(),
      );
    }
  }

  async function handleLogout() {
    setPending(true);
    setError('');
    try {
      await logout();
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : m.blue_shy_wasp_stab());
    }
  }

  if (account) {
    return (
      <Box render={<section />} col className={cls.panel} aria-label="Account">
        <Box className={cls.identity}>
          <Text className={cls.status}>{m.best_royal_raven_bask()}</Text>
          <Text bold>
            {account.handle ? `@${account.handle}` : account.did}
          </Text>
          {account.handle && <Text className={cls.did}>{account.did}</Text>}
        </Box>
        <Button
          className={cls.secondaryButton}
          disabled={pending}
          onClick={handleLogout}
          type="button"
        >
          {pending ? m.topical_steep_seal_dance() : m.equal_zany_marlin_feel()}
        </Button>
        {error && (
          <p className={cls.error} role="alert">
            {error}
          </p>
        )}
      </Box>
    );
  }

  return (
    <Box
      render={<section />}
      className={cls.panel}
      aria-labelledby="atproto-login-title"
    >
      <Box
        col
        gap="sm"
        render={<form onSubmit={handleLogin} />}
        className={cls.form}
      >
        <Box col gap className={cls.intro}>
          <strong id="atproto-login-title">{m.legal_cool_snail_taste()}</strong>
          <Text dim italic emphasis="secondary">
            {m.extra_happy_hare_blink()}
          </Text>
        </Box>
        <Field stretch className={cls.field}>
          <Field.Label>Account</Field.Label>
          <Field.Control
            render={
              <Input
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
            }
          />
        </Field>
        <Button
          emphasis="primary"
          className={cls.primaryButton}
          disabled={pending}
          type="submit"
        >
          {pending ? m.sour_novel_leopard_laugh() : m.formal_bad_camel_advise()}
        </Button>
        {error && (
          <p className={cls.error} role="alert">
            {error}
          </p>
        )}
      </Box>
    </Box>
  );
}
