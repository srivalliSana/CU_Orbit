const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
require('dotenv').config();
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
app.get('/api/config', (req, res) => {
    res.json({ campus_url: CAMPUS_URL, connect_path: '/connect' });
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
    last_seen_at: { type: DataTypes.DATE, allowNull: true }
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
    approval_required: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const ChannelMember = sequelize.define('ChannelMember', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    channelId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('admin', 'member'), defaultValue: 'member' }
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
    type: { type: DataTypes.ENUM('text', 'image', 'voice', 'file', 'system'), defaultValue: 'text' },
    attachments: { type: DataTypes.JSON, defaultValue: [] },
    reactions: { type: DataTypes.JSON, defaultValue: [] },
    thread_reply_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_pinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING, defaultValue: 'sent' },
    timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() },
    edited_at: { type: DataTypes.DATE, allowNull: true }
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

        const users = await User.findAll();
        for (const u of users) {
            await ChannelMember.findOrCreate({
                where: { channelId: genChannel.id, userId: u.phone },
                defaults: { channelId: genChannel.id, userId: u.phone, role: 'member' }
            });
        }
    })
    .catch(err => console.warn('⚠️ MySQL Offline:', err.message));

// --- NOTIFICATION ROUTER SIMULATION ---
async function routeMentionNotification(user, message) {
    console.log(`\n--- 🔔 MENTION NOTIFICATION ---`);
    console.log(`TO: ${user.name} (${user.phone})`);
    console.log(`BODY: @${message.senderName} mentioned you in a message!`);
    console.log(`MESSAGE: "${message.body}"`);
    console.log(`-------------------------------\n`);
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
        let release = null;
        try {
            release = await Release.findOne({ where: { version: req.query.v } });
        } catch (e) {
            console.error('Landing page: could not look up release —', e.message);
        }
        release = release || history[0];
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
                    <button onclick="showHistory()" class="btn-shine bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold py-5 px-8 rounded-2xl flex items-center justify-center space-x-4 transition-all shadow-lg shadow-blue-500/20 group">
                        <i class="fa-brands fa-android text-3xl group-hover:scale-110 transition-transform"></i>
                        <div class="text-left">
                            <div class="text-[10px] uppercase opacity-70">Download for</div>
                            <div class="text-lg leading-none">Android APK</div>
                        </div>
                    </button>

                    <button onclick="alert('iOS App is currently in development. Registration will open soon!')" class="bg-slate-800/50 hover:bg-slate-800 text-slate-300 font-bold py-5 px-8 rounded-2xl flex items-center justify-center space-x-4 transition-all border border-slate-700/50 group">
                        <i class="fa-brands fa-apple text-3xl group-hover:scale-110 transition-transform"></i>
                        <div class="text-left">
                            <div class="text-[10px] uppercase opacity-50">Coming Soon</div>
                            <div class="text-lg leading-none">iOS Mobile</div>
                        </div>
                    </button>
                </div>

                <div class="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8 mb-10">
                    <a href="/portal" class="text-blue-400 hover:text-blue-300 font-bold flex items-center group">
                        <span>Continue in Web Portal</span>
                        <i class="fa-solid fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>
                    </a>
                    <button onclick="showHistory()" class="text-slate-500 hover:text-white text-sm font-medium transition-colors">
                        View Version History
                    </button>
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

            <!-- Version History Modal -->
            <div id="history-modal" class="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-50 hidden opacity-0 transition-opacity duration-300">
                <div class="bg-[#1e293b] w-full max-w-lg rounded-[2.5rem] p-10 border border-slate-700 shadow-2xl relative">
                    <button onclick="hideHistory()" class="absolute top-6 right-6 w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors">
                        <i class="fa-solid fa-times text-slate-400"></i>
                    </button>

                    <h2 class="text-3xl font-bold text-white mb-2">Build Library</h2>
                    <p class="text-slate-500 text-sm mb-8">Access historical versions of the Orbit client.</p>

                    <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        ${history.map(r => `
                            <div class="flex items-center justify-between p-5 bg-slate-900/50 rounded-2xl border border-slate-800 hover:border-blue-500/30 transition-all group">
                                <div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-lg font-bold text-white">v${r.version}</span>
                                        <span class="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase">Build ${r.build_number}</span>
                                    </div>
                                    <div class="text-xs text-slate-500 mt-1">${new Date(r.release_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                                </div>
                                <a href="/?download=true&v=${r.version}" class="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-slate-900 hover:scale-110 transition-transform">
                                    <i class="fa-solid fa-download"></i>
                                </a>
                            </div>
                        `).join('')}
                        ${history.length === 0 ? '<div class="text-center py-10 opacity-30"><i class="fa-solid fa-box-open text-5xl mb-4"></i><p>No releases cataloged yet.</p></div>' : ''}
                    </div>
                </div>
            </div>

            <script>
                function showHistory() {
                    const m = document.getElementById('history-modal');
                    m.classList.remove('hidden');
                    setTimeout(() => m.classList.add('opacity-100'), 10);
                }
                function hideHistory() {
                    const m = document.getElementById('history-modal');
                    m.classList.remove('opacity-100');
                    setTimeout(() => m.classList.add('hidden'), 300);
                }
            </script>
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

// --- PEOPLE DIRECTORY (CampusOne-backed) ---

/**
 * Search people.
 *
 * CampusOne is the authority for who exists and for their name, role and
 * department. CU Orbit rows are never a source of contacts — they only enrich a
 * directory entry with app-specific state (id, avatar, presence, last seen).
 *
 * That means someone removed from the campus directory stops being findable
 * here even if they still have an Orbit account, which is the intended
 * behaviour: one place governs the roll.
 */
app.get('/api/directory/search', auth.requireAuth, async (req, res) => {
    try {
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
 * Open a DM with someone from the directory, creating their Orbit account if
 * this is the first time anyone has messaged them. Their real profile is filled
 * in when they first sign in.
 */
app.post('/api/directory/dm', auth.requireAuth, async (req, res) => {
    try {
        const email = String(req.body.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'bad_request', message: 'email required' });
        if (email === (req.user.email || '').toLowerCase()) {
            return res.status(400).json({ error: 'bad_request', message: 'Cannot message yourself' });
        }

        let user = await User.findOne({ where: { campus_email: email } });
        if (!user) {
            // Only people CampusOne knows about — this must not become a way to
            // create arbitrary accounts.
            const entry = (await campus.searchDirectory(email, 5))
                .find((p) => (p.email || '').toLowerCase() === email);
            if (!entry) return res.status(404).json({ error: 'not_found', message: 'Not in the campus directory' });

            const base = (entry.name || email.split('@')[0]).toLowerCase().replace(/\s+/g, '_');
            user = await User.create({
                campus_email: email,
                email,
                name: entry.name || email.split('@')[0],
                role: ROLES.includes(entry.role) ? entry.role : 'student',
                cohort: entry.cohort || null,
                campus: entry.campus || null,
                handle: `${base}_${crypto.randomBytes(2).toString('hex')}`,
                presence: 'offline',
            });
        }

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
        if (!(await canAccessContainer(req.user.id, containerId))) {
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
        if (!(await canAccessContainer(req.user.id, containerId))) {
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

/** Unread total for the signed-in user — drives the CampusOne menu badge. */
app.get('/api/unread', auth.requireAuth, async (req, res) => {
    try {
        const memberships = await ChannelMember.findAll({ where: { userId: req.user.id } });
        const channelIds = memberships.map((m) => m.channelId);

        const channelUnread = channelIds.length
            ? await Message.count({
                where: {
                    channelId: { [Op.in]: channelIds },
                    senderId: { [Op.ne]: req.user.id },
                    status: { [Op.ne]: 'read' },
                },
            })
            : 0;

        // DM rooms are "<uuid>_<uuid>", so ours are the ones containing our id.
        const dmUnread = await Message.count({
            where: {
                dm_id: { [Op.like]: `%${req.user.id}%` },
                senderId: { [Op.ne]: req.user.id },
                status: { [Op.ne]: 'read' },
            },
        });

        res.json({ total: channelUnread + dmUnread, channels: channelUnread, dms: dmUnread });
    } catch (e) {
        res.json({ total: 0, channels: 0, dms: 0 });
    }
});

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
async function canAccessContainer(userId, containerId) {
    if (!containerId) return false;
    if (containerId.includes('_')) return containerId.split('_').includes(userId);
    return !!(await ChannelMember.findOne({ where: { channelId: containerId, userId } }));
}

app.post('/api/auth/sso', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'bad_request', message: 'token required' });

        let claims;
        try {
            claims = auth.verifyHandoff(token);
        } catch (e) {
            console.warn('[sso] rejected handoff token:', e.message);
            return res.status(401).json({ error: 'invalid_token', message: e.message });
        }

        const campusEmail = String(claims.email).toLowerCase();
        const role = ROLES.includes(claims.role) ? claims.role : 'student';

        // Find by campus link first; fall back to a legacy row matched on email
        // so pre-SSO accounts adopt their CampusOne identity instead of forking.
        let user = await User.findOne({ where: { campus_email: campusEmail } });
        if (!user) user = await User.findOne({ where: { email: campusEmail } });

        if (user) {
            user.campus_email = campusEmail;
            user.name = claims.name || user.name;
            user.role = role;
            if (claims.cohort) user.cohort = claims.cohort;
            if (claims.campus) user.campus = claims.campus;
            await user.save();
        } else {
            const base = (claims.name || campusEmail.split('@')[0]).toLowerCase().replace(/\s+/g, '_');
            user = await User.create({
                campus_email: campusEmail,
                email: campusEmail,
                name: claims.name || campusEmail.split('@')[0],
                role,
                cohort: claims.cohort || null,
                campus: claims.campus || null,
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

        res.json({ success: true, session: auth.issueSession(user), user });
    } catch (e) {
        console.error('[sso] exchange failed:', e.message);
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
                    where: { channelId: gen.id, userId: user.phone },
                    defaults: { role: 'member' }
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
        const channels = await Channel.findAll({ where: { workspace_id: workspaceId, id: { [Op.in]: channelIds } } });
        const channelsData = await Promise.all(channels.map(async (ch) => {
            const pref = await ConversationPref.findOne({ where: { userId, containerId: ch.id } });
            if (pref && pref.isHidden) return null;
            const lastMsg = await Message.findOne({ where: { channelId: ch.id }, order: [['timestamp', 'DESC']] });
            const unreadCount = await Message.count({ where: { channelId: ch.id, senderId: { [Op.ne]: userId }, status: { [Op.ne]: 'read' } } });
            const hasUnreadMention = await Mention.count({ where: { mentioned_user_id: userId, source_channel_id: ch.id, is_read: false } }) > 0;
            return {
                ...ch.get({ plain: true }),
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
        // Identity is the UUID now. The previous filter compared phone to a user
        // id and, because SQL drops NULLs from a != comparison, returned nobody
        // once accounts arrived via SSO without a phone number.
        const users = await User.findAll({ where: { id: { [Op.ne]: userId } } });
        const dms = await Promise.all(users.map(async (u) => {
            const dmId = [userId, u.id].sort().join('_');
            const pref = await ConversationPref.findOne({ where: { userId, containerId: dmId } });
            const lastMsg = await Message.findOne({ where: { dm_id: dmId }, order: [['timestamp', 'DESC']] });
            if (pref && pref.isHidden && !lastMsg) return null;
            if (pref && pref.isHidden && lastMsg && lastMsg.timestamp < pref.updatedAt) return null;
            const hasUnreadMention = await Mention.count({ where: { mentioned_user_id: userId, source_channel_id: dmId, is_read: false } }) > 0;
            return {
                id: dmId,
                other_user_id: u.id,
                other_user_name: u.name,
                other_user_avatar_url: u.avatarUrl,
                presence: u.presence,
                is_pinned: pref ? pref.isPinned : false,
                is_muted: pref ? pref.isMuted : false,
                unread_count: await Message.count({ where: { dm_id: dmId, senderId: { [Op.ne]: userId }, status: { [Op.ne]: 'read' } } }),
                has_unread_mention: hasUnreadMention,
                last_message_preview: lastMsg ? {
                    sender_is_self: lastMsg.senderId === userId,
                    text: lastMsg.body || "",
                    sent_at: lastMsg.timestamp,
                    type: lastMsg.type
                } : null
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
app.get('/api/messages/:containerId', auth.requireAuth, async (req, res) => {
    try {
        const { containerId } = req.params;
        if (!(await canAccessContainer(req.user.id, containerId))) {
            return res.status(403).json({ error: 'forbidden', message: 'Not a participant in this conversation' });
        }
        const messages = await Message.findAll({
            where: { [Op.or]: [{ channelId: containerId }, { dm_id: containerId }] },
            order: [['timestamp', 'ASC']],
            include: [{
                model: Mention,
                as: 'mentions',
                include: [{ model: User, as: 'user', attributes: ['id', 'name', 'handle'] }]
            }]
        });
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
            attachments: m.attachments || [],
            reactions: m.reactions || [],
            status: m.status,
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

app.post('/api/messages', auth.requireAuth, async (req, res) => {
    try {
        const { body, channelId, type, mediaUrl, mentions, enrichedMentions } = req.body;

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
             if (ch && ch.restricted_messaging) {
                 const member = await ChannelMember.findOne({ where: { channelId, userId: senderId } });
                 if (member && member.role !== 'admin') {
                     return res.status(403).json({ error: 'Only admins can send messages' });
                 }
             }
        }
        const msg = await Message.create({
            senderId, senderName, body, channelId, type: type || 'text',
            senderAvatarUrl, dm_id: (channelId && channelId.includes('_')) ? channelId : null,
            attachments: mediaUrl ? [{ type: type, url: mediaUrl }] : []
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
        if (body && (body.toLowerCase().includes('@all') || body.toLowerCase().includes('@everyone'))) {
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
        const { body, status } = req.body;
        const msg = await Message.findByPk(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        // Editing content is the author's alone.
        if (body !== undefined) {
            if (msg.senderId !== req.user.id) {
                return res.status(403).json({ error: 'forbidden', message: 'Only the author can edit a message' });
            }
            msg.body = body;
            msg.edited_at = new Date();
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

        await msg.save();
        res.json(msg);
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/mentions/:userId', auth.requireAuth, async (req, res) => {
    try {
        // :userId ignored — your mentions are yours.
        const mentions = await Mention.findAll({ where: { mentioned_user_id: req.user.id }, order: [['createdAt', 'DESC']] });
        const results = await Promise.all(mentions.map(async (m) => {
            const msg = await Message.findByPk(m.message_id);
            if (!msg) return null;
            let sourceName = 'Channel';
            if (m.source_channel_id.includes('_')) sourceName = 'Direct Message';
            else {
                const ch = await Channel.findByPk(m.source_channel_id);
                if (ch) sourceName = `#${ch.name}`;
            }
            return {
                id: m.id, message_id: m.message_id, sender_id: msg.senderId, sender_name: msg.senderName,
                text: msg.body, sent_at: msg.timestamp, channel_id: m.source_channel_id, channel_name: sourceName, is_read: m.is_read
            };
        }));
        res.json(results.filter(r => r !== null));
    } catch (e) { res.status(500).json(e); }
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
        // name comes from CampusOne for linked accounts and must not drift.
        if (name && !user.campus_email) user.name = name;
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

// Who may create groups. Students are excluded by default; override with
// GROUP_CREATE_ROLES if that policy changes.
const GROUP_CREATE_ROLES = (process.env.GROUP_CREATE_ROLES || 'faculty,admin,examcell,coordinator')
    .split(',').map((s) => s.trim()).filter(Boolean);

app.post('/api/workspaces/:workspaceId/channels', auth.requireAuth, async (req, res) => {
    try {
        if (!GROUP_CREATE_ROLES.includes(req.user.role)) {
            return res.status(403).json({
                error: 'forbidden',
                message: 'Only faculty and staff can create groups.',
            });
        }
        const { name, type, description, members } = req.body;

        const clean = String(name || '').trim().replace(/^#/, '');
        if (!clean) return res.status(400).json({ error: 'bad_request', message: 'Group name is required' });
        if (clean.length > 80) return res.status(400).json({ error: 'bad_request', message: 'Group name is too long' });

        const workspaceId = await resolveWorkspaceId(req.params.workspaceId);
        if (!workspaceId) return res.status(404).json({ error: 'not_found', message: 'No workspace' });

        // Creator comes from the session — a body-supplied userId let anyone
        // create a group owned by someone else.
        const creator = req.user.id;

        const channel = await Channel.create({
            workspace_id: workspaceId, name: clean, type: type === 'private' ? 'private' : 'public',
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
    try { const ch = await Channel.findByPk(req.params.id); res.json(ch); } catch (e) { res.status(500).json(e); }
});

app.put('/api/channels/:id', auth.requireAuth, async (req, res) => {
    try {
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

app.get('/api/channels/:id/members', auth.requireAuth, async (req, res) => {
    try {
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
        // Granting admin is an admin-only act; otherwise any member could escalate.
        if (role === 'admin' && me.role !== 'admin') {
            return res.status(403).json({ error: 'forbidden', message: 'Only channel admins can grant admin' });
        }

        const [member, created] = await ChannelMember.findOrCreate({ where: { channelId: req.params.id, userId: userId }, defaults: { channelId: req.params.id, userId: userId, role: role || 'member' } });
        if (created) {
            const channel = await Channel.findByPk(req.params.id);
            if (channel) await channel.increment('member_count');
            await Message.create({ channelId: req.params.id, senderId: adder.id, senderName: adder.name, body: `ADD_MEMBER:${userId}`, type: 'system', timestamp: Date.now() });
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
        const deleted = await ChannelMember.destroy({ where: { channelId: req.params.id, userId: target } });
        if (deleted) {
            const channel = await Channel.findByPk(req.params.id);
            if (channel) await channel.decrement('member_count');
            res.json({ success: true });
        } else { res.status(404).json({ error: 'Member not found' }); }
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/channels/join-by-link', auth.requireAuth, async (req, res) => {
    try {
        const { inviteCode, userId } = req.body;
        const channel = await Channel.findOne({ where: { invite_code: inviteCode } });
        if (!channel) return res.status(404).json({ error: 'Invalid link' });
        if (channel.approval_required) { return res.json({ success: true, pendingApproval: true }); }
        const [member, created] = await ChannelMember.findOrCreate({ where: { channelId: channel.id, userId: userId }, defaults: { channelId: channel.id, userId: userId, role: 'member' } });
        if (created) {
            await channel.increment('member_count');
            await Message.create({ channelId: channel.id, senderId: userId, senderName: 'System', body: `JOIN_LINK:${userId}`, type: 'system', timestamp: Date.now() });
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

app.post('/api/upload', auth.requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    res.json({ url: `/uploads/${req.file.filename}` });
});

// SPA FALLBACK — must stay last, after every route above, so it only catches
// paths no real route claimed. API 404s are left to Express.
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
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
