DO $$
BEGIN
  CREATE TYPE "training_set_type" AS ENUM ('warmup', 'work', 'drop', 'amrap', 'failure');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_exercises" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "name" varchar(160) NOT NULL,
  "slug" varchar(180) NOT NULL,
  "category" varchar(80),
  "primaryMuscleGroup" varchar(80),
  "equipment" varchar(80),
  "isBodyweight" boolean DEFAULT false NOT NULL,
  "notes" text,
  "isArchived" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "performedAt" timestamp with time zone NOT NULL,
  "durationMinutes" integer,
  "notes" text,
  "tardisDocumentId" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_session_exercises" (
  "id" serial PRIMARY KEY NOT NULL,
  "sessionId" integer NOT NULL,
  "exerciseId" integer NOT NULL,
  "notes" text,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_sets" (
  "id" serial PRIMARY KEY NOT NULL,
  "sessionExerciseId" integer NOT NULL,
  "setType" "training_set_type" DEFAULT 'work' NOT NULL,
  "setOrder" integer DEFAULT 0 NOT NULL,
  "weightKg" integer,
  "reps" integer,
  "rpe" integer,
  "restSeconds" integer,
  "durationSeconds" integer,
  "distanceMeters" integer,
  "completedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "training_exercises"
    ADD CONSTRAINT "training_exercises_userId_users_id_fk"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "training_sessions"
    ADD CONSTRAINT "training_sessions_userId_users_id_fk"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "training_sessions"
    ADD CONSTRAINT "training_sessions_tardisDocumentId_tardis_documents_id_fk"
    FOREIGN KEY ("tardisDocumentId") REFERENCES "tardis_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "training_session_exercises"
    ADD CONSTRAINT "training_session_exercises_sessionId_training_sessions_id_fk"
    FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "training_session_exercises"
    ADD CONSTRAINT "training_session_exercises_exerciseId_training_exercises_id_fk"
    FOREIGN KEY ("exerciseId") REFERENCES "training_exercises"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "training_sets"
    ADD CONSTRAINT "training_sets_sessionExerciseId_training_session_exercises_id_fk"
    FOREIGN KEY ("sessionExerciseId") REFERENCES "training_session_exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_exercises_user_slug_idx" ON "training_exercises" USING btree ("userId","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_session_exercises_session_order_idx" ON "training_session_exercises" USING btree ("sessionId","sortOrder");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_sets_session_exercise_order_idx" ON "training_sets" USING btree ("sessionExerciseId","setOrder");
