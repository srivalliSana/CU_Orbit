/**
 * Moves a login email from one account onto another — for someone who lost
 * access to their old campus mailbox and needs to sign in with a new one,
 * without losing their message history / channel admin roles / anything
 * else tied to their original account id.
 *
 * If a second (usually freshly-created, e.g. via promote-by-email) account
 * already exists under the new email, it's treated as a throwaway
 * duplicate and removed — but only if it has never sent a message, as a
 * safety check against silently discarding real data. Its channel
 * memberships are carried over to the real account instead of being lost.
 *
 * Usage:
 *   node scripts/replace-user-email.js old@campus.edu new@campus.edu --dry-run
 *   node scripts/replace-user-email.js old@campus.edu new@campus.edu
 */

const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const [oldEmail, newEmail] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY_RUN = process.argv.includes('--dry-run');

if (!oldEmail || !newEmail) {
    console.error('Usage: node scripts/replace-user-email.js <old_email> <new_email> [--dry-run]');
    process.exit(1);
}

const DB = process.env.DB_NAME || 'cu_orbit';
const sequelize = new Sequelize(DB, process.env.DB_USER || 'root', process.env.DB_PASS || '', {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
});

const findUser = async (email) => {
    const [row] = await sequelize.query(
        `SELECT id, name, campus_email, email, role FROM Users WHERE campus_email = :email OR email = :email LIMIT 1`,
        { replacements: { email: email.toLowerCase() }, type: QueryTypes.SELECT }
    );
    return row || null;
};

async function main() {
    await sequelize.authenticate();
    console.log(`Connected to ${DB}. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

    const oldUser = await findUser(oldEmail);
    if (!oldUser) {
        console.error(`No account found for ${oldEmail}.`);
        process.exitCode = 1;
        return;
    }
    console.log(`Real account: ${oldUser.name} (${oldUser.id}), role: ${oldUser.role}`);

    const newUser = await findUser(newEmail);
    if (newUser && newUser.id !== oldUser.id) {
        console.log(`Duplicate found under ${newEmail}: ${newUser.id}`);
        const [{ count: messageCount }] = await sequelize.query(
            `SELECT COUNT(*) as count FROM Messages WHERE senderId = :id`,
            { replacements: { id: newUser.id }, type: QueryTypes.SELECT }
        );
        if (Number(messageCount) > 0) {
            console.error(`Refusing to remove ${newEmail}'s account — it has sent ${messageCount} message(s). Not a safe-to-discard duplicate; resolve this manually.`);
            process.exitCode = 1;
            return;
        }

        const dupMemberships = await sequelize.query(
            `SELECT channelId, role FROM ChannelMembers WHERE userId = :id`,
            { replacements: { id: newUser.id }, type: QueryTypes.SELECT }
        );
        for (const m of dupMemberships) {
            const [existing] = await sequelize.query(
                `SELECT 1 FROM ChannelMembers WHERE channelId = :channelId AND userId = :userId`,
                { replacements: { channelId: m.channelId, userId: oldUser.id }, type: QueryTypes.SELECT }
            );
            if (existing) {
                console.log(`  skip   channel ${m.channelId} (real account already a member)`);
                continue;
            }
            console.log(`  carry over   channel ${m.channelId} membership to real account`);
            if (!DRY_RUN) {
                await sequelize.query(
                    `INSERT INTO ChannelMembers (channelId, userId, role, createdAt, updatedAt) VALUES (:channelId, :userId, :role, NOW(), NOW())`,
                    { replacements: { channelId: m.channelId, userId: oldUser.id, role: m.role } }
                );
            }
        }

        console.log(`  delete   duplicate account ${newUser.id}`);
        if (!DRY_RUN) {
            await sequelize.query(`DELETE FROM ChannelMembers WHERE userId = :id`, { replacements: { id: newUser.id } });
            await sequelize.query(`DELETE FROM Users WHERE id = :id`, { replacements: { id: newUser.id } });
        }
    }

    console.log(`  update   ${oldUser.id}: email -> ${newEmail}`);
    if (!DRY_RUN) {
        await sequelize.query(
            `UPDATE Users SET campus_email = :newEmail, email = :newEmail WHERE id = :id`,
            { replacements: { newEmail: newEmail.toLowerCase(), id: oldUser.id } }
        );
    }

    console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\n✅ Applied.');
}

main()
    .catch((e) => { console.error('\n❌ Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
