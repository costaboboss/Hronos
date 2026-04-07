DO $$
BEGIN
  CREATE TYPE "tardis_document_mode" AS ENUM ('typed', 'custom');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardis_notebook_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "slug" varchar(200) NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardis_notebooks" (
  "id" serial PRIMARY KEY NOT NULL,
  "groupId" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "slug" varchar(200) NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardis_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "notebookId" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "documentType" varchar(64) NOT NULL,
  "documentMode" "tardis_document_mode" NOT NULL,
  "periodDate" varchar(10),
  "periodYear" integer,
  "periodMonth" integer,
  "periodWeek" integer,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardis_sections" (
  "id" serial PRIMARY KEY NOT NULL,
  "documentId" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "sectionKey" varchar(100) NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardis_blocks" (
  "id" serial PRIMARY KEY NOT NULL,
  "documentId" integer NOT NULL,
  "sectionId" integer NOT NULL,
  "blockType" varchar(64) NOT NULL,
  "title" varchar(200),
  "contentJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardis_document_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "fromDocumentId" integer NOT NULL,
  "toDocumentId" integer NOT NULL,
  "linkType" varchar(64) NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tardis_notebook_groups"
    ADD CONSTRAINT "tardis_notebook_groups_userId_users_id_fk"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tardis_notebooks"
    ADD CONSTRAINT "tardis_notebooks_groupId_tardis_notebook_groups_id_fk"
    FOREIGN KEY ("groupId") REFERENCES "tardis_notebook_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tardis_documents"
    ADD CONSTRAINT "tardis_documents_notebookId_tardis_notebooks_id_fk"
    FOREIGN KEY ("notebookId") REFERENCES "tardis_notebooks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tardis_sections"
    ADD CONSTRAINT "tardis_sections_documentId_tardis_documents_id_fk"
    FOREIGN KEY ("documentId") REFERENCES "tardis_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tardis_blocks"
    ADD CONSTRAINT "tardis_blocks_documentId_tardis_documents_id_fk"
    FOREIGN KEY ("documentId") REFERENCES "tardis_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tardis_blocks"
    ADD CONSTRAINT "tardis_blocks_sectionId_tardis_sections_id_fk"
    FOREIGN KEY ("sectionId") REFERENCES "tardis_sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tardis_document_links"
    ADD CONSTRAINT "tardis_document_links_fromDocumentId_tardis_documents_id_fk"
    FOREIGN KEY ("fromDocumentId") REFERENCES "tardis_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tardis_document_links"
    ADD CONSTRAINT "tardis_document_links_toDocumentId_tardis_documents_id_fk"
    FOREIGN KEY ("toDocumentId") REFERENCES "tardis_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
