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
} from 'drizzle-orm/pg-core'

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

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  number: text('number').notNull().default(''),
  role: text('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
export const recoveryRequests = pgTable('recovery_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull(),
  resolved: boolean('resolved').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  since: timestamp('since', { withTimezone: true }).defaultNow().notNull(),
})

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
    status: text('status').notNull().default('草稿'),
    position: integer('position').notNull().default(0),
    version: integer('version').notNull().default(1),
    content: jsonb('content').$type<Record<string, string>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('exercise_filename_class_unique').on(t.classroomId, t.filename)],
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
    code: text('code').notNull(),
    revision: integer('revision').default(1).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('draft_user_exercise_unique').on(t.userId, t.exerciseId)],
)
