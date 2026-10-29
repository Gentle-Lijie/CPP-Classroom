DROP INDEX "draft_user_exercise_unique";--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "language" text DEFAULT 'cpp' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "language" text DEFAULT 'cpp' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "starters" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "help_requests" ADD COLUMN "language" text DEFAULT 'cpp' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "language" text DEFAULT 'cpp' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "language" text DEFAULT 'cpp' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "runtime_profile" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "execution_config" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "language" text DEFAULT 'cpp' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_user_exercise_language_unique" ON "drafts" USING btree ("user_id","exercise_id","language");
--> statement-breakpoint
-- Preserve known historical compiler identity without assigning today's profile to unknown runs.
UPDATE "runs" SET "runtime_profile" = "compiler_profile" WHERE "compiler_profile" IN ('gcc13-cpp17', 'gcc13-cpp20');
--> statement-breakpoint
UPDATE "exercises" SET "starters" = jsonb_build_object('cpp', coalesce("content"->>'code', ''));
--> statement-breakpoint
UPDATE "projections" SET "snapshot" = jsonb_build_object('language', 'cpp') || "snapshot" WHERE NOT ("snapshot" ? 'language');
