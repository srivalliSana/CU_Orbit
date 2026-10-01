/**
 * Migration 036 — Personal reminders ("remind me about this").
 *
 * Creates Reminders. A row is picked up by a setInterval sweep in
 * server.js (sendDueReminders) once its remind_at time arrives — fires a
 * push notification and a realtime 'reminder' event to the user who set
 * it. Private to that user; never visible to anyone else.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/036-reminders.js --dry-run
 *   node migrations/036-reminders.js
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

    if (await tableExists('Reminders')) {
        console.log('  skip  Reminders (already present)');
    } else {
        console.log('  add   table Reminders');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE Reminders (
                    id         CHAR(36)     NOT NULL PRIMARY KEY,
                    user_id    VARCHAR(255) NOT NULL,
                    message_id CHAR(36)     NOT NULL,
                    channel_id VARCHAR(255) NOT NULL,
                    remind_at  BIGINT       NOT NULL,
                    fired_at   BIGINT       NULL,
                    createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_reminders_user_fired (user_id, fired_at)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
