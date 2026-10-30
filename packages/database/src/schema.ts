import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// Operational and classroom audit records; secrets are never stored in event details.
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

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  number: text('number').notNull().default(''),
  role: text('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
export const sessions = pgTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)
export const recoveryRequests = pgTable('recovery_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull(),
  resolved: boolean('resolved').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
export const loginAttempts = pgTable(
  'login_attempts',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull().default(0),
    since: timestamp('since', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('login_attempts_since_idx').on(table.since)],
)

export const classrooms = pgTable('classrooms', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('未开始'),
  inviteCode: text('invite_code').notNull().unique(),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }).notNull(),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  recommended: uuid('recommended'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('pending'),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
    exerciseId: uuid('exercise_id'),
    language: text('language').$type<'cpp' | 'python'>().notNull().default('cpp'),
  },
  (t) => [uniqueIndex('membership_user_class_unique').on(t.classroomId, t.userId)],
)
export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id),
    filename: text('filename').notNull(),
    language: text('language').$type<'cpp' | 'python'>().notNull().default('cpp'),
    starters: jsonb('starters')
      .$type<Partial<Record<'cpp' | 'python', string>>>()
      .notNull()
      .default({}),
    status: text('status').notNull().default('草稿'),
    position: integer('position').notNull().default(0),
    version: integer('version').notNull().default(1),
    content: jsonb('content').$type<Record<string, string>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('exercise_filename_class_unique')
      .on(t.classroomId, t.filename)
      .where(sql`${t.filename} <> ''`),
  ],
)

export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    language: text('language').$type<'cpp' | 'python'>().notNull().default('cpp'),
    code: text('code').notNull(),
    revision: integer('revision').default(1).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('draft_user_exercise_language_unique').on(t.userId, t.exerciseId, t.language),
  ],
)

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    language: text('language').$type<'cpp' | 'python'>().notNull().default('cpp'),
    code: text('code').notNull(),
    filename: text('filename').notNull(),
    compilerProfile: text('compiler_profile'),
    runtimeProfile: text('runtime_profile'),
    executionConfig: jsonb('execution_config').$type<Record<string, number>>(),
    revision: integer('revision').notNull(),
    input: text('input').notNull(),
    status: text('status').notNull().default('排队'),
    output: text('output').notNull().default(''),
    stderr: text('stderr').notNull().default(''),
    log: text('log').notNull().default(''),
    exit: text('exit').notNull().default('—'),
    interactive: boolean('interactive').notNull().default(false),
    eof: boolean('eof').notNull().default(false),
    stopRequested: boolean('stop_requested').notNull().default(false),
    metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('runs_queue_idx').on(t.status, t.createdAt),
    index('runs_history_idx').on(t.classroomId, t.userId, t.createdAt),
  ],
)
export const runInputs = pgTable('run_inputs', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id),
  content: text('content').notNull(),
  eof: boolean('eof').notNull().default(false),
  delivered: boolean('delivered').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const helpRequests = pgTable(
  'help_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    language: text('language').$type<'cpp' | 'python'>().notNull().default('cpp'),
    message: text('message').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('help_requests_overview_idx').on(
      table.classroomId,
      table.userId,
      table.resolved,
      table.createdAt,
    ),
  ],
)
export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    language: text('language').$type<'cpp' | 'python'>().notNull().default('cpp'),
    code: text('code').notNull(),
    filename: text('filename').notNull(),
    revision: integer('revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('submissions_overview_idx').on(
      table.classroomId,
      table.userId,
      table.exerciseId,
      table.language,
      table.createdAt,
    ),
  ],
)
export const projections = pgTable(
  'projections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    revoked: boolean('revoked').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('projections_expires_at_idx').on(table.expiresAt)],
)
export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
})
