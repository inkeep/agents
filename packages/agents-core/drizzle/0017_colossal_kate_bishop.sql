PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversation_evaluation_config_evaluator` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_evaluation_config_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`,`conversation_evaluation_config_id`) REFERENCES `conversation_evaluation_config`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
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
PRAGMA foreign_keys=ON;