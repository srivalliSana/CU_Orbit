/**
 * Migration 032 — Channel avatar/logo.
 *
 * Adds Channels.avatar_url (nullable) — a real uploaded photo for a
 * channel, instead of always falling back to the generated "#" icon.
 * Topic already covers "channel bio" — this is the missing "logo" half.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/032-channel-avatar.js --dry-run
 *   node migrations/032-channel-avatar.js
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

    if (await columnExists('Channels', 'avatar_url')) {
        console.log('  skip  Channels.avatar_url (already present)');
    } else {
        console.log('  add   Channels.avatar_url');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Channels ADD COLUMN avatar_url VARCHAR(255) NULL`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
