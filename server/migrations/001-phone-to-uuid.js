/**
 * Migration 001 — rekey identity from phone number to User.id (UUID).
 *
 * Historically every table stored a 10-digit phone number as the user key, and
 * dm_id was two phone numbers joined by '_'. That breaks the moment a user
 * changes their number, and it blocks CampusOne SSO (which identifies people by
 * campus email, not phone). This rekeys everything onto the UUID primary key
 * that User already had but nothing referenced.
 *
 * Safe to run more than once: values that are already UUIDs are skipped, so a
 * partial run can simply be re-run.
 *
 * Usage:
 *   node migrations/001-phone-to-uuid.js --dry-run   # report only, no writes
 *   node migrations/001-phone-to-uuid.js             # apply inside a transaction
 */

const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');

const sequelize = new Sequelize(
    process.env.DB_NAME || 'cu_orbit',
    process.env.DB_USER || 'root',
    process.env.DB_PASS || '',
    { host: process.env.DB_HOST || 'localhost', dialect: 'mysql', logging: false }
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Mirrors normalizePhone() in server.js — the same key must be produced here,
// or lookups silently miss and rows get left behind.
const normalizePhone = (p) => (p ? String(p).replace(/[^\d]/g, '').slice(-10) : '');

// Plain "one column holds a user key" tables.
const SIMPLE = [
    { table: 'ChannelMembers',    column: 'userId' },
    { table: 'ConversationPrefs', column: 'userId' },
    { table: 'Messages',          column: 'senderId' },
    { table: 'Mentions',          column: 'mentioned_user_id' },
    { table: 'Statuses',          column: 'userId' },
    { table: 'TypingStatuses',    column: 'userId' },
];

const unmapped = new Set();

function mapKey(phoneMap, raw) {
    if (raw == null || raw === '') return null;
    if (isUuid(raw)) return null;               // already migrated
    const id = phoneMap.get(normalizePhone(raw));
    if (!id) { unmapped.add(String(raw)); return null; }
    return id;
}

async function main() {
    await sequelize.authenticate();
    console.log(`Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    const users = await sequelize.query('SELECT id, phone, email, name FROM Users', { type: QueryTypes.SELECT });
    const phoneMap = new Map();
    for (const u of users) {
        const key = normalizePhone(u.phone);
        if (key) phoneMap.set(key, u.id);
    }
    console.log(`Users: ${users.length} (${phoneMap.size} with a usable phone)`);

    const dupes = users.length - new Set(users.map(u => normalizePhone(u.phone)).filter(Boolean)).size;
    if (dupes > 0) console.warn(`⚠️  ${dupes} user(s) share a normalized phone — their rows may map ambiguously.\n`);

    const t = DRY_RUN ? null : await sequelize.transaction();
    const counts = {};

    try {
        // 1. Single-column user keys.
        for (const { table, column } of SIMPLE) {
            const rows = await sequelize.query(
                `SELECT DISTINCT \`${column}\` AS v FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`,
                { type: QueryTypes.SELECT, transaction: t }
            );
            let n = 0;
            for (const { v } of rows) {
                const id = mapKey(phoneMap, v);
                if (!id) continue;
                if (!DRY_RUN) {
                    await sequelize.query(
                        `UPDATE \`${table}\` SET \`${column}\` = :id WHERE \`${column}\` = :v`,
                        { replacements: { id, v }, transaction: t }
                    );
                }
                n++;
            }
            counts[`${table}.${column}`] = n;
        }

        // 2. dm_id — "phoneA_phoneB" becomes "uuidA_uuidB", re-sorted so both
        //    participants still resolve to the identical room id.
        const dms = await sequelize.query(
            `SELECT DISTINCT dm_id AS v FROM Messages WHERE dm_id IS NOT NULL AND dm_id <> ''`,
            { type: QueryTypes.SELECT, transaction: t }
        );
        let dmN = 0;
        for (const { v } of dms) {
            const parts = String(v).split('_');
            if (parts.length !== 2) continue;
            const a = mapKey(phoneMap, parts[0]) || (isUuid(parts[0]) ? parts[0] : null);
            const b = mapKey(phoneMap, parts[1]) || (isUuid(parts[1]) ? parts[1] : null);
            if (!a || !b) continue;
            const next = [a, b].sort().join('_');
            if (next === v) continue;
            if (!DRY_RUN) {
                await sequelize.query(`UPDATE Messages SET dm_id = :next WHERE dm_id = :v`,
                    { replacements: { next, v }, transaction: t });
                // ConversationPref and Thread address the same room by id.
                await sequelize.query(`UPDATE ConversationPrefs SET containerId = :next WHERE containerId = :v`,
                    { replacements: { next, v }, transaction: t });
                await sequelize.query(`UPDATE Threads SET channel_id = :next WHERE channel_id = :v`,
                    { replacements: { next, v }, transaction: t });
            }
            dmN++;
        }
        counts['Messages.dm_id (+prefs, threads)'] = dmN;

        // 3. Thread.participant_ids is a JSON array of user keys.
        const threads = await sequelize.query(
            `SELECT id, participant_ids FROM Threads WHERE participant_ids IS NOT NULL`,
            { type: QueryTypes.SELECT, transaction: t }
        );
        let thN = 0;
        for (const row of threads) {
            let list = row.participant_ids;
            if (typeof list === 'string') { try { list = JSON.parse(list); } catch { continue; } }
            if (!Array.isArray(list) || list.length === 0) continue;
            const next = list.map((p) => mapKey(phoneMap, p) || p);
            if (JSON.stringify(next) === JSON.stringify(list)) continue;
            if (!DRY_RUN) {
                await sequelize.query(`UPDATE Threads SET participant_ids = :next WHERE id = :id`,
                    { replacements: { next: JSON.stringify(next), id: row.id }, transaction: t });
            }
            thN++;
        }
        counts['Threads.participant_ids'] = thN;

        console.log('\nRows rekeyed (distinct values):');
        for (const [k, v] of Object.entries(counts)) console.log(`  ${String(k).padEnd(38)} ${v}`);

        if (unmapped.size) {
            console.warn(`\n⚠️  ${unmapped.size} key(s) had no matching user and were left untouched:`);
            console.warn('   ' + [...unmapped].slice(0, 20).join(', ') + (unmapped.size > 20 ? ' …' : ''));
            console.warn('   These are orphaned rows (user deleted, or seeded with a literal like "system").');
        }

        if (t) { await t.commit(); console.log('\n✅ Committed.'); }
        else { console.log('\nDry run complete — nothing was written.'); }
    } catch (e) {
        if (t) await t.rollback();
        console.error('\n❌ Failed, rolled back:', e.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

main();
