/**
 * Migration 038 — CU AI (floating-bubble assistant) chat history.
 *
 * Creates AiMessages — one flat per-user transcript (role: 'user' |
 * 'assistant'), not modeled as a channel/DM since CU AI is a single
 * always-available assistant, not a conversation with membership/invite
 * semantics. Private to the user who sent it.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/038-ai-messages.js --dry-run
 *   node migrations/038-ai-messages.js
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

    if (await tableExists('AiMessages')) {
        console.log('  skip  AiMessages (already present)');
        if (await columnExists('AiMessages', 'image_url')) {
            console.log('  skip  AiMessages.image_url (already present)');
        } else {
            console.log('  add   AiMessages.image_url');
            if (!DRY_RUN) await sequelize.query(`ALTER TABLE AiMessages ADD COLUMN image_url VARCHAR(255) NULL`);
        }
    } else {
        console.log('  add   table AiMessages');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE AiMessages (
                    id         CHAR(36)     NOT NULL PRIMARY KEY,
                    user_id    VARCHAR(255) NOT NULL,
                    role       ENUM('user','assistant') NOT NULL,
                    text       TEXT         NOT NULL,
                    image_url  VARCHAR(255) NULL,
                    createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_aimessages_user_created (user_id, createdAt)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
