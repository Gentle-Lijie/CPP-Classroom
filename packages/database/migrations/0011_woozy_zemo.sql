CREATE TABLE "runner_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"auth_token" text NOT NULL,
	"capacity" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "runner_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_runner_id_runner_nodes_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runner_nodes"("id") ON DELETE no action ON UPDATE no action;