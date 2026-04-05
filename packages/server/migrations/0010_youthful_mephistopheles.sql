CREATE TABLE IF NOT EXISTS `__new_grocery_list` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL DEFAULT '',
	`weekly_plan_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`weekly_plan_id`) REFERENCES `weekly_plan`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT OR IGNORE INTO `__new_grocery_list`("id", "household_id", "weekly_plan_id", "created_at")
  SELECT gl."id", COALESCE(wp."household_id", ''), gl."weekly_plan_id", gl."created_at"
  FROM `grocery_list` gl
  LEFT JOIN `weekly_plan` wp ON wp."id" = gl."weekly_plan_id";--> statement-breakpoint
DROP TABLE IF EXISTS `grocery_list`;--> statement-breakpoint
ALTER TABLE `__new_grocery_list` RENAME TO `grocery_list`;
