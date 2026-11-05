/**
 * Migration 040 — workspace-level "restrict channel creation to admins" toggle.
 *
 * Slack-style: by default any member can create a (public) channel; an
 * admin can flip this on to restrict creation to workspace admins only.
 * Private-channel creation already has its own separate admin-only rule
 * and is untouched by this.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/040-channel-creation-permission.js --dry-run
 *   node migrations/040-channel-creation-permission.js
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

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    if (await columnExists('Workspaces', 'restrict_channel_creation')) {
        console.log('  skip  Workspaces.restrict_channel_creation (already present)');
    } else {
        console.log('  add   Workspaces.restrict_channel_creation');
        if (!DRY_RUN) {
            await sequelize.query(`ALTER TABLE Workspaces ADD COLUMN restrict_channel_creation TINYINT(1) NOT NULL DEFAULT 0`);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
