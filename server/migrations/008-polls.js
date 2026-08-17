/**
 * Migration 008 — polls.
 *
 * Adds Messages.poll_id, extends Messages.type with 'poll', and creates
 * Polls + PollVotes tables. Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/008-polls.js --dry-run
 *   node migrations/008-polls.js
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

async function addColumn(table, column, ddl) {
    if (await exists(table, column)) {
        console.log(`  skip  ${table}.${column} (already present)`);
    } else {
        console.log(`  add   ${table}.${column}`);
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
}

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    await addColumn('Messages', 'poll_id', 'poll_id CHAR(36) NULL');

    const typeColRows = await sequelize.query(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'Messages' AND COLUMN_NAME = 'type'`,
        { replacements: { db: DB }, type: QueryTypes.SELECT }
    );
    if (typeColRows[0] && typeColRows[0].COLUMN_TYPE.includes("'poll'")) {
        console.log("  skip  Messages.type already includes 'poll'");
    } else {
        console.log("  alter Messages.type to add 'poll'");
        if (!DRY_RUN) {
            await sequelize.query(
                "ALTER TABLE Messages MODIFY COLUMN type ENUM('text','image','video','voice','file','system','poll') NOT NULL DEFAULT 'text'"
            );
        }
    }

    if (await tableExists('Polls')) {
        console.log('  skip  Polls (already present)');
    } else {
        console.log('  add   table Polls');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE Polls (
                    id              CHAR(36)     NOT NULL PRIMARY KEY,
                    channel_id      VARCHAR(255) NOT NULL,
                    question        VARCHAR(255) NOT NULL,
                    options         JSON         NOT NULL,
                    multiple_choice BOOLEAN      NOT NULL DEFAULT false,
                    created_by      VARCHAR(255) NOT NULL,
                    closed          BOOLEAN      NOT NULL DEFAULT false,
                    createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_channel (channel_id)
                )
            `);
        }
    }

    if (await tableExists('PollVotes')) {
        console.log('  skip  PollVotes (already present)');
    } else {
        console.log('  add   table PollVotes');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE PollVotes (
                    id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    poll_id       CHAR(36)     NOT NULL,
                    user_id       VARCHAR(255) NOT NULL,
                    option_index  INT          NOT NULL,
                    createdAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_vote (poll_id, user_id, option_index)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
