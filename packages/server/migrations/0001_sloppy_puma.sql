DROP TABLE `household`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
PRAGMA foreign_keys= OFF;--> statement-breakpoint
CREATE TABLE `__new_grocery_item`
(
    `id`               text PRIMARY KEY          NOT NULL,
    `grocery_list_id`  text                      NOT NULL,
    `name`             text                      NOT NULL,
    `quantity`         real                      NOT NULL,
    `unit`             text                      NOT NULL,
    `category`         text                      NOT NULL,
    `source`           text                      NOT NULL,
    `source_recipe_id` text,
    `status`           text    DEFAULT 'pending' NOT NULL,
    `sort_order`       integer DEFAULT 0         NOT NULL,
    `discount_info`    text,
    `checked_by`       text,
    `checked_at`       text,
    FOREIGN KEY (`grocery_list_id`) REFERENCES `grocery_list` (`id`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (`source_recipe_id`) REFERENCES `recipe` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_grocery_item`("id", "grocery_list_id", "name", "quantity", "unit", "category", "source", "source_recipe_id", "status", "sort_order",
                                 "discount_info", "checked_by", "checked_at")
SELECT "id",
       "grocery_list_id",
       "name",
       "quantity",
       "unit",
       "category",
       "source",
       "source_recipe_id",
       "status",
       "sort_order",
       "discount_info",
       "checked_by",
       "checked_at"
FROM `grocery_item`;--> statement-breakpoint
DROP TABLE `grocery_item`;--> statement-breakpoint
ALTER TABLE `__new_grocery_item`
    RENAME TO `grocery_item`;--> statement-breakpoint
PRAGMA foreign_keys= ON;--> statement-breakpoint
CREATE TABLE `__new_recipe`
(
    `id`                text PRIMARY KEY     NOT NULL,
    `household_id`      text                 NOT NULL,
    `title`             text                 NOT NULL,
    `source_url`        text,
    `image_url`         text,
    `servings`          integer DEFAULT 4    NOT NULL,
    `prep_time_minutes` integer,
    `cook_time_minutes` integer,
    `ingredients`       text                 NOT NULL,
    `instructions`      text                 NOT NULL,
    `tags`              text    DEFAULT '[]' NOT NULL,
    `times_cooked`      integer DEFAULT 0    NOT NULL,
    `last_cooked_at`    text,
    `created_at`        text                 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_recipe`("id", "household_id", "title", "source_url", "image_url", "servings", "prep_time_minutes", "cook_time_minutes", "ingredients",
                           "instructions", "tags", "times_cooked", "last_cooked_at", "created_at")
SELECT "id",
       "household_id",
       "title",
       "source_url",
       "image_url",
       "servings",
       "prep_time_minutes",
       "cook_time_minutes",
       "ingredients",
       "instructions",
       "tags",
       "times_cooked",
       "last_cooked_at",
       "created_at"
FROM `recipe`;--> statement-breakpoint
DROP TABLE `recipe`;--> statement-breakpoint
ALTER TABLE `__new_recipe`
    RENAME TO `recipe`;--> statement-breakpoint
CREATE TABLE `__new_shopping_history`
(
    `id`              text PRIMARY KEY NOT NULL,
    `household_id`    text             NOT NULL,
    `grocery_item_id` text             NOT NULL,
    `item_name`       text             NOT NULL,
    `category`        text             NOT NULL,
    `was_purchased`   integer          NOT NULL,
    `week_start`      text             NOT NULL,
    `store`           text             NOT NULL,
    FOREIGN KEY (`grocery_item_id`) REFERENCES `grocery_item` (`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_shopping_history`("id", "household_id", "grocery_item_id", "item_name", "category", "was_purchased", "week_start", "store")
SELECT "id",
       "household_id",
       "grocery_item_id",
       "item_name",
       "category",
       "was_purchased",
       "week_start",
       "store"
FROM `shopping_history`;--> statement-breakpoint
DROP TABLE `shopping_history`;--> statement-breakpoint
ALTER TABLE `__new_shopping_history`
    RENAME TO `shopping_history`;--> statement-breakpoint
CREATE TABLE `__new_store_config`
(
    `id`             text PRIMARY KEY NOT NULL,
    `household_id`   text             NOT NULL,
    `store`          text             NOT NULL,
    `category_order` text             NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_store_config`("id", "household_id", "store", "category_order")
SELECT "id", "household_id", "store", "category_order"
FROM `store_config`;--> statement-breakpoint
DROP TABLE `store_config`;--> statement-breakpoint
ALTER TABLE `__new_store_config`
    RENAME TO `store_config`;--> statement-breakpoint
CREATE TABLE `__new_weekly_plan`
(
    `id`           text PRIMARY KEY        NOT NULL,
    `household_id` text                    NOT NULL,
    `week_start`   text                    NOT NULL,
    `status`       text DEFAULT 'planning' NOT NULL,
    `store`        text                    NOT NULL,
    `created_at`   text                    NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_weekly_plan`("id", "household_id", "week_start", "status", "store", "created_at")
SELECT "id", "household_id", "week_start", "status", "store", "created_at"
FROM `weekly_plan`;--> statement-breakpoint
DROP TABLE `weekly_plan`;--> statement-breakpoint
ALTER TABLE `__new_weekly_plan`
    RENAME TO `weekly_plan`;--> statement-breakpoint
CREATE TABLE `__new_weekly_staple`
(
    `id`               text PRIMARY KEY      NOT NULL,
    `household_id`     text                  NOT NULL,
    `name`             text                  NOT NULL,
    `default_quantity` real                  NOT NULL,
    `unit`             text                  NOT NULL,
    `category`         text                  NOT NULL,
    `active`           integer DEFAULT true  NOT NULL,
    `auto_suggested`   integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_weekly_staple`("id", "household_id", "name", "default_quantity", "unit", "category", "active", "auto_suggested")
SELECT "id",
       "household_id",
       "name",
       "default_quantity",
       "unit",
       "category",
       "active",
       "auto_suggested"
FROM `weekly_staple`;--> statement-breakpoint
DROP TABLE `weekly_staple`;--> statement-breakpoint
ALTER TABLE `__new_weekly_staple`
    RENAME TO `weekly_staple`;
