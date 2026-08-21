/**
 * Migration 014 — User.push_token.
 *
 * Backs mobile push notifications (Expo push token, registered via
 * PUT /api/users/me/push-token). DB_SYNC's default "safe" mode only creates
 * missing tables, never alters existing ones, so this column needs an
 * explicit migration same as the is_bot/app_id lesson from migration 012.
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/014-user-push-token.js --dry-run
 *   node migrations/014-user-push-token.js
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

    if (await columnExists('Users', 'push_token')) {
        console.log('  skip  Users.push_token (already present)');
    } else {
        console.log('  add   Users.push_token');
        if (!DRY_RUN) {
            await sequelize.query(`ALTER TABLE Users ADD COLUMN push_token VARCHAR(255) NULL`);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
