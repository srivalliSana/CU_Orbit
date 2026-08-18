/**
 * Migration 009 — "delete for me".
 *
 * Adds a HiddenMessages table for per-user message hiding, separate from
 * the existing global soft-delete ("delete for everyone"). Idempotent; safe
 * to re-run.
 *
 * Usage:
 *   node migrations/009-hidden-messages.js --dry-run
 *   node migrations/009-hidden-messages.js
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

const tableExists = async (table) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table`,
        { replacements: { db: DB, table }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    if (await tableExists('HiddenMessages')) {
        console.log('  skip  HiddenMessages (already present)');
    } else {
        console.log('  add   table HiddenMessages');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE HiddenMessages (
                    id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id     VARCHAR(255) NOT NULL,
                    message_id  CHAR(36)     NOT NULL,
                    createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_user_message (user_id, message_id)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
