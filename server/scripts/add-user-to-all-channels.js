/**
 * Adds a user (by campus email) as a member of every channel in the
 * workspace. One-time operational action for a superadmin who needs to see
 * every channel — promoting to admin alone doesn't add channel membership
 * (channel visibility now depends on being a member, even for superadmins;
 * see server.js's home-feed query).
 *
 * Usage:
 *   node scripts/add-user-to-all-channels.js someone@campus.edu --dry-run
 *   node scripts/add-user-to-all-channels.js someone@campus.edu
 */

const { Sequelize, DataTypes, QueryTypes, Op } = require('sequelize');
require('dotenv').config();

const email = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');

if (!email || email.startsWith('--')) {
    console.error('Usage: node scripts/add-user-to-all-channels.js <email> [--dry-run]');
    process.exit(1);
}

const DB = process.env.DB_NAME || 'cu_orbit';
const sequelize = new Sequelize(DB, process.env.DB_USER || 'root', process.env.DB_PASS || '', {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
});

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    const [user] = await sequelize.query(
        `SELECT id, name, campus_email, email FROM Users WHERE campus_email = :email OR email = :email LIMIT 1`,
        { replacements: { email: email.toLowerCase() }, type: QueryTypes.SELECT }
    );
    if (!user) {
        console.error(`No user found with email ${email} — they need to have signed in at least once (or been promoted via promote-by-email) first.`);
        process.exitCode = 1;
        return;
    }
    console.log(`User: ${user.name} (${user.id})\n`);

    const channels = await sequelize.query(`SELECT id, name FROM Channels`, { type: QueryTypes.SELECT });
    const existing = await sequelize.query(
        `SELECT channelId FROM ChannelMembers WHERE userId = :userId`,
        { replacements: { userId: user.id }, type: QueryTypes.SELECT }
    );
    const existingIds = new Set(existing.map((r) => r.channelId));

    let added = 0;
    for (const ch of channels) {
        if (existingIds.has(ch.id)) {
            console.log(`  skip   #${ch.name} (already a member)`);
            continue;
        }
        console.log(`  add    #${ch.name}`);
        if (!DRY_RUN) {
            await sequelize.query(
                `INSERT INTO ChannelMembers (channelId, userId, role, createdAt, updatedAt) VALUES (:channelId, :userId, 'member', NOW(), NOW())`,
                { replacements: { channelId: ch.id, userId: user.id } }
            );
            await sequelize.query(`UPDATE Channels SET member_count = member_count + 1 WHERE id = :channelId`, { replacements: { channelId: ch.id } });
        }
        added++;
    }

    console.log(`\n${DRY_RUN ? 'Would add' : 'Added'} to ${added} channel(s), already in ${channels.length - added}.`);
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
