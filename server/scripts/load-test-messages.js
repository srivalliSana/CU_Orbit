/**
 * Load/speed test for message history at scale. Creates a dedicated
 * "Load Test" channel (never touches a real group), seeds it with 1000+
 * realistic-looking messages, then times the exact query GET
 * /api/messages/:containerId runs (paginated, indexed on channelId+timestamp)
 * plus a couple of related hot paths, so we have real numbers instead of a
 * guess about how the schema holds up with real history depth.
 *
 * Usage:
 *   node scripts/load-test-messages.js [--count=1500] [--reset]
 *
 * --reset deletes any previously-seeded Load Test messages first (the
 * channel itself is reused across runs rather than multiplying channels).
 */

const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const COUNT = Number((process.argv.find((a) => a.startsWith('--count=')) || '--count=1500').split('=')[1]);
const RESET = process.argv.includes('--reset');
const LOAD_TEST_CHANNEL_NAME = 'load-test';

const DB = process.env.DB_NAME || 'cu_orbit';
const sequelize = new Sequelize(DB, process.env.DB_USER || 'root', process.env.DB_PASS || '', {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
});

// Varied, realistic sentence fragments — not lorem ipsum — so the seeded
// history looks and measures like a real campus group chat, not junk data.
const TOPICS = [
    'Does anyone have the slides from today\'s lecture?',
    'Reminder: assignment 3 deadline is Friday 11:59pm',
    'Can we push the meeting to 4pm instead?',
    'Uploaded the notes to the shared drive',
    'Who\'s free for a study session tomorrow?',
    'The lab is booked till 6, let\'s meet after',
    'Thanks for sharing that resource!',
    'I think there\'s a typo in question 4',
    'Great presentation today everyone',
    'Can someone explain the last topic again?',
    'Attendance sheet is up, please fill it out',
    'Let\'s finalize the project groups by tonight',
    'Sent the updated report, check your inbox',
    'Anyone else having trouble with the portal login?',
    'See you all at the seminar hall',
    'Quick poll — morning or evening slot?',
    'That was a really helpful session, thanks!',
    'Please mute notifications during the exam window',
    'Updated the wiki page with the new schedule',
    'Can we get a recording of this session?',
];

function randomMessage(i) {
    const base = TOPICS[i % TOPICS.length];
    // Occasional variation so not every 20th message is byte-identical.
    return i % 7 === 0 ? `${base} (msg #${i})` : base;
}

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}.\n`);

    const users = await sequelize.query(`SELECT id, name FROM Users LIMIT 10`, { type: QueryTypes.SELECT });
    if (users.length < 1) throw new Error('No users in this DB to seed messages as — sign in at least one user first.');

    let [channel] = await sequelize.query(
        `SELECT id FROM Channels WHERE name = :name LIMIT 1`,
        { replacements: { name: LOAD_TEST_CHANNEL_NAME }, type: QueryTypes.SELECT }
    );
    if (!channel) {
        const [workspace] = await sequelize.query(`SELECT id FROM Workspaces LIMIT 1`, { type: QueryTypes.SELECT });
        if (!workspace) throw new Error('No workspace in this DB — cannot create the load-test channel.');
        const id = Sequelize.literal('UUID()');
        await sequelize.query(
            `INSERT INTO Channels (id, workspace_id, name, type, topic, member_count, pinned_message_count, is_muted, created_by, createdAt, updatedAt, restricted_messaging, info_edit_restricted, approval_required)
             VALUES (UUID(), :workspaceId, :name, 'public', 'Synthetic data for load/speed testing — safe to ignore or delete', 0, 0, 0, :createdBy, NOW(), NOW(), 0, 0, 0)`,
            { replacements: { workspaceId: workspace.id, name: LOAD_TEST_CHANNEL_NAME, createdBy: users[0].id } }
        );
        [channel] = await sequelize.query(
            `SELECT id FROM Channels WHERE name = :name LIMIT 1`,
            { replacements: { name: LOAD_TEST_CHANNEL_NAME }, type: QueryTypes.SELECT }
        );
        for (const u of users) {
            await sequelize.query(
                `INSERT INTO ChannelMembers (channelId, userId, role, createdAt, updatedAt) VALUES (:channelId, :userId, 'member', NOW(), NOW())`,
                { replacements: { channelId: channel.id, userId: u.id } }
            );
        }
        await sequelize.query(`UPDATE Channels SET member_count = :n WHERE id = :channelId`, { replacements: { n: users.length, channelId: channel.id } });
        console.log(`Created #${LOAD_TEST_CHANNEL_NAME} (${channel.id}) with ${users.length} member(s).\n`);
    } else {
        console.log(`Reusing existing #${LOAD_TEST_CHANNEL_NAME} (${channel.id}).\n`);
    }

    if (RESET) {
        const [result] = await sequelize.query(`DELETE FROM Messages WHERE channelId = :channelId`, { replacements: { channelId: channel.id } });
        console.log(`--reset: cleared existing seeded messages.\n`);
    }

    const [[{ existing }]] = await sequelize.query(
        `SELECT COUNT(*) as existing FROM Messages WHERE channelId = :channelId`,
        { replacements: { channelId: channel.id } }
    );
    console.log(`Currently ${existing} message(s) in #${LOAD_TEST_CHANNEL_NAME}. Seeding ${COUNT} more...\n`);

    const seedStart = Date.now();
    const BATCH = 500;
    const now = Date.now();
    for (let batchStart = 0; batchStart < COUNT; batchStart += BATCH) {
        const rows = [];
        const params = {};
        for (let j = 0; j < Math.min(BATCH, COUNT - batchStart); j++) {
            const i = batchStart + j;
            const user = users[i % users.length];
            // Spread timestamps backwards over the seeded range so ORDER BY
            // timestamp DESC + LIMIT actually exercises the index the way a
            // real, gradually-accumulated history would, not identical values.
            const ts = now - (COUNT - i) * 15000;
            rows.push(`(UUID(), :channelId, :senderId${i}, :senderName${i}, :body${i}, 'text', '[]', '[]', 0, 0, 'sent', :ts${i}, NOW(), NOW())`);
            params[`senderId${i}`] = user.id;
            params[`senderName${i}`] = user.name;
            params[`body${i}`] = randomMessage(i);
            params[`ts${i}`] = ts;
        }
        params.channelId = channel.id;
        await sequelize.query(
            `INSERT INTO Messages (id, channelId, senderId, senderName, body, type, attachments, reactions, thread_reply_count, is_pinned, status, timestamp, createdAt, updatedAt)
             VALUES ${rows.join(',')}`,
            { replacements: params }
        );
        process.stdout.write(`\r  seeded ${Math.min(batchStart + BATCH, COUNT)}/${COUNT}`);
    }
    console.log(`\n\nSeed complete in ${Date.now() - seedStart}ms.\n`);

    const [[{ total }]] = await sequelize.query(
        `SELECT COUNT(*) as total FROM Messages WHERE channelId = :channelId`,
        { replacements: { channelId: channel.id } }
    );
    console.log(`#${LOAD_TEST_CHANNEL_NAME} now has ${total} total messages.\n`);

    console.log('--- Speed test: the exact query GET /api/messages/:containerId runs ---\n');

    // First page (most recent 200, what a client sees on opening the chat).
    const timings = [];
    for (let run = 1; run <= 5; run++) {
        const t0 = Date.now();
        await sequelize.query(
            `SELECT * FROM Messages WHERE channelId = :channelId AND deleted_at IS NULL ORDER BY timestamp DESC LIMIT 200`,
            { replacements: { channelId: channel.id } }
        ).catch(async () => {
            // This DB predates the deleted_at column (older schema) — fall
            // back to the pre-soft-delete shape of the same query.
            await sequelize.query(
                `SELECT * FROM Messages WHERE channelId = :channelId ORDER BY timestamp DESC LIMIT 200`,
                { replacements: { channelId: channel.id } }
            );
        });
        const ms = Date.now() - t0;
        timings.push(ms);
        console.log(`  run ${run}: ${ms}ms (first page, 200 rows)`);
    }
    console.log(`  avg: ${(timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(1)}ms\n`);

    // A "before" cursor page deep into history (scroll-up pagination) —
    // this is the query shape most likely to degrade without the composite
    // index, since it can't just take the newest N rows.
    const [[{ midTimestamp }]] = await sequelize.query(
        `SELECT timestamp as midTimestamp FROM Messages WHERE channelId = :channelId ORDER BY timestamp DESC LIMIT 1 OFFSET :offset`,
        { replacements: { channelId: channel.id, offset: Math.floor(total / 2) } }
    );
    const pageTimings = [];
    for (let run = 1; run <= 5; run++) {
        const t0 = Date.now();
        await sequelize.query(
            `SELECT * FROM Messages WHERE channelId = :channelId AND timestamp < :before ORDER BY timestamp DESC LIMIT 200`,
            { replacements: { channelId: channel.id, before: midTimestamp } }
        );
        const ms = Date.now() - t0;
        pageTimings.push(ms);
        console.log(`  scroll-up page ${run}: ${ms}ms`);
    }
    console.log(`  avg: ${(pageTimings.reduce((a, b) => a + b, 0) / pageTimings.length).toFixed(1)}ms\n`);

    console.log('EXPLAIN for the first-page query (confirms the composite index is actually used):\n');
    const [explainRows] = await sequelize.query(
        `EXPLAIN SELECT * FROM Messages WHERE channelId = :channelId ORDER BY timestamp DESC LIMIT 200`,
        { replacements: { channelId: channel.id } }
    );
    console.log(explainRows.map((r) => `  type=${r.type} key=${r.key} rows=${r.rows} Extra=${r.Extra}`).join('\n'));

    console.log(`\nDone. To clean up the synthetic data later: node scripts/load-test-messages.js --count=0 --reset`);
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
