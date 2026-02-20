CREATE TABLE "sub_agent_skills_new" (
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
INSERT INTO "sub_agent_skills_new" SELECT * FROM "sub_agent_skills";--> statement-breakpoint
DROP TABLE "sub_agent_skills";--> statement-breakpoint
ALTER TABLE "sub_agent_skills_new" RENAME TO "sub_agent_skills";--> statement-breakpoint
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_skill_fk" FOREIGN KEY ("tenant_id","project_id","skill_id") REFERENCES "public"."skills"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sub_agent_skills_skill_idx" ON "sub_agent_skills" USING btree ("skill_id");
