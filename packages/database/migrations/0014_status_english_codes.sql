-- Convert Chinese status enum values to English codes (display i18n moves to the frontend).
UPDATE "classrooms" SET "status"='not_started' WHERE "status"='未开始';--> statement-breakpoint
UPDATE "classrooms" SET "status"='ongoing' WHERE "status"='进行中';--> statement-breakpoint
UPDATE "classrooms" SET "status"='closed' WHERE "status"='已关闭';--> statement-breakpoint
UPDATE "classrooms" SET "status"='archived' WHERE "status"='已归档';--> statement-breakpoint
ALTER TABLE "classrooms" ALTER COLUMN "status" SET DEFAULT 'not_started';--> statement-breakpoint
UPDATE "exercises" SET "status"='draft' WHERE "status"='草稿';--> statement-breakpoint
UPDATE "exercises" SET "status"='published' WHERE "status"='已发布';--> statement-breakpoint
UPDATE "exercises" SET "status"='closed' WHERE "status"='已关闭';--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
UPDATE "runs" SET "status"='queued' WHERE "status"='排队';--> statement-breakpoint
UPDATE "runs" SET "status"='compiling' WHERE "status"='编译中';--> statement-breakpoint
UPDATE "runs" SET "status"='running' WHERE "status"='运行中／可输入';--> statement-breakpoint
UPDATE "runs" SET "status"='finished' WHERE "status"='运行完成';--> statement-breakpoint
UPDATE "runs" SET "status"='compile_error' WHERE "status"='编译失败';--> statement-breakpoint
UPDATE "runs" SET "status"='runtime_error' WHERE "status"='运行失败';--> statement-breakpoint
UPDATE "runs" SET "status"='platform_error' WHERE "status"='平台执行失败';--> statement-breakpoint
UPDATE "runs" SET "status"='resource_limited' WHERE "status"='资源超限';--> statement-breakpoint
UPDATE "runs" SET "status"='timeout' WHERE "status"='超时';--> statement-breakpoint
UPDATE "runs" SET "status"='stopped' WHERE "status"='已停止';--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" SET DEFAULT 'queued';
