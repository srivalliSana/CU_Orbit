/**
 * Migration 039 — Channel Quiz fields on Polls.
 *
 * A quiz is an existing Poll with one designated correct option and,
 * optionally, a per-option image. Adds three nullable/defaulted columns
 * to the existing Polls table rather than a new table, since a quiz is
 * a poll variant, not a separate entity — every poll route and the vote
 * table (PollVotes) already work unchanged for quizzes.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/039-channel-quiz.js --dry-run
 *   node migrations/039-channel-quiz.js
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

const COLUMNS = [
    { name: 'quiz_mode', ddl: `ALTER TABLE Polls ADD COLUMN quiz_mode TINYINT(1) NOT NULL DEFAULT 0` },
    { name: 'correct_option_index', ddl: `ALTER TABLE Polls ADD COLUMN correct_option_index INT NULL` },
    { name: 'option_images', ddl: `ALTER TABLE Polls ADD COLUMN option_images JSON NULL` },
];

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    for (const { name, ddl } of COLUMNS) {
        if (await columnExists('Polls', name)) {
            console.log(`  skip  Polls.${name} (already present)`);
        } else {
            console.log(`  add   Polls.${name}`);
            if (!DRY_RUN) await sequelize.query(ddl);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
