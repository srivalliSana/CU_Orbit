/**
 * Migration 002 — add the CampusOne identity columns to Users.
 *
 * Previously these appeared automatically because the server booted with
 * sequelize.sync({ alter: true }). That is now off by default (DB_SYNC=safe),
 * so column changes are explicit and reviewable instead of happening on every
 * restart.
 *
 * Idempotent: each column is checked before it is added, so re-running is a
 * no-op. MySQL 8 has no ADD COLUMN IF NOT EXISTS, hence the information_schema
 * lookups.
 *
 * Usage:
 *   node migrations/002-add-campus-identity.js --dry-run
 *   node migrations/002-add-campus-identity.js
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

const COLUMNS = [
    ['campus_email', "VARCHAR(255) NULL"],
    ['role', "ENUM('student','faculty','admin','examcell','coordinator') NOT NULL DEFAULT 'student'"],
    ['cohort', 'VARCHAR(255) NULL'],
    ['campus', 'VARCHAR(255) NULL'],
];

async function hasColumn(table, column) {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
        { replacements: { db: DB, table, column }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
}

async function hasIndex(table, name) {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND INDEX_NAME = :name`,
        { replacements: { db: DB, table, name }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
}

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    for (const [name, ddl] of COLUMNS) {
        if (await hasColumn('Users', name)) { console.log(`  skip  Users.${name} (already present)`); continue; }
        console.log(`  add   Users.${name} ${ddl}`);
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Users ADD COLUMN \`${name}\` ${ddl}`);
    }

    // Unique on campus_email: one CampusOne account can never map to two Orbit
    // users. Nullable, and MySQL permits multiple NULLs, so unclaimed rows are
    // unaffected.
    const idx = 'users_campus_email_unique';
    if (await hasIndex('Users', idx)) {
        console.log(`  skip  index ${idx} (already present)`);
    } else {
        const dupes = await sequelize.query(
            `SELECT campus_email, COUNT(*) n FROM Users
              WHERE campus_email IS NOT NULL GROUP BY campus_email HAVING n > 1`,
            { type: QueryTypes.SELECT }
        ).catch(() => []);
        if (dupes.length) {
            console.error(`\n❌ ${dupes.length} duplicate campus_email value(s); resolve before indexing:`);
            for (const d of dupes) console.error(`     ${d.campus_email} (${d.n} rows)`);
            process.exitCode = 1;
            return;
        }
        console.log(`  add   unique index ${idx}`);
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Users ADD CONSTRAINT ${idx} UNIQUE (campus_email)`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
