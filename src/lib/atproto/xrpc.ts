import { z } from 'zod';
import { isValidDid } from '@atproto/syntax';

import { AppError } from '#/lib/error';
import type { HappyViewSession } from './client';

const recordPageSchema = z
  .object({
    records: z.array(z.unknown()),
    cursor: z.string().optional(),
  })
  .passthrough();

export async function fetchXrpcRecordPage(
  session: HappyViewSession,
  nsid: string,
  params: Record<string, string>,
) {
  const query = new URLSearchParams(params);
  const response = await session.fetchHandler(
    `/xrpc/${nsid}?${query.toString()}`,
    { method: 'GET' },
  );
  if (!response.ok) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      `HappyView query ${nsid} failed (${response.status})`,
    );
  }

  const body: unknown = await response.json();
  const result = recordPageSchema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      AppError.Code.ExternalServiceError,
      `HappyView query ${nsid} returned an invalid record page`,
      result.error,
    );
  }

  return result.data;
}

export async function fetchAllXrpcRecords(
  session: HappyViewSession,
  nsid: string,
  params: Record<string, string>,
) {
  const records: unknown[] = [];
  const cursors = new Set<string>();
  let cursor: string | null | undefined;

  while (cursor !== null) {
    const page = await fetchXrpcRecordPage(session, nsid, {
      ...params,
      limit: '100',
      ...(cursor ? { cursor } : {}),
    });
    records.push(...page.records);

    if (!page.cursor) {
      cursor = null;
      continue;
    }
    if (cursors.has(page.cursor)) {
      throw new AppError(
        AppError.Code.ExternalServiceError,
        `HappyView query ${nsid} returned a repeated cursor`,
      );
    }
    cursors.add(page.cursor);
    cursor = page.cursor;
  }

  return records;
}

export function parseAtRecordUri(uri: string, collection: string) {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!match || !isValidDid(match[1]) || match[2] !== collection || !match[3]) {
    return null;
  }

  return { authorDid: match[1], rkey: match[3] };
}
