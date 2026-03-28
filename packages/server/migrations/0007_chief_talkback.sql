ALTER TABLE `organization` ADD `status` text DEFAULT 'waiting' NOT NULL;
UPDATE `organization` SET `status` = 'active' WHERE `status` = 'waiting';