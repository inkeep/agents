ALTER TABLE "policies" RENAME TO "skills";--> statement-breakpoint
ALTER TABLE "sub_agent_policies" RENAME TO "sub_agent_skills";--> statement-breakpoint
ALTER TABLE "sub_agent_skills" RENAME COLUMN "policy_id" TO "skill_id";--> statement-breakpoint
ALTER TABLE "sub_agent_skills" DROP CONSTRAINT "sub_agent_policies_sub_agent_policy_unique";--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "policies_project_fk";
--> statement-breakpoint
ALTER TABLE "sub_agent_skills" DROP CONSTRAINT "sub_agent_policies_sub_agent_fk";
--> statement-breakpoint
ALTER TABLE "sub_agent_skills" DROP CONSTRAINT "sub_agent_policies_policy_fk";
--> statement-breakpoint
DROP INDEX "sub_agent_policies_policy_idx";--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "policies_tenant_id_project_id_id_pk";--> statement-breakpoint
ALTER TABLE "sub_agent_skills" DROP CONSTRAINT "sub_agent_policies_tenant_id_project_id_agent_id_id_pk";--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id");--> statement-breakpoint
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_skill_fk" FOREIGN KEY ("tenant_id","project_id","skill_id") REFERENCES "public"."skills"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sub_agent_skills_skill_idx" ON "sub_agent_skills" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_sub_agent_skill_unique" UNIQUE("sub_agent_id","skill_id");