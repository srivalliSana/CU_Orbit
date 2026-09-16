/**
 * Migration 029 — Status auto-expiry.
 *
 * Adds Users.status_expires_at (nullable) — a Slack-style "clears itself in
 * 1h/4h/today/this week" custom status instead of one that persists until
 * manually changed. Cleared by clearExpiredStatuses() in server.js.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/029-status-auto-expiry.js --dry-run
 *   node migrations/029-status-auto-expiry.js
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

    if (await columnExists('Users', 'status_expires_at')) {
        console.log('  skip  Users.status_expires_at (already present)');
    } else {
        console.log('  add   Users.status_expires_at');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Users ADD COLUMN status_expires_at DATETIME NULL`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
