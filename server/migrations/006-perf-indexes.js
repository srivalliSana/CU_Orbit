/**
 * Migration 006 — performance indexes.
 *
 * Every hot read path (chat history, home feed, unread counts, member
 * lookups) filters on Messages.channelId/dm_id + orders by timestamp, or
 * filters ChannelMembers by userId/channelId — none of which had an index,
 * so each query was a full table scan that got slower as data grew. This is
 * the main reason load time degrades as the app gets more users/messages.
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/006-perf-indexes.js --dry-run
 *   node migrations/006-perf-indexes.js
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

    await addIndex('Messages', 'idx_messages_channel_ts', ['channelId', 'timestamp']);
    await addIndex('Messages', 'idx_messages_dm_ts', ['dm_id', 'timestamp']);
    await addIndex('ChannelMembers', 'idx_channelmembers_user', ['userId']);
    await addIndex('ChannelMembers', 'idx_channelmembers_channel', ['channelId']);

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
