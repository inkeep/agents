CREATE TABLE "scheduler_state" (
	"id" varchar(64) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"current_run_id" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
