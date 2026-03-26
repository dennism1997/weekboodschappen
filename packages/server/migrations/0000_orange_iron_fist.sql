CREATE TABLE `grocery_item` (
	`id` text PRIMARY KEY NOT NULL,
	`grocery_list_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`source_recipe_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`discount_info` text,
	`checked_by` text,
	`checked_at` text,
	FOREIGN KEY (`grocery_list_id`) REFERENCES `grocery_list`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`checked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `grocery_list` (
	`id` text PRIMARY KEY NOT NULL,
	`weekly_plan_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`weekly_plan_id`) REFERENCES `weekly_plan`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `household` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`preferred_store` text DEFAULT 'albert_heijn' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invite_code_unique` ON `household` (`invite_code`);--> statement-breakpoint
CREATE TABLE `product_discount` (
	`id` text PRIMARY KEY NOT NULL,
	`store` text NOT NULL,
	`product_name` text NOT NULL,
	`product_id` text,
	`category` text NOT NULL,
	`original_price` real NOT NULL,
	`sale_price` real NOT NULL,
	`discount_percentage` real NOT NULL,
	`valid_from` text NOT NULL,
	`valid_until` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`title` text NOT NULL,
	`source_url` text,
	`image_url` text,
	`servings` integer DEFAULT 4 NOT NULL,
	`prep_time_minutes` integer,
	`cook_time_minutes` integer,
	`ingredients` text NOT NULL,
	`instructions` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`times_cooked` integer DEFAULT 0 NOT NULL,
	`last_cooked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shopping_history` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`grocery_item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`category` text NOT NULL,
	`was_purchased` integer NOT NULL,
	`week_start` text NOT NULL,
	`store` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grocery_item_id`) REFERENCES `grocery_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `store_config` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`store` text NOT NULL,
	`category_order` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `weekly_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`week_start` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`store` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `weekly_plan_recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`weekly_plan_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`servings_override` integer,
	`day_of_week` integer,
	FOREIGN KEY (`weekly_plan_id`) REFERENCES `weekly_plan`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `weekly_staple` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`default_quantity` real NOT NULL,
	`unit` text NOT NULL,
	`category` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`auto_suggested` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
