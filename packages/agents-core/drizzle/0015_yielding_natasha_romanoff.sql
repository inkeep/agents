CREATE TABLE `conversation_evaluation_config` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`conversation_filter` blob,
	`model_config` blob,
	`sample_rate` real,
	`is_active` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `conversation_evaluation_config_evaluator` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_evaluation_config_id` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_evaluation_config_id`) REFERENCES `conversation_evaluation_config`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evaluator_id`) REFERENCES `evaluator`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dataset` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `dataset_item` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset_id` text NOT NULL,
	`input` blob,
	`expected_output` blob,
	`simulation_config` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `dataset`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `eval_result` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_run_id` text,
	`dataset_item_id` text,
	`conversation_id` text NOT NULL,
	`status` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`reasoning` text,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evaluator_id`) REFERENCES `evaluator`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dataset_item_id`) REFERENCES `dataset_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `eval_test_suite_config` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`model_config` blob,
	`run_frequency` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `eval_test_suite_run` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`dataset_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`test_suite_config_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `dataset`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_suite_config_id`) REFERENCES `eval_test_suite_config`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `eval_test_suite_run_evaluators` (
	`id` text PRIMARY KEY NOT NULL,
	`eval_test_suite_run_id` text NOT NULL,
	`evaluator_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`eval_test_suite_run_id`) REFERENCES `eval_test_suite_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evaluator_id`) REFERENCES `evaluator`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `evaluator` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`schema` blob NOT NULL,
	`model_config` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
