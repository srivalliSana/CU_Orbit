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
    presence: { type: DataTypes.ENUM('online', 'away', 'dnd', 'offline'), defaultValue: 'online' }
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
Mention.belongsTo(User, { foreignKey: 'mentioned_user_id', targetKey: 'phone', as: 'user' });

// SYNC
sequelize.authenticate()
    .then(async () => {
        await sequelize.sync({ alter: true });
        console.log('✅ MySQL Connected & Schema Synced');

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
        const apkPath = path.join(__dirname, 'downloads', release ? release.filename : 'cu_orbit.apk');
        return res.download(apkPath, release ? release.filename : 'CU_Orbit.apk');
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
app.post('/api/system/register-release', async (req, res) => {
    try {
        const { version, build_number, filename } = req.body;
        const release = await Release.create({ version, build_number, filename });
        res.json({ success: true, release });
    } catch (e) { res.status(500).json(e); }
});

// Web Portal Route
app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
const ROLES = ['student', 'faculty', 'admin', 'examcell', 'coordinator'];

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
        const { workspaceId } = req.params;
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
                    sender_is_self: normalizePhone(lastMsg.senderId) === normalizePhone(userId)
                } : null,
                unread_count: unreadCount,
                has_unread_mention: hasUnreadMention
            };
        }));
        const users = await User.findAll({ where: { phone: { [Op.ne]: userId } } });
        const dms = await Promise.all(users.map(async (u) => {
            const dmId = userId < u.phone ? `${userId}_${u.phone}` : `${u.phone}_${userId}`;
            const pref = await ConversationPref.findOne({ where: { userId, containerId: dmId } });
            const lastMsg = await Message.findOne({ where: { dm_id: dmId }, order: [['timestamp', 'DESC']] });
            if (pref && pref.isHidden && !lastMsg) return null;
            if (pref && pref.isHidden && lastMsg && lastMsg.timestamp < pref.updatedAt) return null;
            const hasUnreadMention = await Mention.count({ where: { mentioned_user_id: userId, source_channel_id: dmId, is_read: false } }) > 0;
            return {
                id: dmId,
                other_user_id: u.phone,
                other_user_name: u.name,
                other_user_avatar_url: u.avatarUrl,
                presence: u.presence,
                is_pinned: pref ? pref.isPinned : false,
                is_muted: pref ? pref.isMuted : false,
                unread_count: await Message.count({ where: { dm_id: dmId, senderId: { [Op.ne]: userId }, status: { [Op.ne]: 'read' } } }),
                has_unread_mention: hasUnreadMention,
                last_message_preview: lastMsg ? {
                    sender_is_self: normalizePhone(lastMsg.senderId) === normalizePhone(userId),
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
                include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone'] }]
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
        const mentionedIds = new Set();
        if (enrichedMentions && Array.isArray(enrichedMentions)) {
            for (const mData of enrichedMentions) { mentionedIds.add(mData.phone); }
        }
        if (body && (body.toLowerCase().includes('@all') || body.toLowerCase().includes('@everyone'))) {
            const members = await ChannelMember.findAll({ where: { channelId: channelId } });
            for (const member of members) {
                if (normalizePhone(member.userId) !== normalizePhone(senderId)) { mentionedIds.add(member.userId); }
            }
        }
        if (mentionedIds.size === 0 && body && body.includes('@')) {
            const members = await ChannelMember.findAll({ where: { channelId } });
            for (const m of members) {
                if (normalizePhone(m.userId) === normalizePhone(senderId)) continue;
                const user = await User.findOne({ where: { phone: m.userId } });
                if (user && body.toLowerCase().includes(`@${user.name.toLowerCase()}`)) { mentionedIds.add(user.phone); }
                else if (user && user.handle && body.toLowerCase().includes(`@${user.handle.toLowerCase()}`)) { mentionedIds.add(user.phone); }
            }
        }
        for (const uid of mentionedIds) {
            await Mention.findOrCreate({
                where: { message_id: msg.id, mentioned_user_id: uid },
                defaults: { source_channel_id: channelId, is_read: false }
            });
            const user = await User.findOne({ where: { phone: uid } });
            if (user) routeMentionNotification(user, msg);
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

app.post('/api/workspaces/:workspaceId/channels', auth.requireAuth, async (req, res) => {
    try {
        const { name, type, userId, description } = req.body;
        const channel = await Channel.create({
            workspace_id: req.params.workspaceId, name, type: type || 'public',
            topic: description || '', invite_code: crypto.randomBytes(4).toString('hex'), created_by: userId
        });
        if (userId) await ChannelMember.create({ channelId: channel.id, userId: userId, role: 'admin' });
        res.json(channel);
    } catch (e) { console.error(e); res.status(500).json(e); }
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
        const userPhones = members.map(m => m.userId);
        const users = await User.findAll({ where: { phone: { [Op.in]: userPhones } } });
        res.json(users.map(u => {
            const member = members.find(m => m.userId === u.phone);
            return { ...u.toJSON(), role: member.role };
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
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 CU Orbit Server ready on port ${PORT}`));
