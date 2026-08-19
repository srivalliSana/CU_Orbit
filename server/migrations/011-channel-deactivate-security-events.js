/**
 * Migration 011 — channel deactivate/reactivate + security-events table.
 *
 * Adds Channels.is_active (superadmin "deactivate" instead of delete — the
 * channel and its history stay intact, hidden and read/write-locked until
 * reactivated) and creates SecurityEvents (the security-monitor log:
 * failed logins, invalid tokens, rate-limit lockouts, with IP + offline
 * geo-IP location). Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/011-channel-deactivate-security-events.js --dry-run
 *   node migrations/011-channel-deactivate-security-events.js
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

    if (await columnExists('Channels', 'is_active')) {
        console.log('  skip  Channels.is_active (already present)');
    } else {
        console.log('  add   Channels.is_active');
        if (!DRY_RUN) {
            await sequelize.query(`ALTER TABLE Channels ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`);
        }
    }

    if (await tableExists('SecurityEvents')) {
        console.log('  skip  SecurityEvents (already present)');
    } else {
        console.log('  add   table SecurityEvents');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE SecurityEvents (
                    id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    type        VARCHAR(255) NOT NULL,
                    ip          VARCHAR(255) NULL,
                    location    VARCHAR(255) NULL,
                    detail      VARCHAR(255) NULL,
                    createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_security_events_created (createdAt)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
