import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Operational events only. Classroom and authentication schemas are added with their features.
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    event: text('event').notNull(),
    source: text('source').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_events_created_at_idx').on(table.createdAt)],
)
