/**
 * Migration 022 — "Convert to list item".
 *
 * Adds ListItems.source_message_id (nullable, soft reference — not a hard
 * FK, matching Message.reply_to's own convention) so an item created from
 * a chat message can link back to it.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/022-list-item-source-message.js --dry-run
 *   node migrations/022-list-item-source-message.js
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

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    if (await columnExists('ListItems', 'source_message_id')) {
        console.log('  skip  ListItems.source_message_id (already present)');
    } else {
        console.log('  add   ListItems.source_message_id');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE ListItems ADD COLUMN source_message_id CHAR(36) NULL`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
