/**
 * Migration 007 — reply / forward / star.
 *
 * Adds message reply-quoting and forward-labeling columns, plus a new
 * StarredMessages table for private per-user bookmarks. Idempotent; safe to
 * re-run.
 *
 * Usage:
 *   node migrations/007-reply-forward-star.js --dry-run
 *   node migrations/007-reply-forward-star.js
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

const exists = async (table, column) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
        { replacements: { db: DB, table, column }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

const tableExists = async (table) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table`,
        { replacements: { db: DB, table }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

async function addColumn(table, column, ddl) {
    if (await exists(table, column)) {
        console.log(`  skip  ${table}.${column} (already present)`);
    } else {
        console.log(`  add   ${table}.${column}`);
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
}

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    await addColumn('Messages', 'reply_to', 'reply_to JSON NULL');
    await addColumn('Messages', 'forwarded_from', 'forwarded_from JSON NULL');

    if (await tableExists('StarredMessages')) {
        console.log('  skip  StarredMessages (already present)');
    } else {
        console.log('  add   table StarredMessages');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE StarredMessages (
                    id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id      VARCHAR(255) NOT NULL,
                    message_id   CHAR(36)     NOT NULL,
                    container_id VARCHAR(255) NOT NULL,
                    createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_user_message (user_id, message_id)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
