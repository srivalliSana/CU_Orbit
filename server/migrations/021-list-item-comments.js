/**
 * Migration 021 — per-item comment threads for Lists.
 *
 * Creates ListItemComments — "every item has a dedicated thread" (Slack's
 * own phrasing for this). Text-only for now; attachments/reactions/@mention
 * resolution on comments are a later pass if this gets real use.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/021-list-item-comments.js --dry-run
 *   node migrations/021-list-item-comments.js
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

    if (await tableExists('ListItemComments')) {
        console.log('  skip  ListItemComments (already present)');
    } else {
        console.log('  add   table ListItemComments');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE ListItemComments (
                    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    list_item_id    CHAR(36)     NOT NULL,
                    user_id         VARCHAR(255) NOT NULL,
                    user_name       VARCHAR(255) NOT NULL,
                    user_avatar_url VARCHAR(255) NULL,
                    body            TEXT         NOT NULL,
                    createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_listitemcomments_item (list_item_id)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
