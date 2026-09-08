/**
 * Migration 017 — real Threads.
 *
 * Adds Messages.parent_message_id (indexed — reply_to stays the JSON quote-
 * preview snapshot, this is the real relational reference Threads queries
 * by) and the ThreadReads table (per-user "last opened this thread" marker
 * — a thread has no single global read state, unlike the old unused Thread
 * model's has_unread boolean).
 *
 * Also backfills parent_message_id and thread_reply_count from every
 * existing reply_to already sent, flattened to point at each thread's root
 * (a reply-to-a-reply points at the same root as its parent, not at the
 * immediate parent) — so pre-existing reply history becomes real,
 * populated threads instead of the feature only working going forward.
 * Idempotent; safe to re-run.
 *
 * Usage:
 *   node migrations/017-real-threads.js --dry-run
 *   node migrations/017-real-threads.js
 */

const { Sequelize, DataTypes, QueryTypes } = require('sequelize');
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

const indexExists = async (table, indexName) => {
    const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND INDEX_NAME = :indexName`,
        { replacements: { db: DB, table, indexName }, type: QueryTypes.SELECT }
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

    if (await columnExists('Messages', 'parent_message_id')) {
        console.log('  skip  Messages.parent_message_id (already present)');
    } else {
        console.log('  add   Messages.parent_message_id');
        if (!DRY_RUN) await sequelize.query(`ALTER TABLE Messages ADD COLUMN parent_message_id VARCHAR(255) NULL`);
    }

    if (await indexExists('Messages', 'messages_parent_message_id')) {
        console.log('  skip  Messages index on parent_message_id (already present)');
    } else {
        console.log('  add   Messages index on parent_message_id');
        if (!DRY_RUN) await sequelize.query(`CREATE INDEX messages_parent_message_id ON Messages (parent_message_id)`);
    }

    if (await tableExists('ThreadReads')) {
        console.log('  skip  ThreadReads (already present)');
    } else {
        console.log('  add   table ThreadReads');
        if (!DRY_RUN) {
            await sequelize.query(`
                CREATE TABLE ThreadReads (
                    id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    parent_message_id   VARCHAR(255) NOT NULL,
                    user_id             VARCHAR(255) NOT NULL,
                    last_read_at        DATETIME     NOT NULL,
                    createdAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_thread_read (parent_message_id, user_id)
                )
            `);
        }
    }

    console.log('\nBackfilling parent_message_id from existing reply_to snapshots...');
    const replies = await sequelize.query(
        `SELECT id, reply_to FROM Messages WHERE reply_to IS NOT NULL AND parent_message_id IS NULL`,
        { type: QueryTypes.SELECT }
    );
    if (!replies.length) {
        console.log('  nothing to backfill');
    } else {
        // Two passes: first resolve every reply's immediate quoted-message id,
        // then flatten chains (a reply to a reply) down to each root — same
        // rule createMessage() applies going forward.
        const immediateParent = new Map();
        for (const row of replies) {
            let parsed;
            try { parsed = typeof row.reply_to === 'string' ? JSON.parse(row.reply_to) : row.reply_to; } catch { continue; }
            if (parsed?.id) immediateParent.set(row.id, parsed.id);
        }
        const resolveRoot = (id) => {
            let current = immediateParent.get(id);
            let steps = 0;
            while (current && immediateParent.has(current) && steps < 20) {
                current = immediateParent.get(current);
                steps++;
            }
            return current;
        };

        let updated = 0;
        for (const [id] of immediateParent) {
            const root = resolveRoot(id);
            console.log(`  backfill  ${id} -> thread root ${root}`);
            if (!DRY_RUN) {
                await sequelize.query(`UPDATE Messages SET parent_message_id = :root WHERE id = :id`, { replacements: { root, id } });
            }
            updated++;
        }

        console.log(`\nRecomputing thread_reply_count for affected roots...`);
        if (!DRY_RUN) {
            await sequelize.query(`
                UPDATE Messages m
                SET thread_reply_count = (SELECT COUNT(*) FROM Messages r WHERE r.parent_message_id = m.id)
                WHERE m.id IN (SELECT DISTINCT parent_message_id FROM Messages WHERE parent_message_id IS NOT NULL)
            `);
        }
        console.log(`Backfilled ${updated} repl${updated === 1 ? 'y' : 'ies'}.`);
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
