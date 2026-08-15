/**
 * Migration 004 — role-permissions build.
 *
 * Adds what the superadmin/channel-admin/member tiers need: account
 * deactivation, soft-deleted + edit-history-tracked messages, and an audit
 * trail. Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/004-role-permissions.js --dry-run
 *   node migrations/004-role-permissions.js
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

    await addColumn('Users', 'is_active', 'is_active BOOLEAN NOT NULL DEFAULT true');
    await addColumn('Messages', 'deleted_at', 'deleted_at DATETIME NULL');
    await addColumn('Messages', 'edit_history', "edit_history JSON NOT NULL DEFAULT (JSON_ARRAY())");

    if (await tableExists('AuditLogs')) {
        console.log('  skip  AuditLogs (already present)');
    } else {
        console.log('  add   table AuditLogs');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE AuditLogs (
                    id           CHAR(36)     NOT NULL PRIMARY KEY,
                    actor_id     VARCHAR(255) NOT NULL,
                    actor_name   VARCHAR(255) NULL,
                    action       VARCHAR(255) NOT NULL,
                    target_type  VARCHAR(255) NULL,
                    target_id    VARCHAR(255) NULL,
                    detail       VARCHAR(255) NULL,
                    createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_created (createdAt)
                )
            `);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
