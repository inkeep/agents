-- Migration: Widen the UNIQUE constraint on sub_agent_skills to include tenant_id, project_id, agent_id
-- Problem: The original UNIQUE("sub_agent_id","skill_id") was too narrow; it should be scoped per-agent.
-- Approach: backup→drop→recreate→restore to avoid Doltgres DROP CONSTRAINT bug and PGlite name collisions.
-- Step 1: Create backup table (no constraints, just data storage)
CREATE TABLE "sub_agent_skills_backup" (
    "tenant_id" varchar(256),
    "id" varchar(256),
    "project_id" varchar(256),
    "agent_id" varchar(256),
    "sub_agent_id" varchar(256),
    "skill_id" varchar(64),
    "index" numeric,
    "always_loaded" boolean,
    "created_at" timestamp,
    "updated_at" timestamp
);--> statement-breakpoint
-- Step 2: Copy all existing data to backup
INSERT INTO "sub_agent_skills_backup" SELECT * FROM "sub_agent_skills";--> statement-breakpoint
-- Step 3: Drop original table (frees all constraint/index names)
DROP TABLE "sub_agent_skills";--> statement-breakpoint
-- Step 4: Recreate table with correct wider UNIQUE constraint
CREATE TABLE "sub_agent_skills" (
    "tenant_id" varchar(256) NOT NULL,
    "id" varchar(256) NOT NULL,
    "project_id" varchar(256) NOT NULL,
    "agent_id" varchar(256) NOT NULL,
    "sub_agent_id" varchar(256) NOT NULL,
    "skill_id" varchar(64) NOT NULL,
    "index" numeric DEFAULT 0 NOT NULL,
    "always_loaded" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "sub_agent_skills_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id"),
    CONSTRAINT "sub_agent_skills_sub_agent_skill_unique" UNIQUE("tenant_id","project_id","agent_id","sub_agent_id","skill_id")
);--> statement-breakpoint
-- Step 5: Restore data from backup
INSERT INTO "sub_agent_skills" SELECT * FROM "sub_agent_skills_backup";--> statement-breakpoint
-- Step 6: Drop backup table
DROP TABLE "sub_agent_skills_backup";--> statement-breakpoint
-- Step 7: Re-add foreign keys
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_skill_fk" FOREIGN KEY ("tenant_id","project_id","skill_id") REFERENCES "public"."skills"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Step 8: Re-add index
CREATE INDEX "sub_agent_skills_skill_idx" ON "sub_agent_skills" USING btree ("skill_id");
