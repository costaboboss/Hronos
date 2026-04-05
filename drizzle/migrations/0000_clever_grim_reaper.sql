CREATE TYPE "user_role" AS ENUM ('user', 'admin');
--> statement-breakpoint
CREATE TABLE "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "openId" varchar(64) NOT NULL,
  "name" text,
  "email" varchar(320),
  "loginMethod" varchar(64),
  "role" "user_role" DEFAULT 'user' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_openId_unique" ON "users" ("openId");
--> statement-breakpoint
CREATE TABLE "tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "name" varchar(100) NOT NULL,
  "color" varchar(20) DEFAULT '#6366f1' NOT NULL,
  "isDefault" boolean DEFAULT false NOT NULL,
  "isWork" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "entryDate" varchar(10) NOT NULL,
  "startTime" varchar(5) NOT NULL,
  "endTime" varchar(5) NOT NULL,
  "tagId" integer,
  "tagName" varchar(100),
  "comment" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_user_date_start_idx" ON "time_entries" ("userId", "entryDate", "startTime");
--> statement-breakpoint
ALTER TABLE "tags"
ADD CONSTRAINT "tags_userId_users_id_fk"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "time_entries"
ADD CONSTRAINT "time_entries_userId_users_id_fk"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "time_entries"
ADD CONSTRAINT "time_entries_tagId_tags_id_fk"
FOREIGN KEY ("tagId") REFERENCES "tags"("id")
ON DELETE set null ON UPDATE no action;
