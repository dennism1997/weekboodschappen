CREATE TABLE `favorite_website`
(
    `id`           text PRIMARY KEY NOT NULL,
    `household_id` text             NOT NULL,
    `url`          text             NOT NULL,
    `name`         text             NOT NULL,
    `created_at`   text             NOT NULL
);
