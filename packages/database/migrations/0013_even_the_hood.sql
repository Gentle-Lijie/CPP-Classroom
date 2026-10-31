ALTER TABLE "memberships" ADD COLUMN "role" text DEFAULT 'student' NOT NULL;--> statement-breakpoint
-- Refuse ambiguous legacy data rather than overwrite a student's membership.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM classrooms c JOIN memberships m ON m.classroom_id=c.id AND m.user_id=c.owner_id) THEN
    RAISE EXCEPTION 'Classroom owner already has a membership; resolve the conflict before migrating';
  END IF;
END $$;--> statement-breakpoint
INSERT INTO memberships(classroom_id,user_id,role,status)
SELECT id,owner_id,'teacher','active' FROM classrooms;--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_class_role_status_idx" ON "memberships" USING btree ("classroom_id","role","status");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" in ('student', 'teacher', 'ta'));--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_staff_status_check" CHECK ("memberships"."role" = 'student' or "memberships"."status" in ('active', 'removed'));
