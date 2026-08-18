/**
 * Migration 010 — drop the stale Mentions.mentioned_user_id -> Users.phone
 * foreign key.
 *
 * Migration 001 rekeyed Mentions.mentioned_user_id from phone numbers to
 * User.id (UUID) values, but a foreign key on that column still pointed at
 * Users.phone (not part of schema.sql — added outside the migration history
 * at some point, referencing the pre-001 identity model). Since 001, every
 * insert into Mentions has failed: a UUID never matches a phone number, so
 * the FK check rejects it — meaning sending any message with a working
 * @mention 500s instead of sending. Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/010-drop-mentions-phone-fk.js --dry-run
 *   node migrations/010-drop-mentions-phone-fk.js
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

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    const fks = await sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'Mentions'
           AND COLUMN_NAME = 'mentioned_user_id' AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { replacements: { db: DB }, type: QueryTypes.SELECT }
    );

    if (fks.length === 0) {
        console.log('  skip  no foreign key on Mentions.mentioned_user_id (already dropped)');
    } else {
        for (const { CONSTRAINT_NAME } of fks) {
            console.log(`  drop  foreign key ${CONSTRAINT_NAME} on Mentions.mentioned_user_id`);
            if (!DRY_RUN) {
                await sequelize.query(`ALTER TABLE Mentions DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``);
            }
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
