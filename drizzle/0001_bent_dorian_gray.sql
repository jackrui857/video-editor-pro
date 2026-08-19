CREATE TABLE `project_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('video','audio','font','render') NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`storageKey` varchar(768) NOT NULL,
	`publicUrl` varchar(1024) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`aspectRatio` enum('16:9','9:16') NOT NULL DEFAULT '16:9',
	`outputQuality` enum('1080p','2160p') NOT NULL DEFAULT '1080p',
	`durationMs` int NOT NULL DEFAULT 0,
	`editorState` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_projects_id` PRIMARY KEY(`id`)
);
