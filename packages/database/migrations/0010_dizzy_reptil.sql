CREATE INDEX "help_requests_overview_idx" ON "help_requests" USING btree ("classroom_id","user_id","resolved","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_since_idx" ON "login_attempts" USING btree ("since");--> statement-breakpoint
CREATE INDEX "projections_expires_at_idx" ON "projections" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "submissions_overview_idx" ON "submissions" USING btree ("classroom_id","user_id","exercise_id","language","created_at");