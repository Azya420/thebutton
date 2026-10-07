CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`a` text NOT NULL,
	`b` text NOT NULL,
	`sender` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`start` text,
	`winner` text,
	`score` integer,
	`ended` text,
	`created` integer NOT NULL,
	FOREIGN KEY (`a`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`b`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_open_duel` ON `challenges` (`a`,`b`) WHERE "challenges"."status" IN ('pending','active');--> statement-breakpoint
CREATE TABLE `clicks` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `click_day` ON `clicks` (`day`);--> statement-breakpoint
CREATE TABLE `friends` (
	`a` text NOT NULL,
	`b` text NOT NULL,
	`sender` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`a`, `b`),
	FOREIGN KEY (`a`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`b`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`user_id` text NOT NULL,
	`item` text NOT NULL,
	`price` integer NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_expiry` ON `sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_key` text NOT NULL,
	`password` text NOT NULL,
	`salt` text NOT NULL,
	`created` integer NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`lifetime` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`best` integer DEFAULT 0 NOT NULL,
	`last_day` text,
	`button` text DEFAULT 'classic' NOT NULL,
	`avatar` text DEFAULT 'default' NOT NULL,
	`frame` text DEFAULT 'none' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	CONSTRAINT "nonnegative_balance" CHECK("users"."balance" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_key_unique` ON `users` (`username_key`);--> statement-breakpoint
CREATE TRIGGER click_reward AFTER INSERT ON clicks BEGIN
 UPDATE users SET
 best=MAX(best,CASE WHEN last_day=date(NEW.day,'-1 day') THEN streak+1 ELSE 1 END),
 streak=CASE WHEN last_day=date(NEW.day,'-1 day') THEN streak+1 ELSE 1 END,
 last_day=NEW.day,balance=balance+100,lifetime=lifetime+100,total=total+1 WHERE id=NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_charge AFTER INSERT ON purchases BEGIN
 UPDATE users SET balance=balance-NEW.price WHERE id=NEW.user_id;
END;
