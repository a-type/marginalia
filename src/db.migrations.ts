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
    }
  },
}
