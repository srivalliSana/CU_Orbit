const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// MYSQL CONNECTION
const dbConfig = {
    name: process.env.DB_NAME || 'cu_orbit',
    user: process.env.DB_USER || 'root',
    pass: process.env.DB_PASS || '@123456Valli',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306
};

console.log('--- Database Configuration ---');
console.log(`DB_NAME: ${dbConfig.name}`);
console.log(`DB_USER: ${dbConfig.user}`);
console.log(`DB_HOST: ${dbConfig.host}`);
console.log(`DB_PORT: ${dbConfig.port}`);
console.log(`DB_PASS: ${dbConfig.pass ? '********' + (process.env.DB_PASS ? ' (from .env)' : ' (using default)') : '(not set)'}`);
console.log('------------------------------');

const sequelize = new Sequelize(
    dbConfig.name,
    dbConfig.user,
    dbConfig.pass,
    {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: 'mysql',
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
);

// Test connection
sequelize.authenticate()
    .then(() => {
        console.log('✅ MySQL Connected Successfully');
        // Sync database after successful authentication
        return sequelize.sync({ alter: true });
    })
    .then(() => console.log('✅ Database Synced & Models Ready'))
    .catch(err => {
        console.error('❌ MySQL Initialization Error:');
        console.error('Message:', err.message);
        if (err.name === 'SequelizeAccessDeniedError') {
            console.error('👉 Tip: Check your DB_USER and DB_PASS in .env file.');
        }
    });

// Health check route
app.get('/api/health', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ 
            status: 'online', 
            database: 'connected',
            server_time: new Date().toISOString()
        });
    } catch (err) {
        res.status(503).json({ 
            status: 'online', 
            database: 'disconnected', 
            error: err.message 
        });
    }
});

// MODELS
const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    phone: { type: DataTypes.STRING, unique: true },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    department: DataTypes.STRING,
    status: { type: DataTypes.STRING, defaultValue: 'online' },
    avatarUrl: DataTypes.STRING
});

const Channel = sequelize.define('Channel', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: DataTypes.STRING,
    isPrivate: { type: DataTypes.BOOLEAN, defaultValue: false },
    description: DataTypes.TEXT
});

const ChannelMember = sequelize.define('ChannelMember', {
    channelId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.STRING, allowNull: false }
});

const Message = sequelize.define('Message', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    senderId: DataTypes.STRING,
    senderName: DataTypes.STRING,
    body: DataTypes.TEXT,
    channelId: DataTypes.STRING,
    parentMessageId: { type: DataTypes.UUID, allowNull: true }, // For threading
    type: { type: DataTypes.STRING, defaultValue: 'text' },
    mediaUrl: DataTypes.STRING,
    timestamp: { type: DataTypes.BIGINT, defaultValue: () => Date.now() }
});

const Reaction = sequelize.define('Reaction', {
    messageId: { type: DataTypes.UUID, allowNull: false }, // Must match Message.id type
    userId: { type: DataTypes.STRING, allowNull: false },
    userName: DataTypes.STRING,
    emoji: { type: DataTypes.STRING, allowNull: false }
});

const TypingStatus = sequelize.define('TypingStatus', {
    channelId: { type: DataTypes.STRING, primaryKey: true },
    userId: { type: DataTypes.STRING, primaryKey: true },
    userName: DataTypes.STRING,
    lastTypedAt: { type: DataTypes.BIGINT }
});

// Relationships
Message.hasMany(Reaction, { as: 'reactions', foreignKey: 'messageId' });
Reaction.belongsTo(Message, { foreignKey: 'messageId' });
Channel.hasMany(ChannelMember, { as: 'members', foreignKey: 'channelId' });
ChannelMember.belongsTo(Channel, { foreignKey: 'channelId' });

const Otp = sequelize.define('Otp', {
    phone: { type: DataTypes.STRING, primaryKey: true },
    otp: DataTypes.STRING,
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});


// AUTH ROUTES
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Use upsert behavior
        await Otp.upsert({ phone, otp });

        console.log(`[AUTH] OTP for ${phone}: ${otp}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;
        const record = await Otp.findOne({ where: { phone, otp } });

        if (record) {
            await Otp.destroy({ where: { phone } });
            const user = await User.findOne({ where: { phone } });
            res.json({ success: true, isNewUser: !user, user });
        } else {
            res.status(400).json({ success: false, message: "Invalid OTP" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const user = await User.create(req.body);
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// CHANNEL ROUTES
app.get('/api/channels', async (req, res) => {
    try {
        const channels = await Channel.findAll({
            include: [{ model: ChannelMember, as: 'members' }]
        });
        const channelsWithCount = channels.map(c => {
            const data = c.toJSON();
            return {
                ...data,
                memberCount: data.members ? data.members.length : 0
            };
        });
        res.json(channelsWithCount);
    } catch (err) {
        res.status(500).json(err);
    }
});

app.post('/api/channels/:id/members', async (req, res) => {
    try {
        const { userId } = req.body;
        await ChannelMember.create({ channelId: req.params.id, userId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json(err);
    }
});

app.post('/api/channels', async (req, res) => {
    try {
        const channel = await Channel.create(req.body);
        console.log(`[CHANNEL] Created: #${channel.name}`);
        res.json(channel);
    } catch (err) {
        res.status(500).json(err);
    }
});

// MESSAGE ROUTES
app.get('/api/channels/:channelId/messages', async (req, res) => {
    try {
        const messages = await Message.findAll({
            where: {
                channelId: req.params.channelId,
                parentMessageId: null // Only top-level messages
            },
            include: [{ model: Reaction, as: 'reactions' }],
            order: [['timestamp', 'ASC']]
        });

        // Count replies for each message
        const messagesWithCounts = await Promise.all(messages.map(async (msg) => {
            const replyCount = await Message.count({ where: { parentMessageId: msg.id } });
            return { ...msg.toJSON(), replyCount };
        }));

        res.json(messagesWithCounts);
    } catch (err) {
        res.status(500).json(err);
    }
});

app.get('/api/messages/:id/replies', async (req, res) => {
    try {
        const replies = await Message.findAll({
            where: { parentMessageId: req.params.id },
            include: [{ model: Reaction, as: 'reactions' }],
            order: [['timestamp', 'ASC']]
        });
        res.json(replies);
    } catch (err) {
        res.status(500).json(err);
    }
});

app.delete('/api/messages/:id', async (req, res) => {
    try {
        await Message.destroy({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json(err);
    }
});

app.put('/api/messages/:id', async (req, res) => {
    try {
        await Message.update({ body: req.body.body }, { where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json(err);
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { senderId, body, channelId, type, mediaUrl, parentMessageId } = req.body;
        const user = await User.findOne({ where: { phone: senderId } });
        const newMessage = await Message.create({
            senderId,
            senderName: user ? user.name : "Unknown",
            body,
            channelId,
            parentMessageId,
            type: type || 'text',
            mediaUrl: mediaUrl,
            timestamp: Date.now()
        });
        console.log(`[CHAT] ${newMessage.senderName} (${newMessage.type}): ${body || ''}`);
        res.json(newMessage);
    } catch (err) {
        res.status(500).json(err);
    }
});

// REACTION ROUTES
app.post('/api/messages/:id/react', async (req, res) => {
    try {
        const { userId, emoji, userName } = req.body;
        const [reaction, created] = await Reaction.findOrCreate({
            where: { messageId: req.params.id, userId, emoji },
            defaults: { userName }
        });
        if (!created) await reaction.destroy(); // Toggle reaction
        res.json({ success: true });
    } catch (err) {
        res.status(500).json(err);
    }
});

// TYPING STATUS ROUTES
app.post('/api/channels/:id/typing', async (req, res) => {
    try {
        const { userId, userName } = req.body;
        await TypingStatus.upsert({ channelId: req.params.id, userId, userName, lastTypedAt: Date.now() });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json(err);
    }
});

app.get('/api/channels/:id/typing', async (req, res) => {
    try {
        const fiveSecondsAgo = Date.now() - 5000;
        const typing = await TypingStatus.findAll({
            where: {
                channelId: req.params.id,
                lastTypedAt: { [Sequelize.Op.gt]: fiveSecondsAgo }
            }
        });
        res.json(typing);
    } catch (err) {
        res.status(500).json(err);
    }
});

// USER ROUTES
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.findAll();
        res.json(users);
    } catch (err) {
        res.status(500).json(err);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CU Orbit Server ready at https://cumessenger.thegttech.com`);
    console.log(`📡 MySQL migration complete.`);
});
