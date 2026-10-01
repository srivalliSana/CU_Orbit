/**
 * Migration 037 — Channel sidebar sections ("Move to section").
 *
 * Adds ConversationPrefs.section (nullable free-text) — a per-user,
 * per-conversation sidebar folder name, same shape as the existing
 * wallpaper column added in migration 035. No separate Sections table:
 * a section only exists as the set of conversations currently carrying
 * its name.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/037-conversation-sections.js --dry-run
 *   node migrations/037-conversation-sections.js
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

    if (await columnExists('ConversationPrefs', 'section')) {
        console.log('  skip  ConversationPrefs.section (already present)');
    } else {
        console.log('  add   ConversationPrefs.section');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE ConversationPrefs ADD COLUMN section VARCHAR(60) NULL`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
