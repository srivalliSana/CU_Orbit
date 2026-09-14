/**
 * Migration 025 — custom emoji upload.
 *
 * Creates CustomEmojis — team-uploaded reaction emoji addressed by
 * :shortcode:, reusing the existing /uploads file-serving pipeline (just
 * another uploaded file, not raw image bytes in the DB).
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/025-custom-emoji.js --dry-run
 *   node migrations/025-custom-emoji.js
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

    if (await tableExists('CustomEmojis')) {
        console.log('  skip  CustomEmojis (already present)');
    } else {
        console.log('  add   table CustomEmojis');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE CustomEmojis (
                    id         CHAR(36)     NOT NULL PRIMARY KEY,
                    name       VARCHAR(32)  NOT NULL UNIQUE,
                    image_url  VARCHAR(255) NOT NULL,
                    created_by VARCHAR(255) NOT NULL,
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
