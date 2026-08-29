import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { oauth } from '#/lib/atproto.server'
import { setAppSession, upsertAccount } from '#/lib/auth.server'
import { AppError } from '#/lib/error'

const callbackFn = createServerFn({ method: 'GET' })
  .validator((search: Record<string, string>) => search)
  .handler(async ({ data }) => {
    const { session } = await oauth.callback(new URLSearchParams(data))
    const response = await session.fetchHandler(
      `/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(session.did)}`,
    )
    if (!response.ok) {
      throw new AppError(
        AppError.Code.ExternalServiceError,
        `Unable to load the ATProto account (${response.status})`,
      )
    }

    const profile: unknown = await response.json()
    if (
      !profile ||
      typeof profile !== 'object' ||
      !('handle' in profile) ||
      typeof profile.handle !== 'string'
    ) {
      throw new AppError(
        AppError.Code.ExternalServiceError,
        'The ATProto server returned an invalid account',
      )
    }

    await upsertAccount(session.did, profile.handle)
    await setAppSession(session.did)
  })

export const Route = createFileRoute('/oauth/callback')({
  loader: async ({ location }) => {
    await callbackFn({ data: location.search })
    throw redirect({ to: '/' })
  },
  component: () => <p>Completing sign in…</p>,
})
