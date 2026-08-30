import { sql } from 'kysely'
import type { MigrationProvider } from 'kysely/migration'

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      '001_initial_schema': {
        async up(db) {
          await db.schema
            .createTable('accounts')
            .addColumn('did', 'text', (column) => column.primaryKey())
            .addColumn('handle', 'text')
            .addColumn('created_at', 'text', (column) =>
              column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .addColumn('last_login_at', 'text', (column) =>
              column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .execute()
          await db.schema
            .createTable('atproto_oauth_states')
            .addColumn('key', 'text', (column) => column.primaryKey())
            .addColumn('value', 'text', (column) => column.notNull())
            .addColumn('created_at', 'text', (column) =>
              column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .execute()
          await db.schema
            .createTable('atproto_oauth_sessions')
            .addColumn('did', 'text', (column) =>
              column
                .primaryKey()
                .references('accounts.did')
                .onDelete('cascade'),
            )
            .addColumn('value', 'text', (column) => column.notNull())
            .addColumn('updated_at', 'text', (column) =>
              column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .execute()
        },
        async down(db) {
          await db.schema.dropTable('atproto_oauth_sessions').execute()
          await db.schema.dropTable('atproto_oauth_states').execute()
          await db.schema.dropTable('accounts').execute()
        },
      },
      '002_lexicon_records': {
        async up(db) {
          await db.schema
            .createTable('com_marginalia_commentary')
            .addColumn('uri', 'text', (column) => column.primaryKey())
            .addColumn('tid', 'text', (column) => column.notNull())
            .addColumn('cid', 'text')
            .addColumn('authorDid', 'text', (column) => column.notNull())
            .addColumn('name', 'text', (column) => column.notNull())
            .addColumn('recordJson', 'text', (column) => column.notNull())
            .addColumn('createdAt', 'text', (column) =>
              column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .addColumn('updatedAt', 'text', (column) =>
              column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .execute()

          await db.schema
            .createTable('com_marginalia_annotation')
            .addColumn('uri', 'text', (column) => column.primaryKey())
            .addColumn('tid', 'text', (column) => column.notNull())
            .addColumn('cid', 'text')
            .addColumn('authorDid', 'text', (column) => column.notNull())
            .addColumn('commentaryId', 'text')
            .addColumn('comment', 'text')
            .addColumn('color', 'text')
            .addColumn('recordJson', 'text', (column) => column.notNull())
            .addColumn('createdAt', 'text', (column) =>
              column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .addColumn('updatedAt', 'text', (column) =>
              column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
            )
            .execute()

          await db.schema
            .createTable('com_marginalia_annotation_verse')
            .addColumn('annotationUri', 'text', (column) =>
              column
                .notNull()
                .references('com_marginalia_annotation.uri')
                .onDelete('cascade'),
            )
            .addColumn('verseId', 'text', (column) => column.notNull())
            .addColumn('bookId', 'text', (column) => column.notNull())
            .addColumn('chapter', 'integer', (column) => column.notNull())
            .addColumn('verse', 'integer', (column) => column.notNull())
            .addPrimaryKeyConstraint('com_marginalia_annotation_verse_pk', [
              'annotationUri',
              'verseId',
            ])
            .execute()

          await db.schema
            .createIndex('com_marginalia_commentary_authorDid_idx')
            .on('com_marginalia_commentary')
            .column('authorDid')
            .execute()

          await db.schema
            .createIndex('com_marginalia_annotation_authorDid_idx')
            .on('com_marginalia_annotation')
            .column('authorDid')
            .execute()

          await db.schema
            .createIndex('com_marginalia_annotation_commentaryId_idx')
            .on('com_marginalia_annotation')
            .column('commentaryId')
            .execute()

          await db.schema
            .createIndex('com_marginalia_annotation_verse_verseId_idx')
            .on('com_marginalia_annotation_verse')
            .column('verseId')
            .execute()

          await db.schema
            .createIndex('com_marginalia_annotation_verse_bookId_idx')
            .on('com_marginalia_annotation_verse')
            .column('bookId')
            .execute()

          await db.schema
            .createIndex('com_marginalia_annotation_verse_bookId_chapter_idx')
            .on('com_marginalia_annotation_verse')
            .columns(['bookId', 'chapter'])
            .execute()
        },
        async down(db) {
          await db.schema.dropTable('com_marginalia_annotation_verse').execute()
          await db.schema.dropTable('com_marginalia_annotation').execute()
          await db.schema.dropTable('com_marginalia_commentary').execute()
        },
      },
    }
  },
}
