/**
 * Migration 024 — "Send later" (scheduled messages).
 *
 * Creates ScheduledMessages. A row is picked up by a setInterval sweep in
 * server.js (sendDueScheduledMessages) and posted through the same
 * createMessage() a live send uses once its send_at time arrives.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/024-scheduled-messages.js --dry-run
 *   node migrations/024-scheduled-messages.js
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

    if (await tableExists('ScheduledMessages')) {
        console.log('  skip  ScheduledMessages (already present)');
    } else {
        console.log('  add   table ScheduledMessages');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE ScheduledMessages (
                    id                CHAR(36)     NOT NULL PRIMARY KEY,
                    sender_id         VARCHAR(255) NOT NULL,
                    sender_name       VARCHAR(255) NULL,
                    sender_avatar_url VARCHAR(255) NULL,
                    channel_id        VARCHAR(255) NOT NULL,
                    body              TEXT         NULL,
                    type              VARCHAR(32)  NOT NULL DEFAULT 'text',
                    media_url         VARCHAR(255) NULL,
                    media_name        VARCHAR(255) NULL,
                    media_mime_type   VARCHAR(255) NULL,
                    reply_to_id       CHAR(36)     NULL,
                    enriched_mentions JSON         NULL,
                    send_at           DATETIME     NOT NULL,
                    status            ENUM('pending','sent','canceled','failed') NOT NULL DEFAULT 'pending',
                    sent_message_id   CHAR(36)     NULL,
                    createdAt         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_scheduled_status_send_at (status, send_at),
                    KEY idx_scheduled_sender (sender_id)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
