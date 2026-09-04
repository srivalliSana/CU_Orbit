/**
 * Migration 016 — more performance indexes.
 *
 * Migration 006 covered Messages and ChannelMembers, but Mentions and
 * ConversationPrefs had zero indexes at all, and MessageReads was missing
 * one for the specific query the unread-count logic actually runs
 * (filtering by user_id alone). All three get queried once per channel/DM
 * on every single home-feed load — this is very likely the real cause of
 * "messages take ages to load": every one of those was a full table scan.
 * Idempotent; safe to re-run.
 *
 * Also worth checking: if migration 006 itself was never actually run on
 * this server, run it too — this migration doesn't duplicate it.
 *
 * Usage:
 *   node migrations/016-more-perf-indexes.js --dry-run
 *   node migrations/016-more-perf-indexes.js
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

const indexExists = async (table, indexName) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND INDEX_NAME = :indexName`,
        { replacements: { db: DB, table, indexName }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

async function addIndex(table, indexName, columns) {
    if (await indexExists(table, indexName)) {
        console.log(`  skip  ${table}.${indexName} (already present)`);
    } else {
        console.log(`  add   ${table}.${indexName} (${columns.join(', ')})`);
        if (!DRY_RUN) await sequelize.query(`CREATE INDEX ${indexName} ON ${table} (${columns.join(', ')})`);
    }
}

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    await addIndex('Mentions', 'idx_mentions_user_channel_read', ['mentioned_user_id', 'source_channel_id', 'is_read']);
    await addIndex('ConversationPrefs', 'idx_conversationprefs_user_container', ['userId', 'containerId']);
    await addIndex('MessageReads', 'idx_messagereads_user', ['user_id']);

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
