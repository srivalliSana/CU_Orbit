/**
 * Migration 034 — Block users.
 *
 * Creates Blocks (blocker_id, blocked_id, unique composite) — checked both
 * directions on every DM send (see POST /api/messages), so it doesn't
 * matter which of the two people initiated the block.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/034-block-users.js --dry-run
 *   node migrations/034-block-users.js
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

    if (await tableExists('Blocks')) {
        console.log('  skip  Blocks (already present)');
    } else {
        console.log('  add   table Blocks');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE Blocks (
                    id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    blocker_id VARCHAR(255) NOT NULL,
                    blocked_id VARCHAR(255) NOT NULL,
                    createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY blocker_blocked_unique (blocker_id, blocked_id)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
