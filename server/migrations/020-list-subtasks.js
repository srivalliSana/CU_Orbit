/**
 * Migration 020 — Lists subtasks.
 *
 * Adds ListItems.parent_item_id (nullable, indexed) — a subtask is just a
 * regular ListItem with this set, one level of nesting only (matching
 * Slack's own Lists: a subtask can't itself have subtasks).
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/020-list-subtasks.js --dry-run
 *   node migrations/020-list-subtasks.js
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

const columnExists = async (table, column) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
        { replacements: { db: DB, table, column }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

const indexExists = async (table, indexName) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND INDEX_NAME = :indexName`,
        { replacements: { db: DB, table, indexName }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    if (await columnExists('ListItems', 'parent_item_id')) {
        console.log('  skip  ListItems.parent_item_id (already present)');
    } else {
        console.log('  add   ListItems.parent_item_id');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE ListItems ADD COLUMN parent_item_id CHAR(36) NULL`);
    }

    if (await indexExists('ListItems', 'idx_listitems_parent')) {
        console.log('  skip  ListItems index on parent_item_id (already present)');
    } else {
        console.log('  add   ListItems index on parent_item_id');
        if (!DRY_RUN) await sequelize.query(`CREATE INDEX idx_listitems_parent ON ListItems (parent_item_id)`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
