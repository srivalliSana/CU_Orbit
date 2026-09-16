/**
 * Migration 031 — Onboarding flow.
 *
 * Adds Users.has_onboarded (default false) — gates the one-time welcome
 * screen shown after a user's first sign-in, on both web and mobile.
 * Existing users get defaulted to false too (they'll see it once), which is
 * harmless — "Get started" dismisses it permanently in one tap.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/031-onboarding.js --dry-run
 *   node migrations/031-onboarding.js
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

    if (await columnExists('Users', 'has_onboarded')) {
        console.log('  skip  Users.has_onboarded (already present)');
    } else {
        console.log('  add   Users.has_onboarded');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Users ADD COLUMN has_onboarded TINYINT(1) NOT NULL DEFAULT 0`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
