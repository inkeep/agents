ALTER TABLE "sub_agent_skills" DROP CONSTRAINT "sub_agent_skills_sub_agent_skill_unique";--> statement-breakpoint
ALTER TABLE "sub_agent_skills" ADD CONSTRAINT "sub_agent_skills_sub_agent_skill_unique" UNIQUE("tenant_id","project_id","agent_id","sub_agent_id","skill_id");
