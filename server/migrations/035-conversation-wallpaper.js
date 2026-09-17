/**
 * Migration 035 — Per-chat wallpaper.
 *
 * Adds ConversationPrefs.wallpaper (nullable) — a preset key or null for
 * the default background, per-user per-conversation, same as pin/mute.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/035-conversation-wallpaper.js --dry-run
 *   node migrations/035-conversation-wallpaper.js
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

    if (await columnExists('ConversationPrefs', 'wallpaper')) {
        console.log('  skip  ConversationPrefs.wallpaper (already present)');
    } else {
        console.log('  add   ConversationPrefs.wallpaper');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE ConversationPrefs ADD COLUMN wallpaper VARCHAR(255) NULL`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
