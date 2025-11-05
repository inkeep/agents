PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversation_evaluation_config_evaluator` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_evaluation_config_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_evaluation_config_id`) REFERENCES `conversation_evaluation_config`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`evaluator_id`) REFERENCES `evaluator`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_conversation_evaluation_config_evaluator`("id", "conversation_evaluation_config_id", "tenant_id", "evaluator_id", "created_at", "updated_at") 
SELECT 
  cece.id, 
  cece.conversation_evaluation_config_id, 
  cec.tenant_id, 
  cece.evaluator_id, 
  cece.created_at, 
  cece.updated_at 
FROM `conversation_evaluation_config_evaluator` cece
JOIN `conversation_evaluation_config` cec ON cece.conversation_evaluation_config_id = cec.id;--> statement-breakpoint
DROP TABLE `conversation_evaluation_config_evaluator`;--> statement-breakpoint
ALTER TABLE `__new_conversation_evaluation_config_evaluator` RENAME TO `conversation_evaluation_config_evaluator`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_eval_result` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_run_id` text,
	`dataset_item_id` text,
	`conversation_id` text NOT NULL,
	`status` text NOT NULL,
	`tenant_id` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`reasoning` text,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`evaluator_id`) REFERENCES `evaluator`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dataset_item_id`) REFERENCES `dataset_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_eval_result`("id", "suite_run_id", "dataset_item_id", "conversation_id", "status", "tenant_id", "evaluator_id", "reasoning", "metadata", "created_at", "updated_at") 
SELECT 
  er.id, 
  er.suite_run_id, 
  er.dataset_item_id, 
  er.conversation_id, 
  er.status, 
  c.tenant_id, 
  er.evaluator_id, 
  er.reasoning, 
  er.metadata, 
  er.created_at, 
  er.updated_at 
FROM `eval_result` er
JOIN `conversations` c ON er.conversation_id = c.id;--> statement-breakpoint
DROP TABLE `eval_result`;--> statement-breakpoint
ALTER TABLE `__new_eval_result` RENAME TO `eval_result`;--> statement-breakpoint
CREATE TABLE `__new_eval_test_suite_run_evaluators` (
	`id` text PRIMARY KEY NOT NULL,
	`eval_test_suite_run_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`eval_test_suite_run_id`) REFERENCES `eval_test_suite_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`evaluator_id`) REFERENCES `evaluator`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_eval_test_suite_run_evaluators`("id", "eval_test_suite_run_id", "tenant_id", "evaluator_id", "created_at", "updated_at") 
SELECT 
  etsre.id, 
  etsre.eval_test_suite_run_id, 
  e.tenant_id, 
  etsre.evaluator_id, 
  etsre.created_at, 
  etsre.updated_at 
FROM `eval_test_suite_run_evaluators` etsre
JOIN `evaluator` e ON etsre.evaluator_id = e.id;--> statement-breakpoint
DROP TABLE `eval_test_suite_run_evaluators`;--> statement-breakpoint
ALTER TABLE `__new_eval_test_suite_run_evaluators` RENAME TO `eval_test_suite_run_evaluators`;