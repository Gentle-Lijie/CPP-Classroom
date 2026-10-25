CREATE TABLE "run_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"content" text NOT NULL,
	"eof" boolean DEFAULT false NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"filename" text NOT NULL,
	"revision" integer NOT NULL,
	"input" text NOT NULL,
	"status" text DEFAULT '排队' NOT NULL,
	"output" text DEFAULT '' NOT NULL,
	"stderr" text DEFAULT '' NOT NULL,
	"log" text DEFAULT '' NOT NULL,
	"exit" text DEFAULT '—' NOT NULL,
	"interactive" boolean DEFAULT false NOT NULL,
	"eof" boolean DEFAULT false NOT NULL,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_inputs" ADD CONSTRAINT "run_inputs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_queue_idx" ON "runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "runs_history_idx" ON "runs" USING btree ("classroom_id","user_id","created_at");