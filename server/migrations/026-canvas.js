/**
 * Migration 026 — Canvas (one pinned doc per channel).
 *
 * Creates Canvases. One row per channel (channel_id is unique) — Slack's
 * "channel canvas" equivalent, not the multi-canvas-per-channel version.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/026-canvas.js --dry-run
 *   node migrations/026-canvas.js
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

    if (await tableExists('Canvases')) {
        console.log('  skip  Canvases (already present)');
    } else {
        console.log('  add   table Canvases');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE Canvases (
                    id         CHAR(36)     NOT NULL PRIMARY KEY,
                    channel_id CHAR(36)     NOT NULL UNIQUE,
                    title      VARCHAR(255) NOT NULL DEFAULT 'Untitled canvas',
                    body       LONGTEXT     NULL,
                    created_by VARCHAR(255) NOT NULL,
                    updated_by VARCHAR(255) NULL,
                    createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
