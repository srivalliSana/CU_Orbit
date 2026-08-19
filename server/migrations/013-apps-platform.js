/**
 * Migration 013 — Apps platform (OAuth authorization server), Phase 1.
 *
 * Creates the five new tables backing installable OAuth apps and slash
 * commands: App, AppAuthorizationCode, AppToken, AppInstallation,
 * SlashCommand. No admin UI exists yet — apps are registered by inserting
 * rows directly (see the plan's Phase 1 verification steps). Idempotent;
 * safe to re-run.
 *
 * Usage:
 *   node migrations/013-apps-platform.js --dry-run
 *   node migrations/013-apps-platform.js
 */

const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');
const DB = process.env.DB_NAME || 'cu_orbit';

const sequelize = new Sequelize(DB, process.env.DB_USER || 'root', process.env.DB_PASS || '', {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
});

const tableExists = async (table) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table`,
        { replacements: { db: DB, table }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

const TABLES = [
    {
        name: 'Apps',
        sql: `
            CREATE TABLE Apps (
                id                  CHAR(36)     NOT NULL PRIMARY KEY,
                name                VARCHAR(255) NOT NULL,
                description         TEXT,
                icon_url            VARCHAR(255) DEFAULT '',
                owner_user_id       VARCHAR(255) NOT NULL,
                client_id           VARCHAR(255) NOT NULL UNIQUE,
                client_secret_hash  VARCHAR(255) NOT NULL,
                redirect_uris       JSON,
                scopes              JSON,
                is_first_party      TINYINT(1)   NOT NULL DEFAULT 0,
                status              ENUM('pending','approved','suspended') NOT NULL DEFAULT 'approved',
                createdAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `,
    },
    {
        name: 'AppAuthorizationCodes',
        sql: `
            CREATE TABLE AppAuthorizationCodes (
                id                     INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                code                   VARCHAR(255) NOT NULL UNIQUE,
                app_id                 CHAR(36)     NOT NULL,
                user_id                VARCHAR(255) NOT NULL,
                redirect_uri           VARCHAR(255) NOT NULL,
                scopes                 JSON,
                code_challenge         VARCHAR(255) NULL,
                code_challenge_method  VARCHAR(20)  NULL,
                expires_at             DATETIME     NOT NULL,
                used_at                DATETIME     NULL,
                createdAt              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_auth_codes_app (app_id)
            )
        `,
    },
    {
        name: 'AppTokens',
        sql: `
            CREATE TABLE AppTokens (
                id                   INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                app_id               CHAR(36)     NOT NULL,
                installation_id      CHAR(36)     NOT NULL,
                access_token_hash    VARCHAR(255) NOT NULL UNIQUE,
                refresh_token_hash   VARCHAR(255) NULL UNIQUE,
                scopes               JSON,
                expires_at           DATETIME     NOT NULL,
                refresh_expires_at   DATETIME     NULL,
                revoked_at           DATETIME     NULL,
                createdAt            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_app_tokens_installation (installation_id)
            )
        `,
    },
    {
        name: 'AppInstallations',
        sql: `
            CREATE TABLE AppInstallations (
                id               CHAR(36)     NOT NULL PRIMARY KEY,
                app_id           CHAR(36)     NOT NULL,
                installed_by     VARCHAR(255) NOT NULL,
                workspace_id     VARCHAR(255) NULL,
                granted_scopes   JSON,
                bot_user_id      VARCHAR(255) NULL,
                status           ENUM('active','revoked') NOT NULL DEFAULT 'active',
                revoked_at       DATETIME     NULL,
                createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_installations_app (app_id),
                INDEX idx_installations_workspace (workspace_id)
            )
        `,
    },
    {
        name: 'SlashCommands',
        sql: `
            CREATE TABLE SlashCommands (
                id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                app_id       CHAR(36)     NOT NULL,
                command      VARCHAR(255) NOT NULL UNIQUE,
                description  VARCHAR(255) DEFAULT '',
                usage_hint   VARCHAR(255) DEFAULT '',
                webhook_url  VARCHAR(255) NOT NULL,
                createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_slash_commands_app (app_id)
            )
        `,
    },
];

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    for (const t of TABLES) {
        if (await tableExists(t.name)) {
            console.log(`  skip  ${t.name} (already present)`);
        } else {
            console.log(`  add   table ${t.name}`);
            if (!DRY_RUN) await sequelize.query(t.sql);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
