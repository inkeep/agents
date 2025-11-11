PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_eval_result` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_run_id` text,
	`dataset_item_id` text,
	`conversation_id` text NOT NULL,
	`status` text NOT NULL,
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`reasoning` text,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`,`project_id`,`conversation_id`) REFERENCES `conversations`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`evaluator_id`) REFERENCES `evaluator`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dataset_item_id`) REFERENCES `dataset_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_eval_result`("id", "suite_run_id", "dataset_item_id", "conversation_id", "status", "tenant_id", "project_id", "evaluator_id", "reasoning", "metadata", "created_at", "updated_at") 
SELECT 
  er.id, 
  er.suite_run_id, 
  er.dataset_item_id, 
  er.conversation_id, 
  er.status, 
  er.tenant_id, 
  COALESCE(c.project_id, a.project_id, 'default') as project_id, 
  er.evaluator_id, 
  er.reasoning, 
  er.metadata, 
  er.created_at, 
  er.updated_at 
FROM `eval_result` er
LEFT JOIN `conversations` c ON er.conversation_id = c.id AND er.tenant_id = c.tenant_id
LEFT JOIN `eval_test_suite_run` etsr ON er.suite_run_id = etsr.id
LEFT JOIN `agent` a ON etsr.agent_id = a.id AND er.tenant_id = a.tenant_id;--> statement-breakpoint
DROP TABLE `eval_result`;--> statement-breakpoint
ALTER TABLE `__new_eval_result` RENAME TO `eval_result`;--> statement-breakpoint
PRAGMA foreign_keys=ON;