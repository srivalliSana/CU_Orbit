/**
 * Migration 005 — channel join requests.
 *
 * Students joining via an invite link now always land in a pending-approval
 * queue instead of being silently admitted; this table is where that queue
 * lives. Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/005-join-requests.js --dry-run
 *   node migrations/005-join-requests.js
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

    if (await tableExists('ChannelJoinRequests')) {
        console.log('  skip  ChannelJoinRequests (already present)');
    } else {
        console.log('  add   table ChannelJoinRequests');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE ChannelJoinRequests (
                    id           CHAR(36)     NOT NULL PRIMARY KEY,
                    channelId    CHAR(36)     NOT NULL,
                    userId       VARCHAR(255) NOT NULL,
                    userName     VARCHAR(255) NULL,
                    status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
                    createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_channel_status (channelId, status)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
