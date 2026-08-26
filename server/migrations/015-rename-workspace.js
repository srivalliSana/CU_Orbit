/**
 * Migration 015 — rename the existing workspace row from "CU Orbit" to
 * "Let's Connect".
 *
 * The app was renamed in source (server.js's Workspace.findOrCreate default,
 * every UI string) but that only changes what a *newly created* workspace
 * would be called — the actual workspace row was created long ago and still
 * has "CU Orbit" as its literal, persisted name, which is what the app is
 * correctly displaying. Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/015-rename-workspace.js --dry-run
 *   node migrations/015-rename-workspace.js
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

    const rows = await sequelize.query(
        `SELECT id, name, slug FROM Workspaces WHERE name != :newName`,
        { replacements: { newName: "Let's Connect" }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
        console.log('  skip  no workspace rows need renaming');
    } else {
        for (const row of rows) {
            console.log(`  rename  Workspace ${row.id} (slug: ${row.slug}): "${row.name}" -> "Let's Connect"`);
            if (!DRY_RUN) {
                await sequelize.query(`UPDATE Workspaces SET name = :newName WHERE id = :id`, {
                    replacements: { newName: "Let's Connect", id: row.id },
                });
            }
        }
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
