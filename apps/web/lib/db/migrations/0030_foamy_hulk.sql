ALTER TABLE "user_preferences" ALTER COLUMN "default_sandbox_type" SET DEFAULT 'local-fs';--> statement-breakpoint
UPDATE "user_preferences"
SET "default_sandbox_type" = 'local-fs'
WHERE "default_sandbox_type" = 'vercel';