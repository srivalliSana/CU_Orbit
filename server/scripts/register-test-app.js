/**
 * Registers a throwaway test App + SlashCommand for manually verifying the
 * Apps-platform OAuth flow (Phase 1 has no admin UI yet — see the plan).
 * Prints the client_id/client_secret once; the secret is never stored or
 * shown again after this.
 *
 * Usage:
 *   node scripts/register-test-app.js <redirect_uri> <webhook_url>
 *
 * Example, testing against a local webhook receiver on port 4001:
 *   node scripts/register-test-app.js http://localhost:4002/callback http://localhost:4001/webhook
 */

const { Sequelize, DataTypes } = require('sequelize');
const crypto = require('crypto');
require('dotenv').config();

const [redirectUri, webhookUrl] = process.argv.slice(2);
if (!redirectUri || !webhookUrl) {
    console.error('Usage: node scripts/register-test-app.js <redirect_uri> <webhook_url>');
    process.exit(1);
}

const DB = process.env.DB_NAME || 'cu_orbit';
const sequelize = new Sequelize(DB, process.env.DB_USER || 'root', process.env.DB_PASS || '', {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
});

const App = sequelize.define('App', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    icon_url: DataTypes.STRING,
    owner_user_id: DataTypes.STRING,
    client_id: DataTypes.STRING,
    client_secret_hash: DataTypes.STRING,
    redirect_uris: DataTypes.JSON,
    scopes: DataTypes.JSON,
    is_first_party: DataTypes.BOOLEAN,
    status: DataTypes.ENUM('pending', 'approved', 'suspended'),
}, { tableName: 'Apps' });

const SlashCommand = sequelize.define('SlashCommand', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    app_id: DataTypes.UUID,
    command: DataTypes.STRING,
    description: DataTypes.STRING,
    usage_hint: DataTypes.STRING,
    webhook_url: DataTypes.STRING,
}, { tableName: 'SlashCommands' });

async function main() {
    await sequelize.authenticate();

    const client_id = `test_${crypto.randomBytes(6).toString('hex')}`;
    const client_secret = crypto.randomBytes(24).toString('base64url');
    const client_secret_hash = crypto.createHash('sha256').update(client_secret).digest('hex');

    const app = await App.create({
        name: 'Test App',
        description: 'Throwaway app for verifying the OAuth + slash-command flow.',
        owner_user_id: 'test-script',
        client_id,
        client_secret_hash,
        redirect_uris: [redirectUri],
        scopes: ['commands', 'chat:write', 'channels:read'],
        is_first_party: false,
        status: 'approved',
    });

    const slash = await SlashCommand.create({
        app_id: app.id,
        command: 'testcmd',
        description: 'Test slash command',
        usage_hint: '/testcmd <anything>',
        webhook_url: webhookUrl,
    });

    console.log('\nApp registered:');
    console.log('  client_id:    ', client_id);
    console.log('  client_secret:', client_secret, '(shown once — not stored anywhere)');
    console.log('  redirect_uri: ', redirectUri);
    console.log('  scopes:       ', 'commands chat:write channels:read');
    console.log('\nSlash command registered: /testcmd ->', webhookUrl);
    console.log('\nNext steps (curl walk):');
    console.log(`  1. GET  /api/oauth/authorize-info?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=chat:write`);
    console.log(`  2. POST /api/oauth/authorize   (as a logged-in admin, Authorization: Bearer <session>)`);
    console.log(`          body: { "client_id": "${client_id}", "redirect_uri": "${redirectUri}", "scope": "chat:write commands" }`);
    console.log(`  3. POST /oauth/token`);
    console.log(`          body: { "grant_type": "authorization_code", "code": "<code from step 2>", "redirect_uri": "${redirectUri}", "client_id": "${client_id}", "client_secret": "${client_secret}" }`);
    console.log(`  4. Add the bot user (created during step 3) to a channel as a member, then:`);
    console.log(`     POST /api/app/messages   (Authorization: Bearer <access_token from step 3>)`);
    console.log(`          body: { "channelId": "<channel id>", "text": "hello from the test app" }`);
    console.log(`  5. Type "/testcmd hello" in that channel to trigger the webhook dispatch.`);
}

main()
    .catch((e) => { console.error('Failed:', e.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
