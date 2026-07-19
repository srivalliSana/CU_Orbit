/**
 * Migration 003 — per-recipient read receipts and last-seen.
 *
 * Message.status is one value per message, which works for a DM but cannot say
 * "3 of 7 read this" in a group. MessageReads records one row per reader.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/003-read-receipts-and-last-seen.js --dry-run
 *   node migrations/003-read-receipts-and-last-seen.js
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

const exists = async (table, column) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
        { replacements: { db: DB, table, column }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

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

    if (await exists('Users', 'last_seen_at')) {
        console.log('  skip  Users.last_seen_at (already present)');
    } else {
        console.log('  add   Users.last_seen_at DATETIME NULL');
        if (!DRY_RUN) await sequelize.query('ALTER TABLE Users ADD COLUMN last_seen_at DATETIME NULL');
    }

    if (await tableExists('MessageReads')) {
        console.log('  skip  MessageReads (already present)');
    } else {
        console.log('  add   table MessageReads');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE MessageReads (
                    id            INT AUTO_INCREMENT PRIMARY KEY,
                    message_id    CHAR(36)     NOT NULL,
                    container_id  VARCHAR(255) NOT NULL,
                    user_id       VARCHAR(255) NOT NULL,
                    read_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    createdAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    -- One read per person per message; the mark-read endpoint
                    -- relies on this to stay idempotent.
                    UNIQUE KEY uniq_message_reader (message_id, user_id),
                    KEY idx_container_reader (container_id, user_id)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
