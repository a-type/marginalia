import Database from 'better-sqlite3';
import type { Generated } from 'kysely';
import { Kysely, SqliteDialect } from 'kysely';
import { Migrator } from 'kysely/migration';

import { migrationProvider } from '#/db.migrations';

interface DatabaseSchema {
  accounts: {
    did: string;
    handle: string | null;
    created_at: Generated<string>;
    last_login_at: Generated<string>;
  };
  atproto_oauth_states: {
    key: string;
    value: string;
    created_at: Generated<string>;
  };
  atproto_oauth_sessions: {
    did: string;
    value: string;
    updated_at: Generated<string>;
  };
  com_marginalia_commentary: {
    tid: string;
    uri: string;
    cid: string | null;
    authorDid: string;
    name: string;
    recordJson: string;
    createdAt: Generated<string>;
    updatedAt: Generated<string>;
  };
  com_marginalia_annotation: {
    tid: string;
    uri: string;
    cid: string | null;
    authorDid: string;
    commentaryId: string | null;
    comment: string | null;
    recordJson: string;
    createdAt: Generated<string>;
    updatedAt: Generated<string>;
  };
  com_marginalia_annotation_verse: {
    annotationUri: string;
    verseId: string;
    bookId: string;
    chapter: number;
    verse: number;
  };
  com_marginalia_highlight: {
    rkey: string;
    uri: string;
    cid: string | null;
    authorDid: string;
    verseId: string;
    bookId: string;
    chapter: number;
    verse: number;
    color: string;
    recordJson: string;
    createdAt: string;
    updatedAt: Generated<string>;
  };
}

let startup: Promise<Kysely<DatabaseSchema>> | undefined;

export async function getClient() {
  startup ??= (async () => {
    const database = new Database(
      process.env.DATABASE_PATH ?? 'marginalia.sqlite',
    );
    database.pragma('foreign_keys = ON');
    const db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database }),
    });
    const { error } = await new Migrator({
      db,
      provider: migrationProvider,
    }).migrateToLatest();
    if (error) {
      await db.destroy();
      throw error;
    }
    return db;
  })();

  try {
    return await startup;
  } catch (error) {
    startup = undefined;
    throw error;
  }
}

export async function getRequiredClient() {
  return getClient();
}
