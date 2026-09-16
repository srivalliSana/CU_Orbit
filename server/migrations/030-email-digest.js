/**
 * Migration 030 — Email digest.
 *
 * Adds Users.email_digest_opt_out (default false — opt-out, matching
 * Slack's own default) and Users.last_digest_sent_at, used by the
 * sendDailyDigests() sweep in server.js.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/030-email-digest.js --dry-run
 *   node migrations/030-email-digest.js
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

    if (await columnExists('Users', 'email_digest_opt_out')) {
        console.log('  skip  Users.email_digest_opt_out (already present)');
    } else {
        console.log('  add   Users.email_digest_opt_out');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Users ADD COLUMN email_digest_opt_out TINYINT(1) NOT NULL DEFAULT 0`);
    }

    if (await columnExists('Users', 'last_digest_sent_at')) {
        console.log('  skip  Users.last_digest_sent_at (already present)');
    } else {
        console.log('  add   Users.last_digest_sent_at');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Users ADD COLUMN last_digest_sent_at DATETIME NULL`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
