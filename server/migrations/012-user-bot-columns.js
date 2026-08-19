/**
 * Migration 012 — User.is_bot / User.app_id.
 *
 * The User model picked these up as prep for the (paused) Apps platform
 * work, but no migration was ever written for them — DB_SYNC's default
 * "safe" mode only creates missing tables, never alters existing ones, so
 * the live Users table never got the columns. Every User query has been
 * failing with "Unknown column 'is_bot' in 'field list'" since that model
 * change shipped, including sign-in. Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/012-user-bot-columns.js --dry-run
 *   node migrations/012-user-bot-columns.js
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

    if (await columnExists('Users', 'is_bot')) {
        console.log('  skip  Users.is_bot (already present)');
    } else {
        console.log('  add   Users.is_bot');
        if (!DRY_RUN) {
            await sequelize.query(`ALTER TABLE Users ADD COLUMN is_bot TINYINT(1) NOT NULL DEFAULT 0`);
        }
    }

    if (await columnExists('Users', 'app_id')) {
        console.log('  skip  Users.app_id (already present)');
    } else {
        console.log('  add   Users.app_id');
        if (!DRY_RUN) {
            await sequelize.query(`ALTER TABLE Users ADD COLUMN app_id CHAR(36) NULL`);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
