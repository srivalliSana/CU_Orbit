/**
 * Migration 041 — superadmin: the one extra power an app admin doesn't
 * have (managing who else is admin/superadmin), as a flag on top of the
 * existing 'admin' role rather than a new role value — see isSuperAdmin()
 * in server.js for why.
 *
 * Every existing admin is bootstrapped to superadmin too, so the people
 * who can already promote/demote admins today (every admin can, right
 * now) don't lose that ability the moment this ships — going forward,
 * only a superadmin can grant/revoke admin or superadmin status.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/041-superadmin.js --dry-run
 *   node migrations/041-superadmin.js
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

    let justAdded = false;
    if (await columnExists('Users', 'is_superadmin')) {
        console.log('  skip  Users.is_superadmin (already present)');
    } else {
        console.log('  add   Users.is_superadmin');
        if (!DRY_RUN) {
            await sequelize.query(`ALTER TABLE Users ADD COLUMN is_superadmin TINYINT(1) NOT NULL DEFAULT 0`);
        }
        justAdded = true;
    }

    if (justAdded) {
        const [admins] = DRY_RUN
            ? [await sequelize.query(`SELECT id, name FROM Users WHERE role = 'admin'`, { type: QueryTypes.SELECT })]
            : [null];
        if (DRY_RUN) {
            console.log(`  would bootstrap ${admins.length} existing admin(s) to superadmin:`);
            for (const a of admins) console.log(`    - ${a.name} (${a.id})`);
        } else {
            const [, meta] = await sequelize.query(`UPDATE Users SET is_superadmin = 1 WHERE role = 'admin'`);
            console.log(`  bootstrapped existing admins to superadmin (${meta?.affectedRows ?? meta ?? '?'} row(s))`);
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
