CREATE TABLE IF NOT EXISTS `release_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `min_score` integer NOT NULL DEFAULT 50,
  `preferred_platform` text,
  `protocol_preference` text NOT NULL DEFAULT 'either',
  `required_terms` text DEFAULT '[]',
  `ignored_terms` text DEFAULT '[]',
  `min_seeders` integer NOT NULL DEFAULT 0,
  `max_size` integer,
  `is_default` integer NOT NULL DEFAULT 1,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  `updated_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `release_profiles_user_default_idx` ON `release_profiles` (`user_id`, `is_default`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `custom_formats` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `condition_type` text NOT NULL,
  `matcher_mode` text NOT NULL,
  `matcher_value` text NOT NULL DEFAULT '',
  `score` integer NOT NULL DEFAULT 0,
  `enabled` integer NOT NULL DEFAULT 1,
  `hard_reject` integer NOT NULL DEFAULT 0,
  `built_in` integer NOT NULL DEFAULT 0,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  `updated_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
UPDATE `user_settings` SET `auto_search_enabled` = 0, `auto_download_enabled` = 0;
