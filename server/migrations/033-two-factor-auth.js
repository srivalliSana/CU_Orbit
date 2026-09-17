/**
 * Migration 033 — Two-factor authentication (email-code, second step).
 *
 * Adds Users.twofa_enabled (default false) and a TwoFactorCodes table,
 * mirroring EmailOtp's shape exactly but kept separate so a normal sign-in
 * code request and a 2FA-step/enrollment code never collide for the same
 * address.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/033-two-factor-auth.js --dry-run
 *   node migrations/033-two-factor-auth.js
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

    if (await columnExists('Users', 'twofa_enabled')) {
        console.log('  skip  Users.twofa_enabled (already present)');
    } else {
        console.log('  add   Users.twofa_enabled');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Users ADD COLUMN twofa_enabled TINYINT(1) NOT NULL DEFAULT 0`);
    }

    if (await tableExists('TwoFactorCodes')) {
        console.log('  skip  TwoFactorCodes (already present)');
    } else {
        console.log('  add   table TwoFactorCodes');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE TwoFactorCodes (
                    email        VARCHAR(255) NOT NULL PRIMARY KEY,
                    code_hash    VARCHAR(255) NOT NULL,
                    expires_at   DATETIME     NOT NULL,
                    attempts     INT          NOT NULL DEFAULT 0,
                    last_sent_at DATETIME     NOT NULL,
                    createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
