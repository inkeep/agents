-- Drop all evaluation and dataset tables and their relations

-- Drop relation tables first (due to foreign key constraints)
DROP TABLE IF EXISTS "dataset_run_conversation_relations" CASCADE;
DROP TABLE IF EXISTS "evaluation_job_config_evaluator_relations" CASCADE;
DROP TABLE IF EXISTS "evaluation_suite_config_evaluator_relations" CASCADE;
DROP TABLE IF EXISTS "evaluation_run_config_evaluation_suite_config_relations" CASCADE;
DROP TABLE IF EXISTS "dataset_run_config_evaluation_run_config_relations" CASCADE;
DROP TABLE IF EXISTS "dataset_run_config_agent_relations" CASCADE;

-- Drop main tables
DROP TABLE IF EXISTS "evaluation_result" CASCADE;
DROP TABLE IF EXISTS "evaluation_run" CASCADE;
DROP TABLE IF EXISTS "evaluation_run_config" CASCADE;
DROP TABLE IF EXISTS "evaluation_job_config" CASCADE;
DROP TABLE IF EXISTS "evaluation_suite_config" CASCADE;
DROP TABLE IF EXISTS "dataset_run" CASCADE;
DROP TABLE IF EXISTS "dataset_run_config" CASCADE;
DROP TABLE IF EXISTS "evaluator" CASCADE;
DROP TABLE IF EXISTS "dataset_item" CASCADE;
DROP TABLE IF EXISTS "dataset" CASCADE;
