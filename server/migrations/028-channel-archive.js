/**
 * Migration 028 — Channel archiving.
 *
 * Adds Channels.archived_at (nullable) — a channel-admin-level "archive"
 * distinct from the existing superadmin-only is_active "deactivate": read-
 * only, everyone can still see it and scroll history, just can't post, and
 * it stays visible/browsable rather than disappearing.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/028-channel-archive.js --dry-run
 *   node migrations/028-channel-archive.js
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

    if (await columnExists('Channels', 'archived_at')) {
        console.log('  skip  Channels.archived_at (already present)');
    } else {
        console.log('  add   Channels.archived_at');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Channels ADD COLUMN archived_at DATETIME NULL`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
