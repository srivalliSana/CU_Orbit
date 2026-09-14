/**
 * Migration 023 — multi-select Lists field type.
 *
 * Widens ListFields.type's ENUM to include 'multi_select'. Also fixes a
 * real pre-existing bug in CSV import: a freshly-imported select/status/
 * priority column never got its `options` populated, so every imported
 * value silently failed to match any option and rendered blank. That's a
 * code fix (server.js), not a schema change — nothing to backfill here for
 * columns imported that way in the past, since the raw label text they
 * stored is still visible as a mismatched (unrenderable) value; re-import
 * or manually re-enter those cells if this affected an existing list.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/023-list-multi-select.js --dry-run
 *   node migrations/023-list-multi-select.js
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

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    const rows = await sequelize.query(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'ListFields' AND COLUMN_NAME = 'type'`,
        { replacements: { db: DB }, type: QueryTypes.SELECT }
    );
    const row = rows[0];

    if (row?.COLUMN_TYPE?.includes("'multi_select'")) {
        console.log('  skip  ListFields.type already includes multi_select');
    } else {
        console.log('  widen ListFields.type ENUM to include multi_select');
        if (!DRY_RUN) {
            await sequelize.query(`
                ALTER TABLE ListFields
                MODIFY COLUMN type ENUM('text','long_text','select','multi_select','status','priority','date','assignee','checkbox','number')
                NOT NULL DEFAULT 'text'
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
