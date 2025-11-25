DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sub_agent_tool_relations')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sub_agent_tool_relations' AND column_name = 'tool_policies')
    THEN
        ALTER TABLE "sub_agent_tool_relations" ADD COLUMN "tool_policies" jsonb;
    END IF;
END $$;