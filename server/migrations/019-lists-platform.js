/**
 * Migration 019 — Lists platform (Slack Lists equivalent), Phase 1.
 *
 * Creates Lists, ListFields, ListItems. A List belongs to one channel;
 * ListField is a column definition (type + options); ListItem's `values` is
 * a sparse JSON object keyed by ListField.id. Kanban view, subtasks,
 * per-item threads, templates, and workflow automation are later phases —
 * not modeled here.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/019-lists-platform.js --dry-run
 *   node migrations/019-lists-platform.js
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

const createTable = async (table, ddl) => {
    if (await tableExists(table)) {
        console.log(`  skip  ${table} (already present)`);
        return;
    }
    console.log(`  add   table ${table}`);
    if (!DRY_RUN) await sequelize.query(ddl);
};

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    await createTable('Lists', `
        CREATE TABLE Lists (
            id          CHAR(36)     NOT NULL PRIMARY KEY,
            channel_id  CHAR(36)     NOT NULL,
            name        VARCHAR(255) NOT NULL,
            icon        VARCHAR(16)  NOT NULL DEFAULT '📋',
            created_by  VARCHAR(255) NOT NULL,
            createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_lists_channel (channel_id)
        )
    `);

    await createTable('ListFields', `
        CREATE TABLE ListFields (
            id             CHAR(36)     NOT NULL PRIMARY KEY,
            list_id        CHAR(36)     NOT NULL,
            name           VARCHAR(255) NOT NULL,
            type           ENUM('text','long_text','select','status','priority','date','assignee','checkbox','number') NOT NULL DEFAULT 'text',
            options        JSON         NULL,
            position       INT          NOT NULL DEFAULT 0,
            is_title_field TINYINT(1)   NOT NULL DEFAULT 0,
            createdAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_listfields_list (list_id)
        )
    `);

    await createTable('ListItems', `
        CREATE TABLE ListItems (
            id          CHAR(36)     NOT NULL PRIMARY KEY,
            list_id     CHAR(36)     NOT NULL,
            \`values\`  JSON         NULL,
            position    INT          NOT NULL DEFAULT 0,
            created_by  VARCHAR(255) NOT NULL,
            createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_listitems_list (list_id)
        )
    `);

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
