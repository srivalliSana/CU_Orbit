-- CU Orbit Database Schema
-- Generated from Sequelize Models

CREATE DATABASE IF NOT EXISTS `cu_orbit`;
USE `cu_orbit`;

-- Users Table
CREATE TABLE IF NOT EXISTS `Users` (
    `id` CHAR(36) BINARY PRIMARY KEY,
    `phone` VARCHAR(255) UNIQUE,
    `name` VARCHAR(255),
    `handle` VARCHAR(255) UNIQUE,
    `email` VARCHAR(255),
    `avatarUrl` VARCHAR(255) DEFAULT '',
    `bio` TEXT,
    `status_emoji` VARCHAR(255) DEFAULT '✨',
    `status_text` VARCHAR(255) DEFAULT '',
    `presence` ENUM('online', 'away', 'dnd', 'offline') DEFAULT 'online',
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- Workspaces Table
CREATE TABLE IF NOT EXISTS `Workspaces` (
    `id` CHAR(36) BINARY PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) UNIQUE,
    `icon_url` VARCHAR(255) DEFAULT '',
    `description` TEXT,
    `member_count` INTEGER DEFAULT 0,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- Channels Table
CREATE TABLE IF NOT EXISTS `Channels` (
    `id` CHAR(36) BINARY PRIMARY KEY,
    `workspace_id` CHAR(36) BINARY,
    `name` VARCHAR(255) NOT NULL,
    `type` ENUM('public', 'private') DEFAULT 'public',
    `topic` VARCHAR(255) DEFAULT '',
    `member_count` INTEGER DEFAULT 0,
    `pinned_message_count` INTEGER DEFAULT 0,
    `is_muted` BOOLEAN DEFAULT false,
    `invite_code` VARCHAR(255) UNIQUE,
    `created_by` VARCHAR(255),
    `restricted_messaging` BOOLEAN DEFAULT false,
    `info_edit_restricted` BOOLEAN DEFAULT false,
    `approval_required` BOOLEAN DEFAULT false,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL,
    FOREIGN KEY (`workspace_id`) REFERENCES `Workspaces` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
);

-- ChannelMembers Table
CREATE TABLE IF NOT EXISTS `ChannelMembers` (
    `id` INTEGER AUTO_INCREMENT PRIMARY KEY,
    `channelId` CHAR(36) BINARY NOT NULL,
    `userId` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'member') DEFAULT 'member',
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL,
    FOREIGN KEY (`channelId`) REFERENCES `Channels` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

-- ConversationPrefs Table
CREATE TABLE IF NOT EXISTS `ConversationPrefs` (
    `id` INTEGER AUTO_INCREMENT PRIMARY KEY,
    `userId` VARCHAR(255) NOT NULL,
    `containerId` VARCHAR(255) NOT NULL,
    `isPinned` BOOLEAN DEFAULT false,
    `isMuted` BOOLEAN DEFAULT false,
    `isHidden` BOOLEAN DEFAULT false,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- Messages Table
CREATE TABLE IF NOT EXISTS `Messages` (
    `id` CHAR(36) BINARY PRIMARY KEY,
    `channelId` VARCHAR(255),
    `dm_id` VARCHAR(255),
    `senderId` VARCHAR(255) NOT NULL,
    `senderName` VARCHAR(255),
    `senderAvatarUrl` VARCHAR(255),
    `body` TEXT,
    `type` ENUM('text', 'image', 'voice', 'file', 'system') DEFAULT 'text',
    `attachments` JSON,
    `reactions` JSON,
    `thread_reply_count` INTEGER DEFAULT 0,
    `is_pinned` BOOLEAN DEFAULT false,
    `status` VARCHAR(255) DEFAULT 'sent',
    `timestamp` BIGINT,
    `edited_at` DATETIME,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- Mentions Table
CREATE TABLE IF NOT EXISTS `Mentions` (
    `id` CHAR(36) BINARY PRIMARY KEY,
    `message_id` CHAR(36) BINARY NOT NULL,
    `mentioned_user_id` VARCHAR(255) NOT NULL,
    `source_channel_id` VARCHAR(255) NOT NULL,
    `is_read` BOOLEAN DEFAULT false,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL,
    FOREIGN KEY (`message_id`) REFERENCES `Messages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Threads Table
CREATE TABLE IF NOT EXISTS `Threads` (
    `id` CHAR(36) BINARY PRIMARY KEY,
    `parent_message_id` CHAR(36) BINARY NOT NULL,
    `channel_id` VARCHAR(255) NOT NULL,
    `participant_ids` JSON,
    `reply_count` INTEGER DEFAULT 0,
    `has_unread` BOOLEAN DEFAULT false,
    `last_reply_at` BIGINT,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- Status Table (Stories)
CREATE TABLE IF NOT EXISTS `Statuses` (
    `id` CHAR(36) BINARY PRIMARY KEY,
    `userId` VARCHAR(255) NOT NULL,
    `userName` VARCHAR(255),
    `mediaUrl` VARCHAR(255) NOT NULL,
    `caption` TEXT,
    `type` VARCHAR(255) DEFAULT 'image',
    `mentions` JSON,
    `expiresAt` DATETIME,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- TypingStatus Table
CREATE TABLE IF NOT EXISTS `TypingStatuses` (
    `channelId` VARCHAR(255) NOT NULL,
    `userId` VARCHAR(255) NOT NULL,
    `userName` VARCHAR(255),
    `lastTypedAt` BIGINT,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL,
    PRIMARY KEY (`channelId`, `userId`)
);
