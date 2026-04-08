DO $$
BEGIN
  CREATE TYPE "training_volume_mode" AS ENUM ('weight_reps', 'bodyweight_reps', 'reps_only', 'duration', 'distance');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "training_exercises"
  ADD COLUMN IF NOT EXISTS "volumeMode" "training_volume_mode" DEFAULT 'weight_reps' NOT NULL;
--> statement-breakpoint
ALTER TABLE "training_sessions"
  ADD COLUMN IF NOT EXISTS "startTimeText" varchar(20);
--> statement-breakpoint
ALTER TABLE "training_session_exercises"
  ADD COLUMN IF NOT EXISTS "computedVolume" integer;
--> statement-breakpoint
ALTER TABLE "training_sets"
  ADD COLUMN IF NOT EXISTS "additionalWeightKg" integer;
--> statement-breakpoint
ALTER TABLE "training_sets"
  ADD COLUMN IF NOT EXISTS "effectiveWeightKg" integer;
--> statement-breakpoint
ALTER TABLE "training_sets"
  ADD COLUMN IF NOT EXISTS "rawInput" text;
