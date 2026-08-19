const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const auth = require('./lib/auth');
const campus = require('./lib/campus');
const realtime = require('./lib/realtime');

const app = express();
app.use(express.json());
app.use(cors());

// UTILS
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/[^\d]/g, '').slice(-10);
}

// TRAFFIC LOGGER
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// STATIC FOLDERS
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

// CampusOne embeds the messenger in an iframe at /connect, so it must be
// allowed to frame us — while everyone else is still refused. 'self' keeps the
// standalone site working.
const CAMPUS_URL = process.env.CAMPUS_URL || 'https://campusone.cutm.ac.in';
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${CAMPUS_URL}`);
    // X-Frame-Options has no origin-list equivalent and would override the CSP
    // in older browsers, so it is deliberately not set.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Where an unauthenticated visitor is sent to sign in. Exposed to the client so
// the redirect target is configured in one place.
// Sign-in: Google (ID-token verification, no client secret needed for this
// flow — a code-exchange flow would need GOOGLE_CLIENT_SECRET, verifying a
// token Google already signed does not) and passwordless email OTP.
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID;
const googleClient = new OAuth2Client();

const mailer = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false, // STARTTLS on 587, not implicit TLS
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // Without pooling, every send opens a fresh TCP+TLS+auth handshake to
        // Gmail — a few seconds by itself. Pooling keeps connections warm so
        // only the very first send after a cold start pays that cost.
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
    })
    : null;

app.get('/api/config', (req, res) => {
    res.json({ google_web_client_id: GOOGLE_WEB_CLIENT_ID || null });
});

// Serve the Web App assets (css/js). index:false so express.static does not
// auto-serve public/index.html at '/', which would shadow the landing page route below.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// FILE UPLOAD SETUP
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// MYSQL CONNECTION
const dbConfig = {
    name: process.env.DB_NAME || 'cu_orbit',
    user: process.env.DB_USER || 'root',
    pass: process.env.DB_PASS || '@123456Valli',
    host: process.env.DB_HOST || 'localhost',
    port: 3306
};

const sequelize = new Sequelize(dbConfig.name, dbConfig.user, dbConfig.pass, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    logging: false,
    dialectOptions: { connectTimeout: 10000 },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
});

// MODELS

const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Link to CampusOne, which is the authority for identity. Nullable so an
    // account can exist before it is claimed via SSO; unique so it can never
    // point at two Orbit users.
    campus_email: { type: DataTypes.STRING, unique: true, allowNull: true },
    // Mirrors CampusOne's role set: roleFor() yields student/faculty/admin, and
    // org_roles can elevate to examcell or coordinator. Keep these in step with
    // lib/auth-options.ts there, or elevated users get silently downgraded.
    role: { type: DataTypes.ENUM('student', 'faculty', 'admin', 'examcell', 'coordinator'), defaultValue: 'student' },
    // Carried from the handoff token — drives auto-provisioning of cohort and
    // campus channels without CU Orbit querying the roster on every login.
    cohort: { type: DataTypes.STRING, allowNull: true },
    campus: { type: DataTypes.STRING, allowNull: true },
    // Phone is no longer an identity key — retained as contact detail and as the
    // join key for matching legacy rows against roster.mobile.
    phone: { type: DataTypes.STRING, unique: true, allowNull: true },
    name: DataTypes.STRING,
    handle: { type: DataTypes.STRING, unique: true },
    email: DataTypes.STRING,
    avatarUrl: { type: DataTypes.STRING, defaultValue: '' },
    bio: { type: DataTypes.TEXT, defaultValue: 'Hey there! I am using CU Orbit.' },
    status_emoji: { type: DataTypes.STRING, defaultValue: '✨' },
    status_text: { type: DataTypes.STRING, defaultValue: '' },
    presence: { type: DataTypes.ENUM('online', 'away', 'dnd', 'offline'), defaultValue: 'online' },
    // Drives "last seen" — refreshed on API activity, not on login, so it
    // reflects actual use.
    last_seen_at: { type: DataTypes.DATE, allowNull: true },
    // Superadmin-only account suspension ("Deactivate/reactivate members").
    // A deactivated user's session is rejected on every request (see auth
    // middleware), but their row and message history are kept intact.
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Set when this row represents an installed app's bot identity rather
    // than a person — see the Apps platform models below. Reusing User (not
    // a parallel "Bot" table) means a bot shows up in member lists, is
    // @-mentionable, and posts messages through the exact same paths a
    // person's messages do, for free.
    is_bot: { type: DataTypes.BOOLEAN, defaultValue: false },
    app_id: { type: DataTypes.UUID, allowNull: true },
});

const Workspace = sequelize.define('Workspace', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, unique: true },
    icon_url: { type: DataTypes.STRING, defaultValue: '' },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    member_count: { type: DataTypes.INTEGER, defaultValue: 0 }
});

const Channel = sequelize.define('Channel', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workspace_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('public', 'private'), defaultValue: 'public' },
    topic: { type: DataTypes.STRING, defaultValue: '' },
    member_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    pinned_message_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_muted: { type: DataTypes.BOOLEAN, defaultValue: false },
    invite_code: { type: DataTypes.STRING, unique: true },
    created_by: { type: DataTypes.STRING, allowNull: true },
    restricted_messaging: { type: DataTypes.BOOLEAN, defaultValue: false },
    info_edit_restricted: { type: DataTypes.BOOLEAN, defaultValue: false },
    approval_required: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Superadmin "deactivate" instead of delete — the channel and its history
    // stay intact, just hidden and read/write-locked, until reactivated.
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const ChannelMember = sequelize.define('ChannelMember', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    channelId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('admin', 'member'), defaultValue: 'member' }
}, {
    indexes: [
        { fields: ['userId'] },
        { fields: ['channelId'] },
    ],
});

// A student's invite-link join is held here for a channel admin to act on,
// instead of being silently dropped (see POST /api/channels/join-by-link).
const ChannelJoinRequest = sequelize.define('ChannelJoinRequest', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    channelId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.STRING, allowNull: false },
    userName: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
});

const ConversationPref = sequelize.define('ConversationPref', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    containerId: { type: DataTypes.STRING, allowNull: false },
    isPinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    isMuted: { type: DataTypes.BOOLEAN, defaultValue: false },
    isHidden: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const Message = sequelize.define('Message', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    channelId: { type: DataTypes.STRING, allowNull: true },
    dm_id: { type: DataTypes.STRING, allowNull: true },
    senderId: { type: DataTypes.STRING, allowNull: false },
    senderName: { type: DataTypes.STRING },
    senderAvatarUrl: { type: DataTypes.STRING },
    body: { type: DataTypes.TEXT },
    type: { type: DataTypes.ENUM('text', 'image', 'video', 'voice', 'file', 'system', 'poll'), defaultValue: 'text' },
    attachments: { type: DataTypes.JSON, defaultValue: [] },
    reactions: { type: DataTypes.JSON, defaultValue: [] },
    thread_reply_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_pinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING, defaultValue: 'sent' },
    timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() },
    edited_at: { type: DataTypes.DATE, allowNull: true },
    // "View message edit history" (superadmin) — every prior body, oldest
    // first, pushed here right before each overwrite.
    edit_history: { type: DataTypes.JSON, defaultValue: [] },
    // "View deleted messages" (superadmin) — messages are soft-deleted so
    // this stays possible; every other read path filters deleted_at IS NULL.
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    // Snapshotted at send time ({id, sender_name, text}), not a live FK — a
    // quoted reply should still render even if the original is later edited
    // or soft-deleted.
    reply_to: { type: DataTypes.JSON, allowNull: true },
    // Forwarded messages carry the original sender's name for a "Forwarded
    // from X" label; the body/attachments are already a plain copy.
    forwarded_from: { type: DataTypes.JSON, allowNull: true },
    // Set only when type === 'poll' — the Poll row holds the question/options/votes.
    poll_id: { type: DataTypes.UUID, allowNull: true },
}, {
    // Every hot read path filters on one of these plus an ORDER BY timestamp
    // (chat history, home feed's last-message lookup, unread counts) — without
    // these, each of those queries is a full table scan that gets slower as
    // message history grows.
    indexes: [
        { fields: ['channelId', 'timestamp'] },
        { fields: ['dm_id', 'timestamp'] },
    ],
});

/**
 * "View activity logs (audit trail)" — superadmin-only record of actions
 * that affect other people's accounts, channels, or messages. Not every
 * API call, just the ones a workspace owner would actually want to review.
 */
const AuditLog = sequelize.define('AuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    actor_id: { type: DataTypes.STRING, allowNull: false },
    actor_name: { type: DataTypes.STRING },
    action: { type: DataTypes.STRING, allowNull: false },
    target_type: { type: DataTypes.STRING, allowNull: true },
    target_id: { type: DataTypes.STRING, allowNull: true },
    detail: { type: DataTypes.STRING, allowNull: true },
});

/** "Polls in channels" — options are a plain array of strings, indexed by position. */
const Poll = sequelize.define('Poll', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    channel_id: { type: DataTypes.STRING, allowNull: false },
    question: { type: DataTypes.STRING, allowNull: false },
    options: { type: DataTypes.JSON, allowNull: false },   // string[]
    multiple_choice: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: { type: DataTypes.STRING, allowNull: false },
    closed: { type: DataTypes.BOOLEAN, defaultValue: false },
});

const PollVote = sequelize.define('PollVote', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    poll_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.STRING, allowNull: false },
    option_index: { type: DataTypes.INTEGER, allowNull: false },
}, {
    indexes: [{ unique: true, fields: ['poll_id', 'user_id', 'option_index'] }],
});

/**
 * "Delete for me" — hides a message from one person's view only, unlike
 * DELETE /api/messages/:id ("delete for everyone") which soft-deletes the
 * row for the whole conversation. No permission check beyond being able to
 * read the container at all: hiding something from your own view is never
 * restricted by author/moderator rules.
 */
const HiddenMessage = sequelize.define('HiddenMessage', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.STRING, allowNull: false },
    message_id: { type: DataTypes.UUID, allowNull: false },
}, {
    indexes: [{ unique: true, fields: ['user_id', 'message_id'] }],
});

/** "Starred messages" — a private per-user bookmark, not visible to anyone else. */
const StarredMessage = sequelize.define('StarredMessage', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.STRING, allowNull: false },
    message_id: { type: DataTypes.UUID, allowNull: false },
    container_id: { type: DataTypes.STRING, allowNull: false },
}, {
    indexes: [{ unique: true, fields: ['user_id', 'message_id'] }],
});

/**
 * Per-recipient read state.
 *
 * Message.status is a single value, which is enough for a DM but cannot express
 * "3 of 7 people read this" in a group. This records one row per reader, so
 * group read counts and "seen by" lists are exact.
 */
const MessageRead = sequelize.define('MessageRead', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    message_id: { type: DataTypes.UUID, allowNull: false },
    container_id: { type: DataTypes.STRING, allowNull: false },
    user_id: { type: DataTypes.STRING, allowNull: false },
    read_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
    indexes: [
        { unique: true, fields: ['message_id', 'user_id'] },
        { fields: ['container_id', 'user_id'] }
    ]
});

const Mention = sequelize.define('Mention', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    message_id: { type: DataTypes.UUID, allowNull: false },
    mentioned_user_id: { type: DataTypes.STRING, allowNull: false },
    source_channel_id: { type: DataTypes.STRING, allowNull: false },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const Thread = sequelize.define('Thread', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    parent_message_id: { type: DataTypes.UUID, allowNull: false },
    channel_id: { type: DataTypes.STRING, allowNull: false },
    participant_ids: { type: DataTypes.JSON, defaultValue: [] },
    reply_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    has_unread: { type: DataTypes.BOOLEAN, defaultValue: false },
    last_reply_at: { type: DataTypes.BIGINT }
});

const Release = sequelize.define('Release', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    version: { type: DataTypes.STRING, allowNull: false },
    build_number: { type: DataTypes.INTEGER, allowNull: false },
    filename: { type: DataTypes.STRING, allowNull: false },
    release_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

// --- Apps platform (Slack-style installable apps: OAuth + slash commands) ---

/** A registered application — the client_id/secret pair an app's own backend
 *  uses to request installation via OAuth. Distinct from "installed", which
 *  is what AppInstallation tracks. */
const App = sequelize.define('App', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    icon_url: { type: DataTypes.STRING, defaultValue: '' },
    owner_user_id: { type: DataTypes.STRING, allowNull: false },
    client_id: { type: DataTypes.STRING, unique: true, allowNull: false },
    // Never store the raw secret — only its hash. Shown once, at creation.
    client_secret_hash: { type: DataTypes.STRING, allowNull: false },
    redirect_uris: { type: DataTypes.JSON, defaultValue: [] },   // exact-match only
    scopes: { type: DataTypes.JSON, defaultValue: [] },          // requested, not granted
    is_first_party: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.ENUM('pending', 'approved', 'suspended'), defaultValue: 'approved' },
});

/** Short-lived, single-use OAuth authorization code — traded for a token pair at /oauth/token. */
const AppAuthorizationCode = sequelize.define('AppAuthorizationCode', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING, unique: true, allowNull: false },
    app_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.STRING, allowNull: false },   // the admin who consented
    redirect_uri: { type: DataTypes.STRING, allowNull: false },
    scopes: { type: DataTypes.JSON, defaultValue: [] },       // granted, may be <= App.scopes
    code_challenge: { type: DataTypes.STRING, allowNull: true },
    code_challenge_method: { type: DataTypes.STRING, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    // Set on redemption instead of deleting the row — keeps an audit trail
    // and makes "already used" a normal, expected check rather than a 404.
    used_at: { type: DataTypes.DATE, allowNull: true },
});

/** One issued access/refresh token pair for one installed app. Tokens are
 *  stored hashed — this is a long-lived bearer credential an external
 *  server holds and replays on every call, so a DB leak must not hand out
 *  usable tokens directly. */
const AppToken = sequelize.define('AppToken', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    app_id: { type: DataTypes.UUID, allowNull: false },
    installation_id: { type: DataTypes.UUID, allowNull: false },
    access_token_hash: { type: DataTypes.STRING, unique: true, allowNull: false },
    refresh_token_hash: { type: DataTypes.STRING, unique: true, allowNull: true },
    scopes: { type: DataTypes.JSON, defaultValue: [] },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    refresh_expires_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
});

/** "App X is installed" — OAuth-level install grants API scopes workspace-
 *  wide; a bot only appears/posts in channels an admin separately adds it
 *  to (a bot-flagged ChannelMember row), so installing an app can never by
 *  itself make its bot start posting anywhere. */
const AppInstallation = sequelize.define('AppInstallation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    app_id: { type: DataTypes.UUID, allowNull: false },
    installed_by: { type: DataTypes.STRING, allowNull: false },
    workspace_id: { type: DataTypes.STRING, allowNull: true },
    granted_scopes: { type: DataTypes.JSON, defaultValue: [] },
    bot_user_id: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('active', 'revoked'), defaultValue: 'active' },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
}, {
    indexes: [{ fields: ['app_id'] }, { fields: ['workspace_id'] }],
});

/** A slash command an app has registered. Command names are global across
 *  all apps — first to register "/foo" owns it, same as Slack. */
const SlashCommand = sequelize.define('SlashCommand', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    app_id: { type: DataTypes.UUID, allowNull: false },
    command: { type: DataTypes.STRING, unique: true, allowNull: false },   // stored without leading '/'
    description: { type: DataTypes.STRING, defaultValue: '' },
    usage_hint: { type: DataTypes.STRING, defaultValue: '' },
    webhook_url: { type: DataTypes.STRING, allowNull: false },
});

const Status = sequelize.define('Status', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    userName: DataTypes.STRING,
    mediaUrl: { type: DataTypes.STRING, allowNull: false },
    caption: { type: DataTypes.TEXT, defaultValue: '' },
    type: { type: DataTypes.STRING, defaultValue: 'image' },
    mentions: { type: DataTypes.JSON, defaultValue: [] },
    expiresAt: { type: DataTypes.DATE }
});

// One-time codes for the email sign-in flow. Keyed by email so a fresh
// request overwrites any still-pending code rather than accumulating rows.
const EmailOtp = sequelize.define('EmailOtp', {
    email: { type: DataTypes.STRING, primaryKey: true },
    code_hash: { type: DataTypes.STRING, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    last_sent_at: { type: DataTypes.DATE, allowNull: false },
});

const TypingStatus = sequelize.define('TypingStatus', {
    channelId: { type: DataTypes.STRING, primaryKey: true },
    userId: { type: DataTypes.STRING, primaryKey: true },
    userName: { type: DataTypes.STRING },
    lastTypedAt: { type: DataTypes.BIGINT }
});

// Relationships
Workspace.hasMany(Channel, { foreignKey: 'workspace_id', as: 'channels' });
Channel.belongsTo(Workspace, { foreignKey: 'workspace_id' });
Channel.hasMany(ChannelMember, { foreignKey: 'channelId', as: 'members' });

Message.hasMany(Mention, { foreignKey: 'message_id', as: 'mentions' });
Mention.belongsTo(Message, { foreignKey: 'message_id' });
// mentioned_user_id holds a User.id; joining on phone returned nothing once
// identity moved off phone numbers.
Mention.belongsTo(User, { foreignKey: 'mentioned_user_id', targetKey: 'id', as: 'user' });

// SYNC
sequelize.authenticate()
    .then(async () => {
        // DB_SYNC controls how much the process is allowed to change the schema
        // on boot. 'alter' rewrites live tables to match the models on every
        // restart — combined with a crash loop that is a lot of unattended DDL,
        // and it silently drops anything the models no longer describe.
        //
        //   alter  - reconcile existing tables (dev, and pre-launch only)
        //   safe   - create missing tables, never modify existing ones (default)
        //   off    - touch nothing; schema is managed entirely by migrations
        const mode = process.env.DB_SYNC || 'safe';
        if (mode === 'off') {
            console.log('✅ MySQL Connected (DB_SYNC=off — schema untouched)');
        } else if (mode === 'alter') {
            console.warn('⚠️ DB_SYNC=alter — altering live tables to match models. Not for production.');
            await sequelize.sync({ alter: true });
            console.log('✅ MySQL Connected & Schema Altered');
        } else {
            await sequelize.sync();
            console.log('✅ MySQL Connected & Schema Synced (missing tables created; existing left alone)');
        }

        const [ws] = await Workspace.findOrCreate({
            where: { slug: 'cu-orbit' },
            defaults: { name: 'CU Orbit', slug: 'cu-orbit' }
        });

        const [genChannel] = await Channel.findOrCreate({
            where: { name: 'general', workspace_id: ws.id },
            defaults: {
                name: 'general', workspace_id: ws.id, type: 'public',
                invite_code: crypto.randomBytes(4).toString('hex'), created_by: 'system'
            }
        });

        // Schema drift is silent otherwise: a missing table only shows up as a
        // failing endpoint later, which is how MessageReads went unnoticed.
        for (const model of [User, Channel, Message, MessageRead, ChannelMember]) {
            const table = model.getTableName();
            const [rows] = await sequelize.query(
                `SELECT COUNT(*) AS n FROM information_schema.TABLES
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`
            );
            if (!Number(rows[0]?.n)) {
                console.error(`❌ Missing table '${table}'. Run the migrations in server/migrations/ before serving traffic.`);
            }
        }

        // Membership is keyed on User.id. This used u.phone, which is null for
        // every SSO account — so it threw on the first such user and abandoned
        // the rest of the loop, leaving people out of #general entirely.
        const users = await User.findAll({ attributes: ['id'] });
        for (const u of users) {
            await ChannelMember.findOrCreate({
                where: { channelId: genChannel.id, userId: u.id },
                defaults: { channelId: genChannel.id, userId: u.id, role: 'member' }
            }).catch((e) => console.warn(`[seed] could not add ${u.id} to #general:`, e.message));
        }
    })
    .catch(err => {
        // Not necessarily a connection problem: seeding and schema errors land
        // here too, and calling them all "MySQL Offline" sent us looking in the
        // wrong place.
        const connectionIssue = /ECONNREFUSED|Access denied|ETIMEDOUT|getaddrinfo/i.test(err.message);
        console.warn(connectionIssue ? '⚠️ MySQL Offline:' : '⚠️ Startup error:', err.message);
    });

// There's no push-notification service in this app (no APNs/FCM) — a mention
// alert can only reach someone through their own live socket connection, the
// same channel presence/unread-changed already uses.
async function routeMentionNotification(user, message) {
    realtime.toUser(user.id, 'mentioned', {
        message_id: message.id,
        container_id: message.channelId || message.dm_id,
        sender_name: message.senderName,
        text: message.body,
    });
}

// --- LANDING PAGE & APK DOWNLOAD ---
const packageJson = require('./package.json');

app.get('/', async (req, res) => {
    const userAgent = req.get('User-Agent');
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    // Detailed OS Detection for Web
    let osName = "Web Device";
    if (userAgent.indexOf("Win") != -1) osName = "Windows PC";
    else if (userAgent.indexOf("Mac") != -1) osName = "macOS Device";
    else if (userAgent.indexOf("Linux") != -1) osName = "Linux System";

    // Degrade to an empty version list if the DB is unreachable — the landing page
    // must still render rather than taking the process down with it.
    let history = [];
    try {
        history = await Release.findAll({ order: [['build_number', 'DESC']] });
    } catch (e) {
        console.error('Landing page: could not load release history —', e.message);
    }

    if (req.query.download === 'true') {
        // Always the newest build — there is no version picker on the page
        // anymore, and per-version files aren't kept on this server anyway
        // (only the current cu_orbit.apk is), so an explicit ?v= would only
        // ever resolve back to the same file regardless.
        const release = history[0];
        // Re-validate at the point of use: rows predating the check above, or
        // written by any other path, must not be able to escape the directory.
        const downloads = path.join(__dirname, 'downloads');
        let name = release && isSafeApkName(release.filename) ? release.filename : 'cu_orbit.apk';
        let apkPath = path.join(downloads, name);
        if (!apkPath.startsWith(downloads + path.sep)) {
            return res.status(400).send('Invalid release');
        }
        // Only cu_orbit.apk is tracked in git; per-version copies exist on the
        // build machine but not necessarily here. Registering a release must not
        // break the download, so fall back to the current build.
        if (!fs.existsSync(apkPath)) {
            console.warn(`[download] ${name} is registered but missing — serving cu_orbit.apk`);
            name = 'cu_orbit.apk';
            apkPath = path.join(downloads, name);
        }
        if (!fs.existsSync(apkPath)) {
            return res.status(404).send('No build is available to download yet.');
        }
        return res.download(apkPath, name);
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CU Orbit | official University Messaging</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');
                body { background: #0f172a; color: white; font-family: 'Plus Jakarta Sans', sans-serif; }
                .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); }
                .btn-shine { position: relative; overflow: hidden; }
                .btn-shine::after { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent); transform: rotate(45deg); transition: 0.5s; }
                .btn-shine:hover::after { left: 120%; }
            </style>
        </head>
        <body class="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-slate-950">
            <div class="glass max-w-2xl w-full rounded-[2.5rem] p-10 shadow-2xl text-center border-t border-blue-400/20">
                <div class="flex justify-center mb-8">
                    <div class="w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-500/20 rotate-3">
                        <i class="fa-solid fa-satellite-dish text-5xl text-slate-900"></i>
                    </div>
                </div>

                <h1 class="text-6xl font-extrabold tracking-tight text-white mb-3">CU <span class="text-blue-400">Orbit</span></h1>
                <p class="text-slate-400 text-xl mb-10 max-w-lg mx-auto leading-relaxed">
                    Elevate your university communication with our professional messaging ecosystem.
                </p>

                <div class="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-10">
                    <span class="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-3"></span>
                    <span class="text-xs font-bold text-blue-400 uppercase tracking-widest">System Detected: ${osName}</span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
                    <a href="/?download=true" class="btn-shine bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold py-5 px-8 rounded-2xl flex items-center justify-center space-x-4 transition-all shadow-lg shadow-blue-500/20 group">
                        <i class="fa-brands fa-android text-3xl group-hover:scale-110 transition-transform"></i>
                        <div class="text-left">
                            <div class="text-[10px] uppercase opacity-70">Download for</div>
                            <div class="text-lg leading-none">Android APK</div>
                        </div>
                    </a>

                    <button onclick="alert('iOS App is currently in development. Registration will open soon!')" class="bg-slate-800/50 hover:bg-slate-800 text-slate-300 font-bold py-5 px-8 rounded-2xl flex items-center justify-center space-x-4 transition-all border border-slate-700/50 group">
                        <i class="fa-brands fa-apple text-3xl group-hover:scale-110 transition-transform"></i>
                        <div class="text-left">
                            <div class="text-[10px] uppercase opacity-50">Coming Soon</div>
                            <div class="text-lg leading-none">iOS Mobile</div>
                        </div>
                    </button>
                </div>

                <div class="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 mb-10">
                    <a href="/portal" class="text-blue-400 hover:text-blue-300 font-bold flex items-center group">
                        <span>Continue in Web Portal</span>
                        <i class="fa-solid fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>
                    </a>
                    ${history[0] ? `<span class="text-slate-500 text-sm">Latest: v${history[0].version} (build ${history[0].build_number})</span>` : ''}
                </div>

                <div class="bg-slate-950/40 rounded-3xl p-6 text-left border border-slate-800/50">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex items-start space-x-3 text-sm">
                            <i class="fa-solid fa-shield-halved text-blue-500 mt-1"></i>
                            <div>
                                <span class="block text-slate-200 font-bold">Secure</span>
                                <span class="text-slate-500 text-xs">University Locked</span>
                            </div>
                        </div>
                        <div class="flex items-start space-x-3 text-sm">
                            <i class="fa-solid fa-bolt text-blue-500 mt-1"></i>
                            <div>
                                <span class="block text-slate-200 font-bold">Real-time</span>
                                <span class="text-slate-500 text-xs">Zero Latency</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </body>
        </html>
    `);
});

// Add a route to register new releases (used by Gradle automation)
// APK filenames only. Anything else — path separators, traversal, unexpected
// extensions — is rejected before it can reach a filesystem call.
const SAFE_APK = /^[A-Za-z0-9._-]+\.apk$/;
const isSafeApkName = (n) => typeof n === 'string' && SAFE_APK.test(n) && !n.includes('..') && path.basename(n) === n;

/**
 * Called by the Gradle publish task, not by a signed-in user, so it takes a
 * machine credential rather than a session.
 *
 * Previously unauthenticated, and its filename was concatenated into a path
 * that the public landing page then serves via res.download — so anyone could
 * register "../../../../etc/passwd" and read it back over HTTP. Both halves are
 * closed here: the credential, and the filename shape.
 */
app.post('/api/system/register-release', async (req, res) => {
    const expected = process.env.RELEASE_TOKEN;
    if (!expected) {
        console.error('[release] RELEASE_TOKEN is not set — refusing to register releases.');
        return res.status(503).json({ error: 'not_configured' });
    }
    const supplied = req.get('x-release-token') || '';
    // Constant-time compare; lengths are padded so a mismatch does not leak size.
    const a = Buffer.from(String(supplied).padEnd(64).slice(0, 64));
    const b = Buffer.from(String(expected).padEnd(64).slice(0, 64));
    if (!crypto.timingSafeEqual(a, b)) {
        console.warn('[release] rejected registration with bad token from', req.ip);
        return res.status(401).json({ error: 'unauthorized' });
    }

    try {
        const { version, build_number, filename } = req.body;
        if (!isSafeApkName(filename)) {
            return res.status(400).json({ error: 'bad_request', message: 'filename must be a plain .apk name' });
        }
        if (!version || !Number.isInteger(build_number)) {
            return res.status(400).json({ error: 'bad_request', message: 'version and integer build_number required' });
        }
        const release = await Release.create({ version, build_number, filename });
        res.json({ success: true, release });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

// Web Portal — the React client built from web/ into public/app. Falls back to
// the legacy portal if the app has not been built yet, so a missing build
// degrades instead of 404ing.
const APP_INDEX = path.join(__dirname, 'public', 'app', 'index.html');
const LEGACY_INDEX = path.join(__dirname, 'public', 'index.html');
app.get('/portal', (req, res) => {
    res.sendFile(fs.existsSync(APP_INDEX) ? APP_INDEX : LEGACY_INDEX);
});

// Channel invite links (also the target of the mobile app's cuorbit.app/join/*
// deep link / app link). A plain browser click lands here and gets bounced
// into the portal with the code preserved as a query param — the web app
// picks it up from there and calls POST /api/channels/join-by-link itself,
// since joining requires an authenticated session this route doesn't have.
app.get('/join/:code', (req, res) => {
    res.redirect(`/portal?join=${encodeURIComponent(req.params.code)}`);
});

// --- ROUTES ---

// AUTH

/**
 * SSO exchange — the only way in.
 *
 * CampusOne mints a short-lived handoff token for the signed-in user; we verify
 * it, project that person into our Users table, and hand back an Orbit session
 * token. The handoff token is never stored and is good for one exchange.
 */
/**
 * Health probe. Documented in the README long before it existed — its absence
 * is part of why an 88-restart crash loop went unnoticed.
 *
 * `ready` means the schema is actually usable, not merely that the process is
 * listening: on a fresh database the server accepts connections seconds before
 * sync() finishes creating tables, and callers need to distinguish those.
 */
app.get('/api/health', async (req, res) => {
    const out = { status: 'ok', version: packageJson.version, uptime_s: Math.round(process.uptime()), db: 'down', ready: false };
    try {
        await sequelize.authenticate();
        out.db = 'up';
        await Channel.findOne({ attributes: ['id'], limit: 1 });
        out.ready = true;
    } catch (e) {
        out.status = out.db === 'up' ? 'degraded' : 'error';
        out.detail = e.message;
    }
    res.status(out.ready ? 200 : 503).json(out);
});

const ROLES = ['student', 'faculty', 'admin', 'examcell', 'coordinator'];

/**
 * Refresh last_seen_at on API activity.
 *
 * Throttled in memory to one write per user per minute — without that, a client
 * polling every 3 seconds would issue an UPDATE per poll per user. Fire and
 * forget: presence must never delay or fail a request.
 */
const lastSeenWrites = new Map();
const LAST_SEEN_THROTTLE_MS = 60_000;

function touchLastSeen(userId) {
    if (!userId) return;
    const now = Date.now();
    const previous = lastSeenWrites.get(userId) || 0;
    if (now - previous < LAST_SEEN_THROTTLE_MS) return;
    lastSeenWrites.set(userId, now);

    if (lastSeenWrites.size > 5000) {
        for (const [id, at] of lastSeenWrites) if (now - at > LAST_SEEN_THROTTLE_MS * 5) lastSeenWrites.delete(id);
    }

    User.update({ last_seen_at: new Date(now), presence: 'online' }, { where: { id: userId } })
        .catch(() => { /* presence is best-effort */ });
}

// requireAuth runs per route, so this is a hook rather than middleware —
// middleware placed here would run before req.user exists.
auth.setOnAuthenticated(touchLastSeen);

// "Deactivate/reactivate members" — a deactivated account's session token is
// otherwise still cryptographically valid, so the block has to happen here.
// Also refreshes req.user.role from the live row, so a role change in the
// Admin Panel takes effect on the promoted/demoted person's very next
// request instead of waiting for their token to expire.
auth.setActiveCheck(async (userId) => {
    const user = await User.findByPk(userId, { attributes: ['is_active', 'role'] });
    if (!user) return { active: true }; // missing row: let requireAuth's own logic decide, not this hook
    return { active: user.is_active !== false, role: user.role };
});

/** Helper for the audit trail — never let logging break the action it's recording. */
async function logAudit(actor, action, targetType, targetId, detail) {
    try {
        await AuditLog.create({
            actor_id: actor.id,
            actor_name: actor.name || actor.email || actor.id,
            action, target_type: targetType, target_id: targetId, detail,
        });
    } catch (e) { console.error('[audit-log]', e.message); }
}

/**
 * Latest published build, for the in-app update check.
 *
 * Public: the landing page and the app both ask before anyone is signed in, and
 * it exposes nothing beyond what the download page already shows.
 */
app.get('/api/system/latest-version', async (req, res) => {
    try {
        const latest = await Release.findOne({ order: [['build_number', 'DESC']] });
        if (!latest) return res.json({ available: false });

        // Only advertise a build whose file is actually here, or the app will
        // prompt for an update it cannot download.
        const name = isSafeApkName(latest.filename) ? latest.filename : 'cu_orbit.apk';
        const onDisk = fs.existsSync(path.join(__dirname, 'downloads', name))
            ? name
            : (fs.existsSync(path.join(__dirname, 'downloads', 'cu_orbit.apk')) ? 'cu_orbit.apk' : null);
        if (!onDisk) return res.json({ available: false });

        res.json({
            available: true,
            version: latest.version,
            build_number: latest.build_number,
            download_url: `/downloads/${onDisk}`,
            released_at: latest.release_date,
        });
    } catch (e) {
        // The app treats a failure as "no update", so this must not be fatal.
        res.json({ available: false });
    }
});

// Serve APKs directly so the app can download without going through the
// landing page's HTML.
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// --- PEOPLE DIRECTORY (CampusOne-backed) ---

/**
 * Search people.
 *
 * CampusOne resolves the name/role/department for a match, but only people
 * who have actually signed in to CU Orbit are returned — the campus roster
 * is not a contact list. Someone who has never opened Orbit stays invisible
 * here even if CampusOne knows them.
 */
app.get('/api/directory/search', auth.requireAuth, async (req, res) => {
    try {
        if (!isFacultyEmail(req.user.email)) {
            return res.status(403).json({ error: 'forbidden', message: 'The campus directory is available to faculty accounts only.', results: [] });
        }
        const term = String(req.query.q || '').trim().toLowerCase();
        const me = (req.user.email || '').toLowerCase();

        const people = await campus.searchDirectory(term, 40);
        const emails = people.map((p) => (p.email || '').toLowerCase()).filter(Boolean);

        // One query for whatever the directory returned, rather than per row.
        const known = emails.length
            ? await User.findAll({ where: { campus_email: { [Op.in]: emails } } })
            : [];
        const byEmail = new Map(known.map((u) => [(u.campus_email || '').toLowerCase(), u]));

        const results = [];
        for (const p of people) {
            const key = (p.email || '').toLowerCase();
            if (!key || key === me) continue;
            const u = byEmail.get(key);
            if (!u) continue;   // never signed in to Orbit — not a contact
            results.push({
                // Identity and profile: from CampusOne.
                email: p.email,
                name: p.name,
                role: p.role,
                department: p.department || null,
                school: p.school || null,
                cohort: p.cohort || null,
                campus: p.campus || null,
                regno: p.regno || null,
                is_hod: p.is_hod || false,
                // Messaging state: from CU Orbit, when they have used it.
                id: u ? u.id : null,
                avatarUrl: u ? u.avatarUrl : null,
                presence: u ? u.presence : null,
                last_seen_at: u ? u.last_seen_at : null,
                in_orbit: Boolean(u),
            });
        }

        res.json({
            results,
            directory_available: campus.configured(),
        });
    } catch (e) {
        console.error('[DIRECTORY-SEARCH]', e.message);
        res.status(500).json({ error: 'server_error', results: [] });
    }
});

/** Full details for one person, by Orbit id or campus email. */
app.get('/api/directory/person', auth.requireAuth, async (req, res) => {
    try {
        if (!isFacultyEmail(req.user.email)) {
            return res.status(403).json({ error: 'forbidden', message: 'The campus directory is available to faculty accounts only.' });
        }
        const { id, email } = req.query;
        let user = null;
        if (id) user = await User.findByPk(String(id));
        else if (email) user = await User.findOne({ where: { campus_email: String(email).toLowerCase() } });
        if (!user && !email) return res.status(404).json({ error: 'not_found' });

        const key = (user?.campus_email || email || '').toLowerCase();
        const entry = key
            ? (await campus.searchDirectory(key, 5)).find((p) => (p.email || '').toLowerCase() === key) || null
            : null;

        res.json({
            person: {
                email: key || null,
                // CampusOne is authoritative for who someone is; the Orbit row
                // is only a fallback for accounts predating the directory link.
                name: entry?.name || user?.name || null,
                role: entry?.role || user?.role || 'student',
                cohort: entry?.cohort || user?.cohort || null,
                campus: entry?.campus || user?.campus || null,
                department: entry?.department || null,
                school: entry?.school || null,
                regno: entry?.regno || null,
                is_hod: entry?.is_hod || false,
                // App state, which only CU Orbit knows.
                id: user?.id || null,
                avatarUrl: user?.avatarUrl || null,
                presence: user?.presence || null,
                last_seen_at: user?.last_seen_at || null,
                bio: user?.bio || null,
                status_text: user?.status_text || null,
                in_orbit: Boolean(user),
            },
        });
    } catch (e) {
        console.error('[DIRECTORY-PERSON]', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

/**
 * Open a DM with someone found in the directory search above. Only reaches
 * people who already have an Orbit account — directory search itself no
 * longer surfaces anyone else, so this just resolves the row it returned.
 */
app.post('/api/directory/dm', auth.requireAuth, async (req, res) => {
    try {
        if (!isFacultyEmail(req.user.email)) {
            return res.status(403).json({ error: 'forbidden', message: 'The campus directory is available to faculty accounts only.' });
        }
        const email = String(req.body.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'bad_request', message: 'email required' });
        if (email === (req.user.email || '').toLowerCase()) {
            return res.status(400).json({ error: 'bad_request', message: 'Cannot message yourself' });
        }

        const user = await User.findOne({ where: { campus_email: email } });
        if (!user) return res.status(404).json({ error: 'not_found', message: 'That person has not signed in to CU Orbit yet' });

        res.json({ dm_id: [req.user.id, user.id].sort().join('_'), user });
    } catch (e) {
        console.error('[DIRECTORY-DM]', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

/**
 * Mark a conversation read up to now.
 *
 * Records a MessageRead row per message for group read counts, and flips
 * Message.status for DMs so the sender's ticks turn blue. Idempotent.
 */
app.post('/api/conversations/:containerId/read', auth.requireAuth, async (req, res) => {
    try {
        const containerId = req.params.containerId;
        if (!(await canAccessContainer(req.user.id, containerId, req.user))) {
            return res.status(403).json({ error: 'forbidden' });
        }

        const unread = await Message.findAll({
            where: {
                [Op.or]: [{ channelId: containerId }, { dm_id: containerId }],
                senderId: { [Op.ne]: req.user.id },
            },
            attributes: ['id'],
            limit: 500,          // a very old conversation is caught up over a few calls
            order: [['timestamp', 'DESC']],
        });
        if (!unread.length) return res.json({ success: true, marked: 0 });

        const rows = unread.map((m) => ({
            message_id: m.id, container_id: containerId, user_id: req.user.id, read_at: new Date(),
        }));
        // ignoreDuplicates so re-reading a conversation is a no-op rather than an error.
        await MessageRead.bulkCreate(rows, { ignoreDuplicates: true });

        const isDm = containerId.includes('_');
        if (isDm) {
            await Message.update(
                { status: 'read' },
                { where: { dm_id: containerId, senderId: { [Op.ne]: req.user.id }, status: { [Op.ne]: 'read' } } }
            );
        } else {
            // In a channel, "read" once every other member has read it.
            const memberCount = await ChannelMember.count({ where: { channelId: containerId } });
            for (const m of unread) {
                const reads = await MessageRead.count({ where: { message_id: m.id } });
                if (memberCount > 1 && reads >= memberCount - 1) {
                    await Message.update({ status: 'read' }, { where: { id: m.id } });
                }
            }
        }

        realtime.toContainer(containerId, 'read', {
            container_id: containerId,
            reader_id: req.user.id,
            read_at: new Date().toISOString(),
        });
        realtime.toUser(req.user.id, 'unread-changed', { container_id: containerId });

        res.json({ success: true, marked: rows.length });
    } catch (e) {
        console.error('[MARK-READ]', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

/** Who has read a message — the "seen by" list on a group message. */
app.get('/api/messages/:id/reads', auth.requireAuth, async (req, res) => {
    try {
        const msg = await Message.findByPk(req.params.id);
        if (!msg) return res.status(404).json({ error: 'not_found' });

        const containerId = msg.channelId || msg.dm_id;
        if (!(await canAccessContainer(req.user.id, containerId, req.user))) {
            return res.status(403).json({ error: 'forbidden' });
        }

        const reads = await MessageRead.findAll({ where: { message_id: msg.id }, order: [['read_at', 'ASC']] });
        const ids = reads.map((r) => r.user_id);
        const users = ids.length ? await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'name', 'avatarUrl'] }) : [];
        const byId = new Map(users.map((u) => [u.id, u]));

        // Total possible readers, so the client can show "3 of 7".
        const audience = containerId.includes('_')
            ? 1
            : Math.max(await ChannelMember.count({ where: { channelId: containerId } }) - 1, 0);

        res.json({
            read_count: reads.length,
            audience,
            readers: reads.map((r) => ({
                id: r.user_id,
                name: byId.get(r.user_id)?.name || 'Unknown',
                avatarUrl: byId.get(r.user_id)?.avatarUrl || null,
                read_at: r.read_at,
            })),
        });
    } catch (e) {
        res.status(500).json({ error: 'server_error' });
    }
});

/**
 * Messages in a container that this user has not read.
 *
 * Message.status is one value for the whole message, so it cannot answer "have
 * *I* read this" in a group — it only flips once everyone has. Unread is
 * therefore derived from MessageReads, which holds a row per reader.
 */
function unreadWhere(userId, containerFilter) {
    return {
        ...containerFilter,
        senderId: { [Op.ne]: userId },
        id: {
            [Op.notIn]: sequelize.literal(
                `(SELECT message_id FROM MessageReads WHERE user_id = ${sequelize.escape(userId)})`
            ),
        },
    };
}

/** Unread total for the signed-in user — drives the CampusOne menu badge. */
app.get('/api/unread', auth.requireAuth, async (req, res) => {
    try {
        const memberships = await ChannelMember.findAll({ where: { userId: req.user.id } });
        const channelIds = memberships.map((m) => m.channelId);

        const channelUnread = channelIds.length
            ? await Message.count({ where: unreadWhere(req.user.id, { channelId: { [Op.in]: channelIds } }) })
            : 0;

        // DM rooms are "<uuid>_<uuid>", so ours are the ones containing our id.
        const dmUnread = await Message.count({
            where: unreadWhere(req.user.id, { dm_id: { [Op.like]: `%${req.user.id}%` } }),
        });

        res.json({ total: channelUnread + dmUnread, channels: channelUnread, dms: dmUnread });
    } catch (e) {
        // Returning zero silently made a broken query look like "nothing unread".
        console.error('[UNREAD]', e.message, e.parent?.sqlMessage || '');
        res.status(500).json({ error: 'server_error', message: e.message, total: 0 });
    }
});

/**
 * Admins oversee every group. Deliberately narrow: this grants visibility of
 * channels only. Direct messages stay private to their two participants no
 * matter what role the caller holds.
 */
const isGroupAdmin = (user) => user?.role === 'admin';

// --- Apps platform auth helpers ---
//
// client_id/client_secret and access/refresh tokens are all generated
// high-entropy random strings, not human-chosen passwords, so a plain
// SHA-256 hash at rest is the right tool here (matches how GitHub/Stripe
// hash API keys) — a slow password-hash (bcrypt/scrypt) exists to defend
// low-entropy human secrets against brute-forcing, which doesn't apply to
// a 256-bit random token.
const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/**
 * Express middleware — populates req.app_ (never req.user, so "human vs.
 * app" is unmistakable downstream) or rejects with 401. Deliberately not
 * layered onto auth.requireAuth: an app token is a fundamentally different
 * credential (workspace/installation-scoped, not a person's session), and
 * every existing /api/* handler already assumes req.user.id is a real
 * signed-in person across dozens of permission checks — mixing the two
 * credential types into those same handlers risks a scope check being
 * accidentally satisfied by a role check, or vice versa. App-token routes
 * live under the separate /api/app/* namespace instead.
 */
async function requireAppToken(req, res, next) {
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
    if (!token) return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token' });
    try {
        const hash = sha256Hex(token);
        const row = await AppToken.findOne({ where: { access_token_hash: hash } });
        if (!row || row.revoked_at || row.expires_at < new Date()) {
            return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired app token' });
        }
        const installation = await AppInstallation.findByPk(row.installation_id);
        if (!installation || installation.status !== 'active') {
            return res.status(401).json({ error: 'unauthorized', message: 'App installation is not active' });
        }
        const app = await App.findByPk(row.app_id);
        if (!app) return res.status(401).json({ error: 'unauthorized' });
        req.app_ = { id: app.id, name: app.name, installationId: installation.id, scopes: row.scopes || [], botUserId: installation.bot_user_id };
        next();
    } catch (e) {
        console.error('[APP-TOKEN]', e.message);
        res.status(500).json({ error: 'server_error' });
    }
}

/** Route guard for a specific OAuth scope. Use after requireAppToken. */
function requireScope(...scopes) {
    return (req, res, next) => {
        if (!req.app_) return res.status(401).json({ error: 'unauthorized' });
        if (!scopes.every((s) => req.app_.scopes.includes(s))) {
            return res.status(403).json({ error: 'forbidden', message: `Requires scope: ${scopes.join(', ')}` });
        }
        next();
    };
}

/**
 * Campus-specific proxy for "can create/manage channels": CUTM's email
 * convention is that student addresses start with a roll number (digits)
 * and staff addresses start with a name (letters). Also doubles as the
 * full list of domains allowed to sign in / join channels at all (see
 * isCampusEmail below) — cutm.ac.in/cutmap.ac.in plus the affiliated-group
 * domains (Gram Tarang, GT Tech, FTL, Centurion University's main domain).
 */
const FACULTY_EMAIL_DOMAINS = [
    'cutm.ac.in', 'cutmap.ac.in',
    'ftl.org.in', 'gramtarang.org.in', 'gramtarang.org', 'thegttech.com', 'centurionuniv.edu.in',
];
function isFacultyEmail(email) {
    if (!email) return false;
    const [local, domain] = String(email).toLowerCase().split('@');
    if (!local || !domain) return false;
    if (!FACULTY_EMAIL_DOMAINS.includes(domain)) return false;
    return /^[a-z]/.test(local);
}

/** Anyone on either campus domain, student or faculty — the bar for joining
 * a channel via invite link, as opposed to isFacultyEmail's bar for
 * creating/managing one. */
function isCampusEmail(email) {
    if (!email) return false;
    const domain = String(email).toLowerCase().split('@')[1];
    return FACULTY_EMAIL_DOMAINS.includes(domain);
}

/** A channel is visible to its members, or to a global CampusOne admin
 * overseeing the workspace — no one else, even with the exact id. */
async function canViewChannel(userId, channelId, user) {
    if (isGroupAdmin(user)) return true;
    const channel = await Channel.findByPk(channelId, { attributes: ['is_active'] });
    if (channel && channel.is_active === false) return false;
    return !!(await ChannelMember.findOne({ where: { channelId, userId } }));
}

/**
 * Clients should not have to know the workspace UUID to ask for "my stuff", so
 * 'default' (and anything unrecognised) resolves to the first workspace.
 */
async function resolveWorkspaceId(given) {
    if (given && given !== 'default' && given !== 'me') {
        const exact = await Workspace.findByPk(given).catch(() => null);
        if (exact) return exact.id;
    }
    const existing = await Workspace.findOne({ where: { slug: 'cu-orbit' } })
        || await Workspace.findOne({ order: [['createdAt', 'ASC']] });
    if (existing) return existing.id;

    // The boot seed creates this, but /api/health reports ready as soon as the
    // tables exist — before the seed finishes. Rather than depend on that
    // ordering, create it on demand.
    const [ws] = await Workspace.findOrCreate({
        where: { slug: 'cu-orbit' },
        defaults: { name: 'CU Orbit', slug: 'cu-orbit' },
    });
    return ws.id;
}

/**
 * May this user read/write the given container?
 * A container id is either a channel UUID or a DM room id ("uuidA_uuidB").
 */
async function canAccessContainer(userId, containerId, user = null) {
    if (!containerId) return false;
    // A DM room is addressed by its two participants and is never accessible to
    // anyone else, admins included.
    if (containerId.includes('_')) return containerId.split('_').includes(userId);
    const channel = await Channel.findByPk(containerId, { attributes: ['is_active'] });
    if (channel && channel.is_active === false && !isGroupAdmin(user)) return false;
    if (isGroupAdmin(user)) return true;
    return !!(await ChannelMember.findOne({ where: { channelId: containerId, userId } }));
}

/**
 * Shared by both sign-in methods: find the Orbit account for a verified
 * campus email, or provision one. Role is derived from CUTM's own email
 * convention (see isFacultyEmail) since neither Google nor an OTP proves
 * anything beyond "this person controls this mailbox" — the institution's
 * own naming convention is what actually says student vs. staff here.
 */
async function findOrCreateOrbitUser(campusEmail, displayName) {
    const email = String(campusEmail).toLowerCase();
    let user = await User.findOne({ where: { campus_email: email } });
    if (!user) user = await User.findOne({ where: { email } });

    if (user) {
        user.campus_email = email;
        if (displayName && !user.name) user.name = displayName;
        await user.save();
    } else {
        const role = isFacultyEmail(email) ? 'faculty' : 'student';
        const base = (displayName || email.split('@')[0]).toLowerCase().replace(/\s+/g, '_');
        user = await User.create({
            campus_email: email,
            email,
            name: displayName || email.split('@')[0],
            role,
            handle: `${base}_${crypto.randomBytes(2).toString('hex')}`,
        });
    }

    // Everyone lands in #general.
    const gen = await Channel.findOne({ where: { name: 'general' } });
    if (gen) {
        await ChannelMember.findOrCreate({
            where: { channelId: gen.id, userId: user.id },
            defaults: { channelId: gen.id, userId: user.id, role: 'member' },
        });
    }
    return user;
}

/**
 * Sign in with Google. The client (web via Google Identity Services, mobile
 * via a native/browser OAuth flow) hands us a Google-issued ID token; we
 * verify its signature against Google's own public keys and check the
 * audience is one of our two OAuth clients — no server-to-Google network
 * call needed beyond the (cached) public-key fetch, and no client secret
 * involved, since we are only checking a token Google already signed rather
 * than exchanging an authorization code.
 */
app.post('/api/auth/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ error: 'bad_request', message: 'idToken required' });

        const audience = [GOOGLE_WEB_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID].filter(Boolean);
        if (!audience.length) {
            console.error('[google-signin] GOOGLE_WEB_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID not set');
            return res.status(503).json({ error: 'not_configured' });
        }

        let payload;
        try {
            const ticket = await googleClient.verifyIdToken({ idToken, audience });
            payload = ticket.getPayload();
        } catch (e) {
            return res.status(401).json({ error: 'invalid_token', message: e.message });
        }

        if (!payload?.email) return res.status(401).json({ error: 'invalid_token', message: 'No email in token' });
        if (!payload.email_verified) {
            return res.status(403).json({ error: 'forbidden', message: 'Google email is not verified' });
        }
        const email = payload.email.toLowerCase();
        if (!isCampusEmail(email)) {
            return res.status(403).json({ error: 'forbidden', message: 'Sign in with your CUTM campus Google account' });
        }

        const user = await findOrCreateOrbitUser(email, payload.name);
        res.json({ success: true, session: auth.issueSession(user), user });
    } catch (e) {
        console.error('[google-signin] failed:', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5;

/** Request a one-time code by email — the passwordless sign-in path. */
app.post('/api/auth/otp/request', async (req, res) => {
    try {
        const email = String(req.body.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'bad_request', message: 'email required' });
        if (!isCampusEmail(email)) {
            return res.status(403).json({ error: 'forbidden', message: 'Use your CUTM campus email address' });
        }
        if (!mailer) {
            console.error('[otp] SMTP is not configured — cannot send codes');
            return res.status(503).json({ error: 'not_configured' });
        }

        const existing = await EmailOtp.findByPk(email);
        if (existing && Date.now() - new Date(existing.last_sent_at).getTime() < OTP_RESEND_COOLDOWN_MS) {
            return res.status(429).json({ error: 'rate_limited', message: 'Wait a moment before requesting another code' });
        }

        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const code_hash = crypto.createHash('sha256').update(code).digest('hex');
        await EmailOtp.upsert({
            email, code_hash, attempts: 0,
            expires_at: new Date(Date.now() + OTP_TTL_MS),
            last_sent_at: new Date(),
        });

        // The code is already valid and stored — respond now rather than
        // making the sign-in screen sit on Gmail's round-trip. If the send
        // itself fails, the user just hits "resend" after the cooldown.
        res.json({ success: true });

        mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: `${code} is your CU Orbit sign-in code`,
            text: `Your CU Orbit sign-in code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
        }).catch((e) => console.error('[otp-request] send failed:', e.message));
    } catch (e) {
        console.error('[otp-request] failed:', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

/** Verify a one-time code and sign in. */
app.post('/api/auth/otp/verify', async (req, res) => {
    try {
        const email = String(req.body.email || '').toLowerCase().trim();
        const code = String(req.body.code || '').trim();
        if (!email || !code) return res.status(400).json({ error: 'bad_request', message: 'email and code required' });

        const record = await EmailOtp.findByPk(email);
        if (!record) return res.status(401).json({ error: 'invalid_code', message: 'Request a new code' });
        if (new Date(record.expires_at).getTime() < Date.now()) {
            await record.destroy();
            return res.status(401).json({ error: 'expired', message: 'That code expired — request a new one' });
        }
        if (record.attempts >= OTP_MAX_ATTEMPTS) {
            await record.destroy();
            return res.status(429).json({ error: 'too_many_attempts', message: 'Too many wrong tries — request a new code' });
        }

        const code_hash = crypto.createHash('sha256').update(code).digest('hex');
        // Constant-time compare so response timing cannot narrow down the code.
        const a = Buffer.from(code_hash);
        const b = Buffer.from(record.code_hash);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            record.attempts += 1;
            await record.save();
            return res.status(401).json({ error: 'invalid_code', message: 'Wrong code' });
        }

        await record.destroy();
        const user = await findOrCreateOrbitUser(email, null);
        res.json({ success: true, session: auth.issueSession(user), user });
    } catch (e) {
        console.error('[otp-verify] failed:', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

/** Who am I — cheap way for clients to validate a stored session. */
app.get('/api/auth/me', auth.requireAuth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json({ user });
});

/**
 * Legacy passwordless auth. Returns any user for a posted phone number — no
 * credential of any kind — so it is off unless explicitly enabled. The Android
 * client still depends on it; keep ALLOW_LEGACY_AUTH=true only until that app
 * ships SSO, and never on an internet-facing deployment.
 */
const legacyAuthEnabled = process.env.ALLOW_LEGACY_AUTH === 'true';
const legacyAuthGate = (req, res, next) => {
    if (legacyAuthEnabled) return next();
    res.status(410).json({
        error: 'endpoint_retired',
        message: 'Passwordless login is disabled. Sign in through CampusOne (POST /api/auth/sso).',
    });
};

app.post('/api/auth/login', legacyAuthGate, async (req, res) => {
    try {
        const { email, phone } = req.body;
        let user;
        if (email) {
            user = await User.findOne({ where: { email: email } });
        } else if (phone) {
            const normalized = normalizePhone(phone);
            user = await User.findAll().then(users => users.find(u => normalizePhone(u.phone) === normalized));
        }

        if (user) {
            const gen = await Channel.findOne({ where: { name: 'general' } });
            if (gen) {
                await ChannelMember.findOrCreate({
                    where: { channelId: gen.id, userId: user.id },
                    defaults: { channelId: gen.id, userId: user.id, role: 'member' }
                });
            }
        }
        res.json({ success: true, isNewUser: !user, user });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/auth/register', legacyAuthGate, async (req, res) => {
    try {
        const { name, phone, email, avatarUrl, bio } = req.body;
        const handle = name.toLowerCase().replace(/\s+/g, '_') + '_' + phone.slice(-4);
        let user = await User.findOne({ where: { [Op.or]: [{ email }, { phone }] } });
        if (user) {
            user.name = name;
            user.phone = phone;
            user.avatarUrl = avatarUrl || user.avatarUrl;
            user.bio = bio || user.bio;
            await user.save();
        } else {
            user = await User.create({ name, phone, email, avatarUrl, bio, handle });
        }
        const gen = await Channel.findOne({ where: { name: 'general' } });
        if (gen) {
            await ChannelMember.create({ channelId: gen.id, userId: phone, role: 'member' });
            await gen.increment('member_count');
        }
        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// HOME FEED
app.get('/api/home/:userId/:workspaceId', auth.requireAuth, async (req, res) => {
    try {
        // :userId is ignored — kept only so existing clients keep working. The
        // session decides whose home this is, otherwise any signed-in user could
        // read another user's channel list by editing the path.
        const userId = req.user.id;
        const workspaceId = await resolveWorkspaceId(req.params.workspaceId);
        const memberships = await ChannelMember.findAll({ where: { userId: userId } });
        const channelIds = memberships.map(m => m.channelId);

        // Faculty and students see the groups they belong to. Admins see every
        // group in the workspace, so they can oversee and join without waiting
        // to be added. Direct messages are never included for anyone but their
        // participants, regardless of role. A deactivated channel disappears
        // entirely for regular members — admins still see it (greyed out on
        // the client), since they're the only ones who can reactivate it.
        const channels = isGroupAdmin(req.user)
            ? await Channel.findAll({ where: { workspace_id: workspaceId } })
            : await Channel.findAll({ where: { workspace_id: workspaceId, id: { [Op.in]: channelIds }, is_active: true } });

        const memberOf = new Set(channelIds);
        const channelsData = await Promise.all(channels.map(async (ch) => {
            const pref = await ConversationPref.findOne({ where: { userId, containerId: ch.id } });
            if (pref && pref.isHidden) return null;
            const lastMsg = await Message.findOne({ where: { channelId: ch.id }, order: [['timestamp', 'DESC']] });
            const unreadCount = await Message.count({ where: unreadWhere(userId, { channelId: ch.id }) });
            const hasUnreadMention = await Mention.count({ where: { mentioned_user_id: userId, source_channel_id: ch.id, is_read: false } }) > 0;
            return {
                ...ch.get({ plain: true }),
                is_member: memberOf.has(ch.id),
                is_muted: pref ? pref.isMuted : !!ch.is_muted,
                is_pinned: pref ? pref.isPinned : false,
                last_message_preview: lastMsg ? {
                    sender_id: lastMsg.senderId,
                    sender_name: lastMsg.senderName,
                    text: lastMsg.body || "",
                    sent_at: lastMsg.timestamp,
                    type: lastMsg.type,
                    sender_is_self: lastMsg.senderId === userId
                } : null,
                unread_count: unreadCount,
                has_unread_mention: hasUnreadMention
            };
        }));
        // Only actual conversations — not one row per every account that has
        // ever signed in to Orbit. Previously this scanned the entire Users
        // table and ran 4 queries per row regardless of whether the two of you
        // had ever exchanged a message, which was both the main source of home
        // feed slowness at any real user count and the reason a DM entry
        // (with a stranger's name and "not on Orbit" tag) showed up for
        // literally everyone who had ever signed in. dm_id is
        // `[a, b].sort().join('_')` — UUIDs never contain '_', so a LIKE on
        // either end of that pair reliably finds only my own conversations.
        const myDmMessages = await Message.findAll({
            where: { dm_id: { [Op.or]: [{ [Op.like]: `${userId}\\_%` }, { [Op.like]: `%\\_${userId}` }] } },
            order: [['timestamp', 'DESC']],
        });
        const dmIdToLastMsg = new Map();
        for (const m of myDmMessages) {
            if (!dmIdToLastMsg.has(m.dm_id)) dmIdToLastMsg.set(m.dm_id, m);
        }
        const otherIds = [...dmIdToLastMsg.keys()].map((dmId) => dmId.split('_').find((id) => id !== userId)).filter(Boolean);
        const otherUsers = otherIds.length ? await User.findAll({ where: { id: { [Op.in]: otherIds } } }) : [];
        const otherById = new Map(otherUsers.map((u) => [u.id, u]));

        const dms = await Promise.all([...dmIdToLastMsg.entries()].map(async ([dmId, lastMsg]) => {
            const otherId = dmId.split('_').find((id) => id !== userId);
            const u = otherById.get(otherId);
            if (!u) return null;   // the other account was removed
            const pref = await ConversationPref.findOne({ where: { userId, containerId: dmId } });
            if (pref && pref.isHidden && lastMsg.timestamp < pref.updatedAt) return null;
            const hasUnreadMention = await Mention.count({ where: { mentioned_user_id: userId, source_channel_id: dmId, is_read: false } }) > 0;
            return {
                id: dmId,
                other_user_id: u.id,
                other_user_name: u.name,
                other_user_avatar_url: u.avatarUrl,
                presence: u.presence,
                is_pinned: pref ? pref.isPinned : false,
                is_muted: pref ? pref.isMuted : false,
                unread_count: await Message.count({ where: unreadWhere(userId, { dm_id: dmId }) }),
                has_unread_mention: hasUnreadMention,
                last_message_preview: {
                    sender_is_self: lastMsg.senderId === userId,
                    text: lastMsg.body || "",
                    sent_at: lastMsg.timestamp,
                    type: lastMsg.type
                }
            };
        }));
        res.json({
            channels: channelsData.filter(c => c !== null).sort((a,b) => (b.is_pinned - a.is_pinned)),
            dms: dms.filter(d => d !== null).sort((a,b) => (b.is_pinned - a.is_pinned))
        });
    } catch (e) {
        console.error('[HOME-FEED-ERROR]', e);
        res.status(500).json({ channels: [], dms: [] });
    }
});

app.get('/api/home/quick-access/:userId', auth.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;   // :userId ignored — see /api/home/:userId
        const mentions = await Mention.count({ where: { mentioned_user_id: userId, is_read: false } });
        res.json({ threads: 0, mentions, drafts: 0 });
    } catch (e) {
        res.json({ threads: 0, mentions: 0, drafts: 0 });
    }
});

// PREFS
app.post('/api/conversations/:id/prefs', auth.requireAuth, async (req, res) => {
    try {
        const { action, value } = req.body;
        const userId = req.user.id;      // preferences are per-user and personal
        const containerId = req.params.id;
        const isTrue = (value === 'true' || value === true);
        const [pref] = await ConversationPref.findOrCreate({
            where: { userId, containerId },
            defaults: { userId, containerId, isPinned: false, isMuted: false, isHidden: false }
        });
        if (action === 'pin') pref.isPinned = isTrue;
        if (action === 'mute') pref.isMuted = isTrue;
        if (action === 'hide') pref.isHidden = isTrue;
        if (action === 'delete' && isTrue) pref.isHidden = true;
        await pref.save();
        res.json({ success: true, pref });
    } catch (e) {
        console.error('[PREF-ERROR]', e);
        res.status(500).json(e);
    }
});

// MESSAGES
// Bounded to the most recent history rather than the whole conversation —
// an active channel's full history could be thousands of rows, all of which
// used to be fetched (and re-fetched on every 3s poll) on every open. Pass
// ?before=<timestamp> to page further back.
const MESSAGE_PAGE_SIZE = 200;
app.get('/api/messages/:containerId', auth.requireAuth, async (req, res) => {
    try {
        const { containerId } = req.params;
        if (!(await canAccessContainer(req.user.id, containerId, req.user))) {
            return res.status(403).json({ error: 'forbidden', message: 'Not a participant in this conversation' });
        }
        const before = req.query.before ? Number(req.query.before) : null;
        const where = { [Op.or]: [{ channelId: containerId }, { dm_id: containerId }], deleted_at: null };
        if (before) where.timestamp = { [Op.lt]: before };
        // "Delete for me" — hidden only from the requester's own view, so this
        // has to be per-request, not baked into the shared `deleted_at` filter.
        const hidden = await HiddenMessage.findAll({ where: { user_id: req.user.id }, attributes: ['message_id'] });
        if (hidden.length) where.id = { [Op.notIn]: hidden.map((h) => h.message_id) };
        const messages = (await Message.findAll({
            where,
            order: [['timestamp', 'DESC']],
            limit: MESSAGE_PAGE_SIZE,
            include: [{
                model: Mention,
                as: 'mentions',
                include: [{ model: User, as: 'user', attributes: ['id', 'name', 'handle'] }]
            }]
        })).reverse();
        const starred = new Set(
            (await StarredMessage.findAll({
                where: { user_id: req.user.id, message_id: { [Op.in]: messages.map((m) => m.id) } },
                attributes: ['message_id'],
            })).map((s) => s.message_id)
        );
        const pollIds = messages.filter((m) => m.type === 'poll' && m.poll_id).map((m) => m.poll_id);
        const polls = pollIds.length ? await Poll.findAll({ where: { id: { [Op.in]: pollIds } } }) : [];
        const pollSummaries = new Map();
        for (const poll of polls) pollSummaries.set(poll.id, await pollSummary(poll, req.user.id));
        res.json(messages.map(m => ({
            id: m.id,
            channel_id: m.channelId,
            dm_id: m.dm_id,
            sender_id: m.senderId,
            sender_name: m.senderName,
            sender_avatar_url: m.senderAvatarUrl,
            text: m.body,
            sent_at: m.timestamp,
            type: m.type,
            is_starred: starred.has(m.id),
            attachments: m.attachments || [],
            reactions: m.reactions || [],
            status: m.status,
            is_pinned: m.is_pinned,
            edited_at: m.edited_at,
            reply_to: m.reply_to,
            forwarded_from: m.forwarded_from,
            poll: m.type === 'poll' ? pollSummaries.get(m.poll_id) || null : undefined,
            enriched_mentions: (m.mentions || []).map(mn => ({
                user_id: mn.user ? mn.user.id : '',
                display_name: mn.user ? mn.user.name : '',
                phone: mn.mentioned_user_id
            }))
        })));
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

/**
 * Message-content search, scoped to conversations the caller can actually
 * read — the same channel-membership + DM-participant rule as everywhere
 * else, so this can never surface a message from a container the user
 * couldn't open directly.
 */
app.get('/api/search', auth.requireAuth, async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) return res.json({ messages: [] });

        const userId = req.user.id;
        const memberships = await ChannelMember.findAll({ where: { userId } });
        const channelIds = memberships.map((m) => m.channelId);
        const allChannelIds = isGroupAdmin(req.user)
            ? (await Channel.findAll({ attributes: ['id'] })).map((c) => c.id)
            : channelIds;

        const messages = await Message.findAll({
            where: {
                body: { [Op.like]: `%${q}%` },
                deleted_at: null,
                [Op.or]: [
                    { channelId: { [Op.in]: allChannelIds } },
                    { dm_id: { [Op.like]: `%${userId}%` } },
                ],
            },
            order: [['timestamp', 'DESC']],
            limit: 50,
        });

        // The DM half of the OR above is a coarse pre-filter (dm_id contains
        // the id as a substring); confirm the caller is actually one of the
        // two participants before it goes back over the wire.
        const filtered = messages.filter(
            (m) => !m.dm_id || m.dm_id.split('_').includes(userId)
        );

        res.json({
            messages: filtered.map((m) => ({
                id: m.id,
                container_id: m.channelId || m.dm_id,
                sender_name: m.senderName,
                text: m.body,
                sent_at: m.timestamp,
                type: m.type,
            })),
        });
    } catch (e) {
        console.error('[SEARCH-ERROR]', e);
        res.status(500).json({ messages: [] });
    }
});

app.post('/api/messages', auth.requireAuth, async (req, res) => {
    try {
        const { body, channelId, type, mediaUrl, mediaName, mediaMimeType, mentions, enrichedMentions, replyToId, forwardedFromName } = req.body;

        // Sender identity comes from the session, never the request body — a
        // client-supplied senderId let anyone post as anyone. Display fields are
        // read from the user record for the same reason.
        const sender = await User.findByPk(req.user.id);
        if (!sender) return res.status(401).json({ error: 'unauthorized', message: 'Unknown user' });
        const senderId = sender.id;
        const senderName = sender.name;
        const senderAvatarUrl = sender.avatarUrl;

        // Membership check: a channel id addresses a channel, an id containing
        // '_' addresses a DM room. Both must include the sender.
        if (channelId) {
            if (channelId.includes('_')) {
                if (!channelId.split('_').includes(senderId)) {
                    return res.status(403).json({ error: 'forbidden', message: 'Not a participant in this conversation' });
                }
            } else {
                const member = await ChannelMember.findOne({ where: { channelId, userId: senderId } });
                if (!member) return res.status(403).json({ error: 'forbidden', message: 'Not a member of this channel' });
            }
        }
        if (channelId && !channelId.includes('_')) {
             const ch = await Channel.findByPk(channelId);
             // Deactivated channels are read/write-locked for everyone, no
             // admin bypass — "no one can message there until he makes it
             // active again" is the whole point of deactivate-over-delete.
             if (ch && ch.is_active === false) {
                 return res.status(403).json({ error: 'channel_deactivated', message: 'This channel has been deactivated' });
             }
             if (ch && ch.restricted_messaging) {
                 const member = await ChannelMember.findOne({ where: { channelId, userId: senderId } });
                 if (member && member.role !== 'admin') {
                     return res.status(403).json({ error: 'Only admins can send messages' });
                 }
             }
        }
        // Snapshotted server-side (not trusted from the client) so a reply
        // preview can't be spoofed to show text the quoted message never had.
        let reply_to = null;
        if (replyToId) {
            const original = await Message.findByPk(replyToId);
            if (original) reply_to = { id: original.id, sender_name: original.senderName, text: original.body };
        }
        const msg = await Message.create({
            senderId, senderName, body, channelId, type: type || 'text',
            senderAvatarUrl, dm_id: (channelId && channelId.includes('_')) ? channelId : null,
            attachments: mediaUrl ? [{ type: type, url: mediaUrl, name: mediaName, mimeType: mediaMimeType }] : [],
            reply_to,
            forwarded_from: forwardedFromName ? { sender_name: forwardedFromName } : null,
        });
        // Mentions are keyed on User.id. This block previously ran entirely on
        // phone numbers — comparing normalized UUIDs, and looking up members by
        // phone with a UUID — so no mention resolved once identity moved.
        // Who should see a badge update: channel members, or the DM partner.
        const recipientIds = channelId && channelId.includes('_')
            ? channelId.split('_')
            : (await ChannelMember.findAll({ where: { channelId } })).map((m) => m.userId);

        const mentionedIds = new Set();
        if (enrichedMentions && Array.isArray(enrichedMentions)) {
            for (const mData of enrichedMentions) {
                const id = mData.user_id || mData.userId;
                if (id && id !== senderId) mentionedIds.add(id);
            }
        }
        // "@mention entire channel (@channel)" / "@mention all online members
        // (@here)" — @here has no separate presence-filtered meaning here
        // (nothing tracks "online in this channel" today), so it broadcasts
        // the same as @channel/@all/@everyone rather than silently doing less
        // than the name promises.
        const BROADCAST_MENTIONS = ['@all', '@everyone', '@channel', '@here'];
        if (body && BROADCAST_MENTIONS.some((tag) => body.toLowerCase().includes(tag))) {
            const members = await ChannelMember.findAll({ where: { channelId: channelId } });
            for (const member of members) {
                if (member.userId !== senderId) mentionedIds.add(member.userId);
            }
        }
        if (mentionedIds.size === 0 && body && body.includes('@')) {
            const members = await ChannelMember.findAll({ where: { channelId } });
            const ids = members.map((m) => m.userId).filter((id) => id !== senderId);
            const users = ids.length ? await User.findAll({ where: { id: { [Op.in]: ids } } }) : [];
            const text = body.toLowerCase();
            for (const user of users) {
                if (user.name && text.includes(`@${user.name.toLowerCase()}`)) mentionedIds.add(user.id);
                else if (user.handle && text.includes(`@${user.handle.toLowerCase()}`)) mentionedIds.add(user.id);
            }
        }
        for (const uid of mentionedIds) {
            await Mention.findOrCreate({
                where: { message_id: msg.id, mentioned_user_id: uid },
                defaults: { source_channel_id: channelId, is_read: false }
            });
            const user = await User.findByPk(uid);
            if (user) routeMentionNotification(user, msg);
        }
        // Push to everyone in the conversation. Recipients also get a badge
        // signal on their own channel, so a closed conversation still counts.
        const container = channelId;
        realtime.toContainer(container, 'message', {
            id: msg.id,
            container_id: container,
            sender_id: msg.senderId,
            sender_name: msg.senderName,
            sender_avatar_url: msg.senderAvatarUrl,
            text: msg.body,
            type: msg.type,
            attachments: msg.attachments,
            sent_at: Number(msg.timestamp),
            status: msg.status,
            reply_to: msg.reply_to,
            forwarded_from: msg.forwarded_from,
        });
        for (const uid of recipientIds) {
            if (uid !== senderId) realtime.toUser(uid, 'unread-changed', { container_id: container });
        }

        res.json(msg);
    } catch (e) {
        console.error('[MSG-ERROR]', e);
        res.status(500).json(e);
    }
});

app.put('/api/messages/:id', auth.requireAuth, async (req, res) => {
    try {
        const { body, status, pinned } = req.body;
        const msg = await Message.findByPk(req.params.id);
        if (!msg || msg.deleted_at) return res.status(404).json({ error: 'Message not found' });

        // "SUPERADMIN: Edit any message (anytime)" / "ADMIN: cannot edit other
        // people's messages" — unlike delete, a channel admin has no edit
        // override here, only a global admin does; everyone else edits only
        // their own, within the same grace window as deleting their own.
        if (body !== undefined) {
            const isAuthor = msg.senderId === req.user.id;
            if (!isAuthor && !isGroupAdmin(req.user)) {
                return res.status(403).json({ error: 'forbidden', message: 'Only the author or a workspace admin can edit this message' });
            }
            if (isAuthor && !isGroupAdmin(req.user) && Date.now() - Number(msg.timestamp) > SELF_EDIT_WINDOW_MS) {
                return res.status(403).json({ error: 'forbidden', message: 'This message is too old to edit yourself — ask a workspace admin' });
            }
            msg.edit_history = [...(msg.edit_history || []), { body: msg.body, edited_at: msg.edited_at || msg.timestamp }];
            msg.body = body;
            msg.edited_at = new Date();
            if (!isAuthor) await logAudit(req.user, 'message.edited', 'message', msg.id, `by admin, container ${msg.channelId || msg.dm_id}`);
        }

        // Status is a read receipt, so recipients set it — but only forward, and
        // never on their own message. Without the sender check, anyone could mark
        // another person's message as read on their behalf.
        if (status !== undefined) {
            if (!['sent', 'delivered', 'read'].includes(status)) {
                return res.status(400).json({ error: 'bad_request', message: 'Invalid status' });
            }
            if (msg.senderId !== req.user.id) msg.status = status;
        }

        // Pinning is a container-wide flag ("important, everyone should see
        // this"), not per-user — anyone with access to the conversation may
        // set it, same bar as reading it at all. Only one message may be
        // pinned per conversation at a time — pinning a new one replaces
        // whichever was pinned before, unlike starring which has no limit.
        if (pinned !== undefined) {
            const containerId = msg.channelId || msg.dm_id;
            if (!(await canAccessContainer(req.user.id, containerId, req.user))) {
                return res.status(403).json({ error: 'forbidden', message: 'Not a participant in this conversation' });
            }
            if (pinned) {
                await Message.update(
                    { is_pinned: false },
                    { where: { [Op.or]: [{ channelId: containerId }, { dm_id: containerId }], is_pinned: true, id: { [Op.ne]: msg.id } } }
                );
            }
            msg.is_pinned = !!pinned;
        }

        await msg.save();
        res.json(msg);
    } catch (e) { res.status(500).json(e); }
});

/**
 * Toggle a reaction. The Android app has called this route since it shipped
 * (ApiService.kt's reactToMessage) but the server never implemented it, so
 * every reaction attempt has 404'd in production until now.
 *
 * Identity comes from the session, not the request body — same reasoning as
 * POST /api/messages: a client-supplied userId would let anyone react as
 * anyone. One reaction per (user, emoji) pair; posting the same emoji again
 * removes it, mirroring how Slack/WhatsApp-style reaction toggles behave.
 */
app.post('/api/messages/:id/reactions', auth.requireAuth, async (req, res) => {
    try {
        const { emoji } = req.body;
        if (!emoji) return res.status(400).json({ error: 'bad_request', message: 'emoji required' });

        const msg = await Message.findByPk(req.params.id);
        if (!msg) return res.status(404).json({ error: 'not_found', message: 'Message not found' });

        const userId = req.user.id;
        const sender = await User.findByPk(userId);
        const userName = sender ? sender.name : req.user.email;

        const existing = msg.reactions || [];
        const already = existing.some((r) => r.userId === userId && r.emoji === emoji);
        const reactions = already
            ? existing.filter((r) => !(r.userId === userId && r.emoji === emoji))
            : [...existing, { userId, userName, emoji }];

        msg.reactions = reactions;
        await msg.save();

        const containerId = msg.channelId || msg.dm_id;
        realtime.toContainer(containerId, 'message', {
            id: msg.id,
            container_id: containerId,
            sender_id: msg.senderId,
            sender_name: msg.senderName,
            sender_avatar_url: msg.senderAvatarUrl,
            text: msg.body,
            type: msg.type,
            attachments: msg.attachments,
            reactions: msg.reactions,
            sent_at: Number(msg.timestamp),
            status: msg.status,
        });

        res.json(msg);
    } catch (e) {
        console.error('[REACTION-ERROR]', e);
        res.status(500).json(e);
    }
});

/** "Star" a message — a private bookmark, never visible to anyone else. */
app.post('/api/messages/:id/star', auth.requireAuth, async (req, res) => {
    try {
        const msg = await Message.findByPk(req.params.id);
        if (!msg || msg.deleted_at) return res.status(404).json({ error: 'not_found' });
        const containerId = msg.channelId || msg.dm_id;
        if (!(await canAccessContainer(req.user.id, containerId, req.user))) {
            return res.status(403).json({ error: 'forbidden' });
        }
        await StarredMessage.findOrCreate({
            where: { user_id: req.user.id, message_id: msg.id },
            defaults: { container_id: containerId },
        });
        res.json({ success: true, starred: true });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.delete('/api/messages/:id/star', auth.requireAuth, async (req, res) => {
    try {
        await StarredMessage.destroy({ where: { user_id: req.user.id, message_id: req.params.id } });
        res.json({ success: true, starred: false });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/** All of the caller's starred messages, optionally scoped to one conversation. */
app.get('/api/starred', auth.requireAuth, async (req, res) => {
    try {
        const where = { user_id: req.user.id };
        if (req.query.container_id) where.container_id = req.query.container_id;
        const stars = await StarredMessage.findAll({ where, order: [['createdAt', 'DESC']] });
        const messageIds = stars.map((s) => s.message_id);
        const messages = messageIds.length
            ? await Message.findAll({ where: { id: { [Op.in]: messageIds }, deleted_at: null } })
            : [];
        const byId = new Map(messages.map((m) => [m.id, m]));
        res.json(stars.map((s) => byId.get(s.message_id)).filter(Boolean).map((m) => ({
            id: m.id, container_id: m.channelId || m.dm_id, sender_id: m.senderId, sender_name: m.senderName,
            text: m.body, type: m.type, attachments: m.attachments, sent_at: Number(m.timestamp),
        })));
    } catch (e) { res.status(500).json([]); }
});

/** "View all pinned messages" for a channel or DM. */
app.get('/api/containers/:id/pinned', auth.requireAuth, async (req, res) => {
    try {
        const containerId = req.params.id;
        if (!(await canAccessContainer(req.user.id, containerId, req.user))) {
            return res.status(403).json({ error: 'forbidden' });
        }
        const messages = await Message.findAll({
            where: { [Op.or]: [{ channelId: containerId }, { dm_id: containerId }], is_pinned: true, deleted_at: null },
            order: [['timestamp', 'DESC']],
        });
        res.json(messages.map((m) => ({
            id: m.id, container_id: containerId, sender_id: m.senderId, sender_name: m.senderName,
            text: m.body, type: m.type, attachments: m.attachments, sent_at: Number(m.timestamp),
        })));
    } catch (e) { res.status(500).json([]); }
});

const LINK_REGEX = /https?:\/\/\S+/i;

/**
 * "Shared media" browser for a channel/DM's info panel — Photos / Videos /
 * Documents / Links, matching the category chips Slack shows there.
 */
app.get('/api/containers/:id/media', auth.requireAuth, async (req, res) => {
    try {
        const containerId = req.params.id;
        if (!(await canAccessContainer(req.user.id, containerId, req.user))) {
            return res.status(403).json({ error: 'forbidden' });
        }
        const category = String(req.query.type || 'image');
        const where = { [Op.or]: [{ channelId: containerId }, { dm_id: containerId }], deleted_at: null };
        if (category === 'link') {
            where.body = { [Op.like]: '%http%' };
        } else {
            const typeMap = { image: 'image', video: 'video', document: 'file' };
            where.type = typeMap[category] || 'image';
        }
        const messages = await Message.findAll({ where, order: [['timestamp', 'DESC']], limit: 200 });
        const filtered = category === 'link' ? messages.filter((m) => LINK_REGEX.test(m.body || '')) : messages;
        res.json(filtered.map((m) => ({
            id: m.id, container_id: containerId, sender_id: m.senderId, sender_name: m.senderName,
            text: m.body, type: m.type, attachments: m.attachments, sent_at: Number(m.timestamp),
            links: category === 'link' ? (m.body.match(new RegExp(LINK_REGEX, 'gi')) || []) : undefined,
        })));
    } catch (e) { res.status(500).json([]); }
});

/** Vote counts + "did I vote" shape shared by every poll read path. */
async function pollSummary(poll, userId) {
    const votes = await PollVote.findAll({ where: { poll_id: poll.id } });
    const counts = (poll.options || []).map((_, i) => votes.filter((v) => v.option_index === i).length);
    const totalMembers = await ChannelMember.count({ where: { channelId: poll.channel_id } });
    const voterIds = [...new Set(votes.map((v) => v.user_id))];
    const voterUsers = voterIds.length
        ? await User.findAll({ where: { id: { [Op.in]: voterIds } }, attributes: ['id', 'name', 'avatarUrl'] })
        : [];
    const voterById = new Map(voterUsers.map((u) => [u.id, u]));
    const voters = (poll.options || []).map((_, i) =>
        votes
            .filter((v) => v.option_index === i)
            .map((v) => {
                const u = voterById.get(v.user_id);
                return { id: v.user_id, name: u?.name || 'Unknown', avatarUrl: u?.avatarUrl || null };
            })
    );
    return {
        id: poll.id,
        channel_id: poll.channel_id,
        question: poll.question,
        options: poll.options,
        multiple_choice: poll.multiple_choice,
        closed: poll.closed,
        total_votes: votes.length,
        counts,
        voters,
        my_votes: votes.filter((v) => v.user_id === userId).map((v) => v.option_index),
        // A member can pick several options in a multiple-choice poll, so
        // "voted" is counted by distinct person, not by ballot.
        voted_members: voterIds.length,
        total_members: totalMembers,
    };
}

/** "Polls in channels" — creating one posts a normal poll-type message alongside it. */
app.post('/api/channels/:id/polls', auth.requireAuth, async (req, res) => {
    try {
        const channelId = req.params.id;
        const { question, options, multipleChoice } = req.body;
        if (!question || !Array.isArray(options) || options.length < 2) {
            return res.status(400).json({ error: 'bad_request', message: 'A poll needs a question and at least 2 options' });
        }
        const member = await ChannelMember.findOne({ where: { channelId, userId: req.user.id } });
        if (!member && !isGroupAdmin(req.user)) {
            return res.status(403).json({ error: 'forbidden', message: 'Not a member of this channel' });
        }
        const sender = await User.findByPk(req.user.id);
        const poll = await Poll.create({
            channel_id: channelId, question, options: options.map(String),
            multiple_choice: !!multipleChoice, created_by: req.user.id,
        });
        const msg = await Message.create({
            senderId: sender.id, senderName: sender.name, senderAvatarUrl: sender.avatarUrl,
            channelId, type: 'poll', body: question, poll_id: poll.id,
        });
        const summary = await pollSummary(poll, req.user.id);
        realtime.toContainer(channelId, 'message', {
            id: msg.id, container_id: channelId, sender_id: msg.senderId, sender_name: msg.senderName,
            sender_avatar_url: msg.senderAvatarUrl, text: msg.body, type: 'poll', poll: summary,
            sent_at: Number(msg.timestamp), status: msg.status,
        });
        res.json({ message: msg, poll: summary });
    } catch (e) {
        console.error('[poll-create] failed:', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

app.get('/api/polls/:id', auth.requireAuth, async (req, res) => {
    try {
        const poll = await Poll.findByPk(req.params.id);
        if (!poll) return res.status(404).json({ error: 'not_found' });
        if (!(await canAccessContainer(req.user.id, poll.channel_id, req.user))) {
            return res.status(403).json({ error: 'forbidden' });
        }
        res.json(await pollSummary(poll, req.user.id));
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/** Toggles the caller's vote on one option; single-choice polls clear any other vote first. */
app.post('/api/polls/:id/vote', auth.requireAuth, async (req, res) => {
    try {
        const poll = await Poll.findByPk(req.params.id);
        if (!poll) return res.status(404).json({ error: 'not_found' });
        if (poll.closed) return res.status(403).json({ error: 'forbidden', message: 'This poll is closed' });
        if (!(await canAccessContainer(req.user.id, poll.channel_id, req.user))) {
            return res.status(403).json({ error: 'forbidden' });
        }
        const optionIndex = Number(req.body.optionIndex);
        if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= (poll.options || []).length) {
            return res.status(400).json({ error: 'bad_request', message: 'Invalid option' });
        }
        const existing = await PollVote.findOne({ where: { poll_id: poll.id, user_id: req.user.id, option_index: optionIndex } });
        if (existing) {
            await existing.destroy();
        } else {
            if (!poll.multiple_choice) {
                await PollVote.destroy({ where: { poll_id: poll.id, user_id: req.user.id } });
            }
            await PollVote.create({ poll_id: poll.id, user_id: req.user.id, option_index: optionIndex });
        }
        const summary = await pollSummary(poll, req.user.id);
        realtime.toContainer(poll.channel_id, 'poll-updated', summary);
        res.json(summary);
    } catch (e) {
        console.error('[poll-vote] failed:', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

/**
 * Same story as reactions above: the Android app has called DELETE on this
 * route since it shipped, and it has always 404'd — never implemented here.
 */
// "Edit/delete own messages (usually within time limit)" for regular users.
const SELF_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Who may act on someone else's message here: a global admin always can; a
 * channel's own admin can within that one channel (never in a DM — there is
 * no "admin" role in a two-person conversation, just its participants).
 */
async function canModerateContainer(user, containerId) {
    if (isGroupAdmin(user)) return true;
    if (!containerId || containerId.includes('_')) return false;
    const member = await ChannelMember.findOne({ where: { channelId: containerId, userId: user.id } });
    return !!member && member.role === 'admin';
}

app.delete('/api/messages/:id', auth.requireAuth, async (req, res) => {
    try {
        const msg = await Message.findByPk(req.params.id);
        if (!msg || msg.deleted_at) return res.status(404).json({ error: 'not_found', message: 'Message not found' });
        const containerId = msg.channelId || msg.dm_id;

        const isAuthor = msg.senderId === req.user.id;
        const moderator = !isAuthor && (await canModerateContainer(req.user, containerId));
        if (!isAuthor && !moderator) {
            return res.status(403).json({ error: 'forbidden', message: 'Only the author, a channel admin, or a workspace admin can delete this message' });
        }
        // The time window is the *author's own* grace period, not a limit on
        // moderators acting on someone else's message.
        if (isAuthor && !isGroupAdmin(req.user) && Date.now() - Number(msg.timestamp) > SELF_EDIT_WINDOW_MS) {
            return res.status(403).json({ error: 'forbidden', message: 'This message is too old to delete yourself — ask a channel admin' });
        }

        // Soft delete: "View deleted messages" (superadmin) needs the row to
        // still exist. Every other read path filters deleted_at IS NULL.
        msg.deleted_at = new Date();
        await msg.save();
        if (!isAuthor) await logAudit(req.user, 'message.deleted', 'message', msg.id, `by ${moderator ? 'moderator' : 'admin'} in ${containerId}`);
        // No dedicated "deleted" realtime event exists on any client yet — the
        // next poll (web's 20s fallback, mobile's 3s) picks up the removal
        // since GET /api/messages filters deleted rows out.
        res.json({ success: true, id: req.params.id, container_id: containerId });
    } catch (e) {
        console.error('[DELETE-MESSAGE-ERROR]', e);
        res.status(500).json(e);
    }
});

/** "Delete for me" — see HiddenMessage above. */
app.post('/api/messages/:id/hide', auth.requireAuth, async (req, res) => {
    try {
        const msg = await Message.findByPk(req.params.id);
        if (!msg) return res.status(404).json({ error: 'not_found' });
        const containerId = msg.channelId || msg.dm_id;
        if (!(await canAccessContainer(req.user.id, containerId, req.user))) {
            return res.status(403).json({ error: 'forbidden' });
        }
        await HiddenMessage.findOrCreate({ where: { user_id: req.user.id, message_id: msg.id } });
        res.json({ success: true, id: req.params.id, container_id: containerId });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.get('/api/mentions/:userId', auth.requireAuth, async (req, res) => {
    try {
        // :userId ignored — your mentions are yours.
        const mentions = await Mention.findAll({ where: { mentioned_user_id: req.user.id }, order: [['createdAt', 'DESC']] });
        const results = await Promise.all(mentions.map(async (m) => {
            const msg = await Message.findByPk(m.message_id);
            if (!msg) return null;
            let sourceName = 'Channel';
            if (m.source_channel_id && m.source_channel_id.includes('_')) sourceName = 'Direct Message';
            else if (m.source_channel_id && m.source_channel_id !== 'STATUS') {
                const ch = await Channel.findByPk(m.source_channel_id);
                if (ch) sourceName = `#${ch.name}`;
            }
            return {
                id: m.id, message_id: m.message_id, sender_id: msg.senderId, sender_name: msg.senderName,
                text: msg.body, sent_at: msg.timestamp, channel_id: m.source_channel_id, channel_name: sourceName, is_read: m.is_read
            };
        }));
        res.json(results.filter(r => r !== null));
    } catch (e) {
        console.error('[mentions] failed:', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

app.post('/api/mentions/read-all', auth.requireAuth, async (req, res) => {
    try {
        const { containerId } = req.body;
        await Mention.update({ is_read: true }, { where: { mentioned_user_id: req.user.id, source_channel_id: containerId } });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/mentions/:id/read', auth.requireAuth, async (req, res) => {
    try {
        const mention = await Mention.findByPk(req.params.id);
        if (mention && mention.mentioned_user_id !== req.user.id) {
            return res.status(403).json({ error: 'forbidden', message: 'Not your mention' });
        }
        if (mention) { mention.is_read = true; await mention.save(); }
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

// STATUS
app.get('/api/status', auth.requireAuth, async (req, res) => {
    try { res.json(await Status.findAll({ order: [['createdAt', 'DESC']] })); } catch (e) { res.json([]); }
});

app.post('/api/status', auth.requireAuth, async (req, res) => {
    try {
        const { type, mediaUrl, caption, mentions } = req.body;
        const poster = await User.findByPk(req.user.id);
        if (!poster) return res.status(401).json({ error: 'unauthorized' });
        const status = await Status.create({
            userId: poster.id, userName: poster.name, type, mediaUrl, caption, mentions: mentions || [],
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        if (mentions && Array.isArray(mentions)) {
            for (const uid of mentions) { await Mention.create({ message_id: status.id, mentioned_user_id: uid, source_channel_id: 'STATUS', is_read: false }); }
        }
        res.json(status);
    } catch (e) { res.status(500).json(e); }
});

// USERS
app.get('/api/users', auth.requireAuth, async (req, res) => {
    try { res.json(await User.findAll()); } catch (e) { res.json([]); }
});

// --- SUPERADMIN: user management ---
// "View all members list" / "View who joined when" — the plain member
// roster, workspace-wide, not scoped to any one channel.
app.get('/api/admin/users', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const users = await User.findAll({ order: [['createdAt', 'ASC']] });
        res.json(users);
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/** "Change member role (Member → Admin → Owner)" — our role enum's version of that ladder. */
app.put('/api/admin/users/:id/role', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const { role } = req.body;
        if (!ROLES.includes(role)) return res.status(400).json({ error: 'bad_request', message: `role must be one of: ${ROLES.join(', ')}` });
        const target = await User.findByPk(req.params.id);
        if (!target) return res.status(404).json({ error: 'not_found' });
        const previous = target.role;
        target.role = role;
        await target.save();
        await logAudit(req.user, 'user.role_changed', 'user', target.id, `${previous} → ${role}`);
        res.json({ success: true, user: target });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/** "Deactivate/reactivate members" */
app.put('/api/admin/users/:id/active', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const { active } = req.body;
        if (typeof active !== 'boolean') return res.status(400).json({ error: 'bad_request', message: 'active must be boolean' });
        const target = await User.findByPk(req.params.id);
        if (!target) return res.status(404).json({ error: 'not_found' });
        if (target.id === req.user.id && !active) {
            return res.status(400).json({ error: 'bad_request', message: "You can't deactivate your own account" });
        }
        target.is_active = active;
        await target.save();
        await logAudit(req.user, active ? 'user.reactivated' : 'user.deactivated', 'user', target.id, null);
        res.json({ success: true, user: target });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/**
 * "Remove members from workspace" — unlike deactivation, this actually
 * evicts them: every channel membership is dropped and the account is
 * deactivated (not deleted — their past messages stay attributed and
 * readable, exactly like Slack's own "deactivated user" behaviour once
 * removed; a hard delete would either orphan every message they ever sent
 * or force cascading deletes through the whole conversation history).
 */
app.delete('/api/admin/users/:id', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const target = await User.findByPk(req.params.id);
        if (!target) return res.status(404).json({ error: 'not_found' });
        if (target.id === req.user.id) return res.status(400).json({ error: 'bad_request', message: "You can't remove your own account" });
        await ChannelMember.destroy({ where: { userId: target.id } });
        target.is_active = false;
        await target.save();
        await logAudit(req.user, 'user.removed', 'user', target.id, target.campus_email || target.email);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/**
 * "Bulk add members (upload CSV)" — adapted for an SSO-less, no-manual-
 * accounts app: there's no password to set on someone else's behalf, so
 * this takes a list of campus emails instead of a CSV of credentials.
 * Each becomes a real account the moment they first sign in with Google or
 * an email code; here they're just provisioned and dropped into #general.
 */
app.post('/api/admin/users/bulk-add', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const emails = Array.isArray(req.body.emails) ? req.body.emails : [];
        const results = { added: [], skipped: [] };
        for (const raw of emails) {
            const email = String(raw || '').toLowerCase().trim();
            if (!email || !isCampusEmail(email)) { results.skipped.push({ email: raw, reason: 'not a campus email' }); continue; }
            const user = await findOrCreateOrbitUser(email, null);
            results.added.push({ id: user.id, email: user.campus_email });
        }
        await logAudit(req.user, 'user.bulk_added', 'user', null, `${results.added.length} added, ${results.skipped.length} skipped`);
        res.json({ success: true, ...results });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/**
 * "Superadmin can make other people superadmin by email" — provisions the
 * account if it doesn't exist yet (same as bulk-add), then promotes it
 * straight to the global admin role, so this also works for someone who
 * hasn't signed in for the first time yet.
 */
app.post('/api/admin/users/promote-by-email', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const email = String(req.body.email || '').toLowerCase().trim();
        if (!email || !isCampusEmail(email)) {
            return res.status(400).json({ error: 'bad_request', message: 'Enter a valid campus email address' });
        }
        const user = await findOrCreateOrbitUser(email, null);
        user.role = 'admin';
        await user.save();
        await logAudit(req.user, 'user.promoted_superadmin', 'user', user.id, user.campus_email || user.email);
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.get('/api/users/:identifier', auth.requireAuth, async (req, res) => {
    try {
        const user = await User.findOne({ where: { [Op.or]: [{ phone: req.params.identifier }, { id: req.params.identifier }] } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) { res.status(500).json(e); }
});

app.put('/api/users/:phone', auth.requireAuth, async (req, res) => {
    try {
        // The path param is not trusted: you may only edit your own profile.
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const { name, bio, avatarUrl, status_emoji, status_text } = req.body;
        if (name) user.name = name;
        if (bio) user.bio = bio;
        if (avatarUrl) user.avatarUrl = avatarUrl;
        if (status_emoji) user.status_emoji = status_emoji;
        if (status_text) user.status_text = status_text;
        await user.save();
        res.json({ success: true, user });
    } catch (e) { res.status(500).json(e); }
});

// WORKSPACES
app.get('/api/workspaces', auth.requireAuth, async (req, res) => {
    try { res.json(await Workspace.findAll({ include: [{ model: Channel, as: 'channels' }] })); } catch (e) { res.json([]); }
});

app.post('/api/workspaces/:workspaceId/channels', auth.requireAuth, async (req, res) => {
    try {
        if (!isGroupAdmin(req.user) && !isFacultyEmail(req.user.email)) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'Only faculty and staff can create channels.',
            });
        }
        const { name, type, description, members } = req.body;

        // "ADMIN: Create public channels (not private)" / "SUPERADMIN: Create
        // channels (public & private)" — only a global admin may create a
        // private one; everyone else who can create at all gets public only.
        const wantsPrivate = type === 'private';
        if (wantsPrivate && !isGroupAdmin(req.user)) {
            return res.status(403).json({ error: 'forbidden', message: 'Only workspace admins can create private channels.' });
        }

        const clean = String(name || '').trim().replace(/^#/, '');
        if (!clean) return res.status(400).json({ error: 'bad_request', message: 'Group name is required' });
        if (clean.length > 80) return res.status(400).json({ error: 'bad_request', message: 'Group name is too long' });

        const workspaceId = await resolveWorkspaceId(req.params.workspaceId);
        if (!workspaceId) return res.status(404).json({ error: 'not_found', message: 'No workspace' });

        // Creator comes from the session — a body-supplied userId let anyone
        // create a group owned by someone else.
        const creator = req.user.id;

        const channel = await Channel.create({
            workspace_id: workspaceId, name: clean, type: wantsPrivate ? 'private' : 'public',
            topic: description || '', invite_code: crypto.randomBytes(4).toString('hex'), created_by: creator
        });
        await ChannelMember.create({ channelId: channel.id, userId: creator, role: 'admin' });

        // Optional initial members. Unknown ids are skipped rather than failing
        // the whole creation.
        let added = 0;
        if (Array.isArray(members) && members.length) {
            const valid = await User.findAll({ where: { id: { [Op.in]: members.filter((m) => m !== creator) } }, attributes: ['id'] });
            for (const u of valid) {
                const [, created] = await ChannelMember.findOrCreate({
                    where: { channelId: channel.id, userId: u.id },
                    defaults: { channelId: channel.id, userId: u.id, role: 'member' },
                });
                if (created) added++;
            }
        }
        await channel.update({ member_count: added + 1 });

        for (const m of await ChannelMember.findAll({ where: { channelId: channel.id } })) {
            realtime.toUser(m.userId, 'channel-added', { id: channel.id, name: channel.name, topic: channel.topic });
        }

        res.json(channel);
    } catch (e) {
        // A bare json(e) serialises a Sequelize error to {}, which made this
        // fail silently in testing. Name the cause.
        console.error('[CHANNEL-CREATE-ERROR]', e.message, e.parent?.sqlMessage || '');
        res.status(500).json({ error: 'server_error', message: e.message, detail: e.parent?.sqlMessage });
    }
});

// CHANNELS
app.get('/api/channels/:id', auth.requireAuth, async (req, res) => {
    try {
        if (!(await canViewChannel(req.user.id, req.params.id, req.user))) {
            return res.status(403).json({ error: 'forbidden', message: 'Not a member of this channel' });
        }
        const ch = await Channel.findByPk(req.params.id);
        res.json(ch);
    } catch (e) { res.status(500).json(e); }
});

app.put('/api/channels/:id', auth.requireAuth, async (req, res) => {
    try {
        const me = await ChannelMember.findOne({ where: { channelId: req.params.id, userId: req.user.id } });
        if ((!me || me.role !== 'admin') && !isGroupAdmin(req.user)) {
            return res.status(403).json({ error: 'forbidden', message: 'Only channel admins can edit channel info' });
        }
        const { restricted_messaging, info_edit_restricted, approval_required, topic, name } = req.body;
        const channel = await Channel.findByPk(req.params.id);
        if (channel) {
            if (restricted_messaging !== undefined) channel.restricted_messaging = restricted_messaging;
            if (info_edit_restricted !== undefined) channel.info_edit_restricted = info_edit_restricted;
            if (approval_required !== undefined) channel.approval_required = approval_required;
            if (topic !== undefined) channel.topic = topic;
            if (name !== undefined) channel.name = name;
            await channel.save();
        }
        res.json(channel);
    } catch (e) { res.status(500).json(e); }
});

/** "View activity logs (audit trail)" */
app.get('/api/admin/audit-log', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const entries = await AuditLog.findAll({ order: [['createdAt', 'DESC']], limit: 200 });
        res.json(entries);
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/** "View deleted messages" */
app.get('/api/admin/deleted-messages', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const messages = await Message.findAll({
            where: { deleted_at: { [Op.ne]: null } },
            order: [['deleted_at', 'DESC']],
            limit: 200,
        });
        res.json(messages.map((m) => ({
            id: m.id, container_id: m.channelId || m.dm_id, sender_id: m.senderId, sender_name: m.senderName,
            text: m.body, sent_at: m.timestamp, deleted_at: m.deleted_at,
        })));
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/** "View message edit history" */
app.get('/api/admin/messages/:id/history', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    try {
        const msg = await Message.findByPk(req.params.id);
        if (!msg) return res.status(404).json({ error: 'not_found' });
        res.json({ current: msg.body, history: msg.edit_history || [] });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/** "DELETE CHANNEL" — superadmin only, not even the channel's own creator/admin. */
app.delete('/api/channels/:id', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden', message: 'Only workspace admins can delete a channel.' });
    try {
        const channel = await Channel.findByPk(req.params.id);
        if (!channel) return res.status(404).json({ error: 'not_found' });
        await ChannelMember.destroy({ where: { channelId: channel.id } });
        await Message.destroy({ where: { channelId: channel.id } });
        await logAudit(req.user, 'channel.deleted', 'channel', channel.id, channel.name);
        await channel.destroy();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

/**
 * "Deactivate/reactivate a channel" — the superadmin-facing alternative to
 * deleting one outright. History and membership stay intact; while inactive
 * the channel disappears from every non-admin's list (canViewChannel/
 * canAccessContainer) and message sends are rejected for everyone, no admin
 * bypass, until reactivated here.
 */
app.put('/api/channels/:id/active', auth.requireAuth, async (req, res) => {
    if (!isGroupAdmin(req.user)) return res.status(403).json({ error: 'forbidden', message: 'Only workspace admins can deactivate a channel.' });
    try {
        const { active } = req.body;
        if (typeof active !== 'boolean') return res.status(400).json({ error: 'bad_request', message: 'active must be boolean' });
        const channel = await Channel.findByPk(req.params.id);
        if (!channel) return res.status(404).json({ error: 'not_found' });
        channel.is_active = active;
        await channel.save();
        await logAudit(req.user, active ? 'channel.reactivated' : 'channel.deactivated', 'channel', channel.id, channel.name);
        res.json({ success: true, channel });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.get('/api/channels/:id/members', auth.requireAuth, async (req, res) => {
    try {
        if (!(await canViewChannel(req.user.id, req.params.id, req.user))) {
            return res.json([]);
        }
        const members = await ChannelMember.findAll({ where: { channelId: req.params.id } });
        const memberIds = members.map(m => m.userId);
        const users = memberIds.length ? await User.findAll({ where: { id: { [Op.in]: memberIds } } }) : [];
        res.json(users.map(u => {
            const member = members.find(m => m.userId === u.id);
            return { ...u.toJSON(), role: member ? member.role : 'member' };
        }));
    } catch (e) { res.json([]); }
});

app.post('/api/channels/:id/members', auth.requireAuth, async (req, res) => {
    try {
        // userId is the person being added; the adder is always the session user
        // (addedBy/adderName from the body were spoofable in the audit trail).
        const { userId, role } = req.body;
        if (!userId) return res.status(400).json({ error: 'bad_request', message: 'userId required' });

        const adder = await User.findByPk(req.user.id);
        if (!adder) return res.status(401).json({ error: 'unauthorized' });

        const me = await ChannelMember.findOne({ where: { channelId: req.params.id, userId: req.user.id } });
        if (!me) return res.status(403).json({ error: 'forbidden', message: 'Join the channel before adding others' });
        // Adding people is a channel-admin act, or a faculty-email person's
        // act — an ordinary student member cannot add others, mirroring the
        // same rule that gates channel creation.
        if (me.role !== 'admin' && !isGroupAdmin(req.user) && !isFacultyEmail(req.user.email)) {
            return res.status(403).json({ error: 'forbidden', message: 'Only channel admins or faculty can add members' });
        }
        // Granting admin is a channel-admin-only act; otherwise any member
        // (once past the check above) could escalate whoever they invite.
        if (role === 'admin' && me.role !== 'admin' && !isGroupAdmin(req.user)) {
            return res.status(403).json({ error: 'forbidden', message: 'Only channel admins can grant admin' });
        }

        const channel = await Channel.findByPk(req.params.id);
        // The person who created the channel is permanent admin — no one,
        // including another admin, can demote or remove them.
        if (channel && channel.created_by === userId && role !== undefined && role !== 'admin') {
            return res.status(403).json({ error: 'forbidden', message: "The channel creator can't be demoted" });
        }

        const [member, created] = await ChannelMember.findOrCreate({ where: { channelId: req.params.id, userId: userId }, defaults: { channelId: req.params.id, userId: userId, role: role || 'member' } });
        if (created) {
            if (channel) await channel.increment('member_count');
            const added = await User.findByPk(userId, { attributes: ['name'] });
            await Message.create({ channelId: req.params.id, senderId: adder.id, senderName: adder.name, body: `${adder.name} added ${added?.name || 'a member'}`, type: 'system', timestamp: Date.now() });
        } else if (role !== undefined && role !== member.role) {
            // Not a fresh add — this is a promote/demote of someone already
            // in the channel, which findOrCreate's `defaults` silently
            // ignores on an existing row.
            member.role = role;
            await member.save();
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.delete('/api/channels/:id/members/:userId', auth.requireAuth, async (req, res) => {
    try {
        // Removing someone else requires channel-admin rights; anyone may remove
        // themselves (leaving). Previously any caller could evict any member.
        const target = req.params.userId;
        if (target !== req.user.id) {
            const me = await ChannelMember.findOne({ where: { channelId: req.params.id, userId: req.user.id } });
            if (!me || me.role !== 'admin') {
                return res.status(403).json({ error: 'forbidden', message: 'Only channel admins can remove members' });
            }
        }
        // The channel creator can never be removed — not by another admin,
        // and not even by leaving themselves, so a channel is never left
        // with no one permanently responsible for it.
        const channel = await Channel.findByPk(req.params.id);
        if (channel && channel.created_by === target) {
            return res.status(403).json({ error: 'forbidden', message: "The channel creator can't be removed" });
        }
        const deleted = await ChannelMember.destroy({ where: { channelId: req.params.id, userId: target } });
        if (deleted) {
            if (channel) await channel.decrement('member_count');
            res.json({ success: true });
        } else { res.status(404).json({ error: 'Member not found' }); }
    } catch (e) { res.status(500).json(e); }
});

/**
 * "Add members through email, not just invite link" — sends the same
 * /join/:code link the share button produces, just via email instead of a
 * copy-paste. Clicking it lands on the join screen; if they aren't signed
 * in yet, both clients hold onto the code through sign-in and complete the
 * join right after (see App.jsx's ?join= effect / mobile's pendingJoinCode).
 */
app.post('/api/channels/:id/invite-email', auth.requireAuth, async (req, res) => {
    try {
        const email = String(req.body.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'bad_request', message: 'email required' });
        if (!isCampusEmail(email)) {
            return res.status(403).json({ error: 'forbidden', message: 'Only campus email addresses can be invited' });
        }
        if (!mailer) {
            console.error('[invite-email] SMTP is not configured — cannot send invites');
            return res.status(503).json({ error: 'not_configured' });
        }

        const channel = await Channel.findByPk(req.params.id);
        if (!channel) return res.status(404).json({ error: 'not_found' });

        const me = await ChannelMember.findOne({ where: { channelId: req.params.id, userId: req.user.id } });
        if ((!me || me.role !== 'admin') && !isGroupAdmin(req.user) && !isFacultyEmail(req.user.email)) {
            return res.status(403).json({ error: 'forbidden', message: 'Only channel admins or faculty can invite people' });
        }

        const joinUrl = `${process.env.APP_URL || 'https://cumess.cutm.ac.in'}/join/${channel.invite_code}`;
        const inviter = await User.findByPk(req.user.id);
        await logAudit(req.user, 'channel.invited_by_email', 'channel', channel.id, email);
        res.json({ success: true });

        mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: `${inviter?.name || 'Someone'} invited you to #${channel.name} on CU Orbit`,
            text: `${inviter?.name || 'Someone'} invited you to join #${channel.name} on CU Orbit.\n\nJoin here: ${joinUrl}\n\nIf you don't have a CU Orbit account yet, signing in with your campus Google account or email creates one automatically.`,
        }).catch((e) => console.error('[invite-email] send failed:', e.message));
    } catch (e) {
        console.error('[invite-email] failed:', e.message);
        res.status(500).json({ error: 'server_error' });
    }
});

/** Pending invite-link joins a channel admin (or superadmin) needs to act on. */
app.get('/api/channels/:id/join-requests', auth.requireAuth, async (req, res) => {
    try {
        const me = await ChannelMember.findOne({ where: { channelId: req.params.id, userId: req.user.id } });
        if (me?.role !== 'admin' && !isGroupAdmin(req.user)) {
            return res.status(403).json({ error: 'forbidden' });
        }
        const requests = await ChannelJoinRequest.findAll({ where: { channelId: req.params.id, status: 'pending' }, order: [['createdAt', 'ASC']] });
        res.json(requests);
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.post('/api/channels/:id/join-requests/:reqId/approve', auth.requireAuth, async (req, res) => {
    try {
        const me = await ChannelMember.findOne({ where: { channelId: req.params.id, userId: req.user.id } });
        if (me?.role !== 'admin' && !isGroupAdmin(req.user)) {
            return res.status(403).json({ error: 'forbidden' });
        }
        const request = await ChannelJoinRequest.findOne({ where: { id: req.params.reqId, channelId: req.params.id, status: 'pending' } });
        if (!request) return res.status(404).json({ error: 'not_found' });

        const channel = await Channel.findByPk(req.params.id);
        const [member, created] = await ChannelMember.findOrCreate({ where: { channelId: req.params.id, userId: request.userId }, defaults: { channelId: req.params.id, userId: request.userId, role: 'member' } });
        if (created) {
            if (channel) await channel.increment('member_count');
            await Message.create({ channelId: req.params.id, senderId: request.userId, senderName: request.userName || 'Someone', body: `${request.userName || 'Someone'} joined via invite link`, type: 'system', timestamp: Date.now() });
        }
        request.status = 'approved';
        await request.save();
        await logAudit(req.user, 'channel.join_approved', 'channel', req.params.id, request.userName);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.post('/api/channels/:id/join-requests/:reqId/reject', auth.requireAuth, async (req, res) => {
    try {
        const me = await ChannelMember.findOne({ where: { channelId: req.params.id, userId: req.user.id } });
        if (me?.role !== 'admin' && !isGroupAdmin(req.user)) {
            return res.status(403).json({ error: 'forbidden' });
        }
        const request = await ChannelJoinRequest.findOne({ where: { id: req.params.reqId, channelId: req.params.id, status: 'pending' } });
        if (!request) return res.status(404).json({ error: 'not_found' });
        request.status = 'rejected';
        await request.save();
        await logAudit(req.user, 'channel.join_rejected', 'channel', req.params.id, request.userName);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.post('/api/channels/join-by-link', auth.requireAuth, async (req, res) => {
    try {
        // Who's joining comes from the session, not the body — the previous
        // body-supplied userId meant anyone could add anyone to any channel
        // just by knowing their id.
        const userId = req.user.id;
        if (!isCampusEmail(req.user.email)) {
            return res.status(403).json({ error: 'forbidden', message: 'Only campus accounts can join channels' });
        }
        const { inviteCode } = req.body;
        const channel = await Channel.findOne({ where: { invite_code: inviteCode } });
        if (!channel) return res.status(404).json({ error: 'not_found', message: 'Invalid or expired invite link' });
        // Students always need an admin to let them in via invite link, even
        // when the channel itself hasn't turned approval_required on — that
        // toggle is for faculty-vs-faculty channels, not a way to accidentally
        // let a link admit students unchecked.
        const requiresApproval = channel.approval_required || req.user.role === 'student';
        if (requiresApproval) {
            const already = await ChannelMember.findOne({ where: { channelId: channel.id, userId } });
            if (already) return res.json({ success: true, channel });
            const user = await User.findByPk(userId);
            await ChannelJoinRequest.findOrCreate({
                where: { channelId: channel.id, userId, status: 'pending' },
                defaults: { channelId: channel.id, userId, userName: user?.name || 'Someone' },
            });
            return res.json({ success: true, pendingApproval: true, channel });
        }
        const [member, created] = await ChannelMember.findOrCreate({ where: { channelId: channel.id, userId: userId }, defaults: { channelId: channel.id, userId: userId, role: 'member' } });
        if (created) {
            await channel.increment('member_count');
            const user = await User.findByPk(userId);
            await Message.create({ channelId: channel.id, senderId: userId, senderName: user?.name || 'Someone', body: `${user?.name || 'Someone'} joined via invite link`, type: 'system', timestamp: Date.now() });
        }
        res.json({ success: true, channel });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/channels/:id/typing', auth.requireAuth, async (req, res) => {
    try {
        const typist = await User.findByPk(req.user.id);
        if (!typist) return res.status(401).json({ error: 'unauthorized' });
        await TypingStatus.upsert({ channelId: req.params.id, userId: typist.id, userName: typist.name, lastTypedAt: Date.now() });
        res.json({ success: true });
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/channels/:id/typing', auth.requireAuth, async (req, res) => {
    try {
        const fiveSecondsAgo = Date.now() - 5000;
        const typing = await TypingStatus.findAll({ where: { channelId: req.params.id, lastTypedAt: { [Op.gt]: fiveSecondsAgo } } });
        res.json(typing);
    } catch (e) { res.json([]); }
});

// "Upload files (unlimited / 50MB / 10MB)" — tiered by role.
const FILE_SIZE_LIMIT_MEMBER = 10 * 1024 * 1024;
const FILE_SIZE_LIMIT_CHANNEL_ADMIN = 50 * 1024 * 1024;

app.post('/api/upload', auth.requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');

    if (!isGroupAdmin(req.user)) {
        const isChannelAdminAnywhere = !!(await ChannelMember.findOne({ where: { userId: req.user.id, role: 'admin' } }));
        const limit = isChannelAdminAnywhere ? FILE_SIZE_LIMIT_CHANNEL_ADMIN : FILE_SIZE_LIMIT_MEMBER;
        if (req.file.size > limit) {
            fs.unlink(req.file.path, () => {});
            return res.status(413).json({ error: 'file_too_large', message: `Files are limited to ${Math.round(limit / (1024 * 1024))}MB for your account.` });
        }
    }

    // req.file.filename is the on-disk name (timestamp-prefixed to avoid
    // collisions) — originalname is what the sender actually called it, and
    // is what should be shown to and saved by the recipient.
    res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

// SPA FALLBACK — must stay last, after every route above, so it only catches
// paths no real route claimed. API 404s are left to Express.
//
// A direct hit or hard-refresh on a client-side route (e.g. /app/settings)
// isn't a real file, and express.static's index:false means it never
// auto-resolves to public/app/index.html on its own — without the /app
// check below this fell through to the LEGACY_INDEX branch instead, silently
// serving the old pre-React portal in place of the real app.
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.path.startsWith('/app')) {
        return res.sendFile(fs.existsSync(APP_INDEX) ? APP_INDEX : LEGACY_INDEX);
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3000;
const httpServer = require('http').createServer(app);

// Sockets share the HTTP server, so there is one port, one TLS termination and
// one set of CORS rules.
realtime.init(httpServer, {
    canAccess: canAccessContainer,
    onPresence: (userId, online) => {
        User.update(
            { presence: online ? 'online' : 'offline', last_seen_at: new Date() },
            { where: { id: userId } }
        ).catch(() => { /* presence is best-effort */ });
    },
});

httpServer.listen(PORT, '0.0.0.0', () => console.log(`🚀 CU Orbit Server ready on port ${PORT} (realtime enabled)`));
