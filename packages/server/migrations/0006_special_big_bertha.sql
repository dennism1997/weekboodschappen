CREATE TABLE `cached_suggestion`
(
    `id`           text PRIMARY KEY NOT NULL,
    `household_id` text             NOT NULL,
    `data`         text             NOT NULL,
    `created_at`   text             NOT NULL
);
