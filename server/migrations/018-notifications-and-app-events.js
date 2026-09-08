/**
 * Migration 018 — per-conversation auto-expiring mute, global DND, and the
 * Apps platform's Events API (app_mention subscriptions + interactive
 * buttons).
 *
 * Adds:
 *   - ConversationPrefs.mutedUntil (nullable DATE) — an optional expiry on
 *     top of the existing isMuted boolean, for "mute for 1h" instead of only
 *     indefinite mute.
 *   - Users.dnd_until (nullable DATE) — global "pause all push notifications
 *     until this time," independent of the already-churny presence field.
 *   - Apps.event_subscriptions (JSON, default []) and Apps.events_webhook_url
 *     (nullable STRING) — which platform events (currently just
 *     'app_mention') an app wants pushed to it, and where. Interactive
 *     button clicks reuse this same webhook, so no separate column for that.
 *
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/018-notifications-and-app-events.js --dry-run
 *   node migrations/018-notifications-and-app-events.js
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

const addColumn = async (table, column, ddl) => {
    if (await columnExists(table, column)) {
        console.log(`  skip  ${table}.${column} (already present)`);
        return;
    }
    console.log(`  add   ${table}.${column}`);
    if (!DRY_RUN) await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
};

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    await addColumn('ConversationPrefs', 'mutedUntil', 'mutedUntil DATETIME NULL');
    await addColumn('Users', 'dnd_until', 'dnd_until DATETIME NULL');
    await addColumn('Apps', 'event_subscriptions', `event_subscriptions JSON NULL`);
    await addColumn('Apps', 'events_webhook_url', 'events_webhook_url VARCHAR(255) NULL');

    // JSON columns can't carry a DEFAULT in MySQL — backfill existing rows
    // to [] explicitly so `(a.event_subscriptions || [])` reads never see
    // NULL for a pre-existing app.
    if (!DRY_RUN) {
        await sequelize.query(`UPDATE Apps SET event_subscriptions = JSON_ARRAY() WHERE event_subscriptions IS NULL`);
    } else {
        const [{ cnt }] = await sequelize.query(
            `SELECT COUNT(*) as cnt FROM Apps WHERE event_subscriptions IS NULL`,
            { type: QueryTypes.SELECT }
        );
        console.log(`  would backfill event_subscriptions = [] on ${cnt} existing app row(s)`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
