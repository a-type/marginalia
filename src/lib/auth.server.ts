import type { SessionConfig } from '@tanstack/react-start/server'
import { clearSession, useSession } from '@tanstack/react-start/server'
import { sql } from 'kysely'

import { getRequiredClient } from '#/db'
import { AppError } from './error'

interface AppSessionData {
  did: string
}

export interface Account {
  did: string
  handle: string | null
}

function getSessionConfig(): SessionConfig {
  const password =
    process.env.SESSION_PASSWORD ??
    (process.env.NODE_ENV === 'development'
      ? 'local-development-session-password'
      : undefined)

  if (!password || password.length < 32) {
    throw new AppError(
      AppError.Code.InternalServerError,
      'SESSION_PASSWORD must contain at least 32 characters',
    )
  }

  return {
    name: 'marginalia',
    password,
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  }
}

export async function getAppSession() {
  return useSession<AppSessionData>(getSessionConfig())
}

export async function setAppSession(did: string) {
  const session = await getAppSession()
  await session.update({ did })
}

export async function clearAppSession() {
  await clearSession(getSessionConfig())
}

export async function upsertAccount(did: string, handle: string | null) {
  const db = await getRequiredClient()
  await db
    .insertInto('accounts')
    .values({ did, handle })
    .onConflict((conflict) =>
      conflict.column('did').doUpdateSet({
        handle: sql`coalesce(excluded.handle, accounts.handle)`,
        last_login_at: sql`CURRENT_TIMESTAMP`,
      }),
    )
    .execute()
}

export async function getCurrentAccount(): Promise<Account | null> {
  const session = await getAppSession()
  if (!session.data.did) return null

  const db = await getRequiredClient()
  const account = await db
    .selectFrom('accounts')
    .select(['did', 'handle'])
    .where('did', '=', session.data.did)
    .executeTakeFirst()

  if (!account) {
    await session.clear()
    return null
  }

  return {
    did: account.did,
    handle: account.handle,
  }
}
