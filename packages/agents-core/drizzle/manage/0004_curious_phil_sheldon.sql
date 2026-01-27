ALTER TABLE "triggers" ALTER COLUMN "signature_verification" SET DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "sub_agent_function_tool_relations" ADD COLUMN "tool_policies" jsonb;