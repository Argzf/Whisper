require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const multer = require('multer');
const setupAdmin = require('./admin');
const roomsModule = require('./rooms'); // <-- new

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to build absolute URL from request
function getAbsoluteUrl(req, relativePath) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}${relativePath}`;
}

// File upload
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const randomName = crypto.randomUUID() + ext;
        cb(null, randomName);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use('/uploads', express.static(uploadsDir, { maxAge: '12d', etag: true, lastModified: true }));

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const relativePath = `/uploads/${req.file.filename}`;
    const absoluteUrl = getAbsoluteUrl(req, relativePath);
    res.json({ url: absoluteUrl, name: req.file.originalname, type: req.file.mimetype });
});

// Session for admin
app.use(session({
    secret: crypto.randomUUID(),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 30 * 60 * 1000 }
}));

// Webhooks
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK_URL) {
    console.error('❌ Missing DISCORD_WEBHOOK_URL in .env');
    process.exit(1);
}
const LOG_WEBHOOK_URL = process.env.WH_LOG_WEBHOOK_URL;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;

// Storage files for taken names and user mappings
const TAKEN_NAMES_FILE = path.join(__dirname, 'takenNames.json');
const USER_MAPPINGS_FILE = path.join(__dirname, 'userMappings.json');

if (!fs.existsSync(TAKEN_NAMES_FILE)) fs.writeFileSync(TAKEN_NAMES_FILE, '[]');
if (!fs.existsSync(USER_MAPPINGS_FILE)) fs.writeFileSync(USER_MAPPINGS_FILE, '{}');

let takenNames = new Set();
let userMappings = {};

function loadData() {
    try {
        const takenRaw = fs.readFileSync(TAKEN_NAMES_FILE, 'utf8');
        takenNames = new Set(JSON.parse(takenRaw.trim() || '[]'));
        const mappingRaw = fs.readFileSync(USER_MAPPINGS_FILE, 'utf8');
        userMappings = JSON.parse(mappingRaw.trim() || '{}');
        console.log(`✅ Loaded ${takenNames.size} taken names, ${Object.keys(userMappings).length} user mappings`);
    } catch (e) {
        console.error('Failed to load data – using empty defaults:', e.message);
        takenNames = new Set();
        userMappings = {};
    }
}
function saveTakenNames() { fs.writeFileSync(TAKEN_NAMES_FILE, JSON.stringify([...takenNames], null, 2)); }
function saveUserMappings() { fs.writeFileSync(USER_MAPPINGS_FILE, JSON.stringify(userMappings, null, 2)); }
loadData();

const adjectives = ['Charming', 'Nagging', 'Shy', 'Scared', 'Celebrated', 'Cherished', 'Amazed', 'Foolish', 'Happy', 'Sleepy', 'Curious', 'Clever', 'Quiet', 'Bright', 'Witty', 'Calm', 'Bold', 'Swift', 'Drunk', 'High', 'Depressed'];
const nouns = ['Panda', 'Fox', 'Owl', 'Cat', 'Wolf', 'Koala', 'Raven', 'Falcon', 'Deer', 'Hedgehog', 'Grizzly', 'Bear', 'Cow', 'Lego', 'Brick'];
const avatars = [
    'https://randomuser.me/api/portraits/lego/1.jpg',
    'https://randomuser.me/api/portraits/lego/2.jpg',
    'https://randomuser.me/api/portraits/lego/3.jpg',
    'https://randomuser.me/api/portraits/lego/4.jpg',
    'https://randomuser.me/api/portraits/lego/5.jpg',
    'https://randomuser.me/api/portraits/lego/6.jpg',
    'https://randomuser.me/api/portraits/lego/7.jpg',
    'https://t4.ftcdn.net/jpg/17/72/67/87/360_F_1772678733_B6CuuItBOiO9MevAMUmZ61lnDTYBSrX2.jpg',
    'https://bricksandminifigsontario.com/cdn/shop/files/3277d61acol27-7_20Longboarder_2C_20Series_2027_300x300.png?v=1736393249',
    'https://www.lapetitebrique.com/63-thickbox_default/lego-minifigures-8683-series-1-skater.jpg',
    'https://www.lapetitebrique.com/918-large_default/lego-minifig-minifigures-series-4-street-skater-.jpg',
    'https://www.templeofbricks.com/img/minifigs/lego-city/minifig-lego-city-cty0461.png',
    'https://imgcdn.stablediffusionweb.com/2026/4/10/92ab0b22-2fd6-4a53-a837-58cbd94c3c9f.webp',
    'https://imgcdn.stablediffusionweb.com/2026/4/10/4eba37be-d3d0-4ac7-aa10-eadf628fe652.webp',
    'https://thumbs.dreamstime.com/b/portrait-de-minifigure-d-homme-lego-contre-la-semelle-grise-tambov-f%C3%A9d%C3%A9ration-russie-octobre-photo-studio-167467396.jpg',
    'https://us.123rf.com/450wm/rosinka79/rosinka792001/rosinka79200100029/140652255-tambov-russian-federation-october-19-2019-portrait-of-lego-businessman-minifigure-with-lego-gray.jpg?ver=6',
    'https://us.123rf.com/450wm/rosinka79/rosinka791812/rosinka79181200028/133173131-tambov-russian-federation-july-29-2018-portrait-of-lego-businessman-minifigure-against-gray.jpg?ver=6',
    'https://i0.wp.com/nichicustoms.com/wp-content/uploads/2025/03/IMG_0011.jpg?fit=971%2C805&ssl=1',
    'https://t3.ftcdn.net/jpg/06/87/65/98/360_F_687659829_Du0AQxNAg0DzB9PSZyN0ZvtRKSdaZeD0.jpg',
    'https://i.guim.co.uk/img/static/sys-images/Guardian/Pix/pictures/2013/6/12/1371044563298/Lego-pirate-010.jpg?width=445&dpr=1&s=none&crop=none',
    'https://us1.discourse-cdn.com/openai1/original/4X/e/3/8/e38edc097fa19d5f6426d8d0f411b38eddeb6da7.webp',
    'https://randomuser.me/api/portraits/lego/8.jpg'
];

function generateUniqueName() {
    for (let i = 0; i < 100; i++) {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const name = `${adj} ${noun}`;
        if (!takenNames.has(name)) {
            takenNames.add(name);
            saveTakenNames();
            return name;
        }
    }
    let counter = 1;
    while (true) {
        const name = `User ${counter++}`;
        if (!takenNames.has(name)) {
            takenNames.add(name);
            saveTakenNames();
            return name;
        }
    }
}

function getRandomAvatar() { return avatars[Math.floor(Math.random() * avatars.length)]; }

function getClientIP(socket) {
    const req = socket.request;
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return socket.handshake.address;
}

// Discord send for chat messages (embed with absolute URLs)
async function sendToDiscord(name, avatar, text, ip, file = null, roomName = null) {
    if (!WEBHOOK_URL) return;
    const embed = {
        author: { name, icon_url: avatar },
        timestamp: new Date().toISOString(),
        color: 0x5865F2
    };
    let description = text || '';
    if (file) {
        if (file.type && file.type.startsWith('image/')) {
            embed.image = { url: file.url };
            description += description ? `\n\n[🖼️ View full size](${file.url})` : `[🖼️ View full size](${file.url})`;
        } else {
            description += description ? `\n\n📎 [${file.name}](${file.url})` : `📎 [${file.name}](${file.url})`;
        }
    }
    if (!description.trim()) description = '*sent a file*';
    embed.description = description;
    if (roomName) embed.footer = { text: `Room: ${roomName}` };

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        if (!response.ok) console.error(`Discord webhook returned ${response.status}`);
        else console.log(`📨 Discord embed sent for ${name}${roomName ? ` in ${roomName}` : ''}`);
    } catch (err) { console.error('Discord webhook failed:', err.message); }
}

// Room join/leave log
async function sendRoomLog(action, roomName, userName, ip) {
    if (!LOG_WEBHOOK_URL) return;
    const embed = {
        title: action === 'join' ? '🚪 User joined room' : '👋 User left room',
        color: action === 'join' ? 0x22c55e : 0xef4444,
        fields: [
            { name: 'Room', value: roomName, inline: true },
            { name: 'User', value: userName, inline: true },
            { name: 'IP Address', value: ip, inline: false },
            { name: 'Timestamp', value: new Date().toISOString(), inline: false }
        ],
        footer: { text: 'Whisper Room' }
    };
    try {
        await fetch(LOG_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        console.log(`📢 Room ${action} log sent for ${userName}`);
    } catch (err) { console.error('Room log failed', err); }
}

// Join log (main chat)
async function sendJoinLog(name, avatar, userId, ip) {
    if (!LOG_WEBHOOK_URL) return;
    const embed = {
        title: '🚪 User joined the chat',
        color: 0x5865F2,
        thumbnail: { url: avatar },
        fields: [
            { name: 'Username', value: name, inline: true },
            { name: 'User ID', value: `\`${userId}\``, inline: false },
            { name: 'IP Address', value: `[${ip}](https://whatismyipaddress.com/ip/${ip})`, inline: false },
            { name: 'Avatar URL', value: `[link](${avatar})`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Whisper Room' }
    };
    try {
        await fetch(LOG_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) });
        console.log(`📢 Join log sent for ${name}`);
    } catch (err) { console.error('Join log failed', err); }
}

let messages = []; // main chat
let userSocketMap = new Map();

io.on('connection', (socket) => {
    console.log('🔌 New connection');
    socket.on('identify', (storedUserId, callback) => {
        const clientIP = getClientIP(socket);
        let userId = storedUserId, name, avatar;
        if (storedUserId && userMappings[storedUserId]) {
            const identity = userMappings[storedUserId];
            name = identity.name;
            avatar = identity.avatar;
            userId = storedUserId;
        } else {
            userId = crypto.randomUUID();
            name = generateUniqueName();
            avatar = getRandomAvatar();
            userMappings[userId] = { name, avatar };
            saveUserMappings();
        }
        socket.userIdentity = { name, avatar, userId };
        userSocketMap.set(socket.id, userId);
        callback({ userId, name, avatar });
        sendJoinLog(name, avatar, userId, clientIP);
    });

    // Main chat (original)
    socket.on('load history', () => {
        socket.emit('load messages', messages);
    });

    socket.on('chat message', async (data) => {
        if (!socket.userIdentity) return;
        const { name, avatar } = socket.userIdentity;
        const clientIP = getClientIP(socket);
        const msg = {
            id: crypto.randomUUID(),
            text: data.text || '',
            timestamp: new Date().toISOString(),
            senderName: name,
            senderAvatar: avatar,
            file: data.file || null
        };
        messages.push(msg);
        if (messages.length > 500) messages.shift();
        io.emit('chat message', msg);
        await sendToDiscord(name, avatar, msg.text, clientIP, msg.file);
    });

    // ---- Room system ----
    socket.on('join room', async (roomName, password, callback) => {
        if (!roomsModule.roomExists(roomName)) {
            callback({ success: false, error: 'Room does not exist' });
            return;
        }
        const isValid = roomsModule.verifyRoomPassword(roomName, password);
        if (!isValid) {
            callback({ success: false, error: 'Invalid room password' });
            return;
        }
        // Leave previous rooms
        const previousRooms = Array.from(socket.rooms);
        previousRooms.forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });
        socket.join(roomName);
        socket.currentRoom = roomName;
        const roomMessages = roomsModule.getRoomMessages(roomName);
        callback({ success: true, messages: roomMessages });
        const name = socket.userIdentity?.name || 'Anonymous';
        const ip = getClientIP(socket);
        await sendRoomLog('join', roomName, name, ip);
    });

    socket.on('room chat message', async (data) => {
        if (!socket.userIdentity || !socket.currentRoom) return;
        const { name, avatar } = socket.userIdentity;
        const clientIP = getClientIP(socket);
        const msg = {
            id: crypto.randomUUID(),
            text: data.text || '',
            timestamp: new Date().toISOString(),
            senderName: name,
            senderAvatar: avatar,
            file: data.file || null
        };
        roomsModule.addRoomMessage(socket.currentRoom, msg);
        io.to(socket.currentRoom).emit('room chat message', msg);
        await sendToDiscord(name, avatar, msg.text, clientIP, msg.file, socket.currentRoom);
    });

    socket.on('load room history', () => {
        if (!socket.currentRoom) return;
        const roomMessages = roomsModule.getRoomMessages(socket.currentRoom);
        socket.emit('load room messages', roomMessages);
    });

    socket.on('room typing', (isTyping) => {
        if (!socket.currentRoom) return;
        socket.to(socket.currentRoom).emit('room typing', {
            userId: socket.id,
            userName: socket.userIdentity?.name,
            isTyping
        });
    });

    socket.on('disconnect', () => {
        if (socket.currentRoom && socket.userIdentity) {
            const ip = getClientIP(socket);
            sendRoomLog('leave', socket.currentRoom, socket.userIdentity.name, ip);
        }
        userSocketMap.delete(socket.id);
        console.log('🔌 Disconnected');
    });
});

// Routes
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/chat', (req, res) => { res.sendFile(path.join(__dirname, 'chat.html')); });

// Dynamic room route
app.get('/room/:roomName', (req, res) => {
    const roomName = req.params.roomName;
    if (!roomsModule.roomExists(roomName)) {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
    const room = roomsModule.getRoom(roomName);
    // Send a minimal HTML that loads the same chat client but with room context
    // We'll reuse chat.html but pass room data via query or script variable.
    // For simplicity, we send a slightly modified version that sets a global.
    const roomHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Whisper – ${escapeHtml(roomName)}</title>
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="theme-color" content="#1e293b">
    <style>/* same as main chat.html – you can copy the full style block from your chat.html or link to a shared CSS file */</style>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: linear-gradient(135deg, #1e293b 0%, #312e81 100%);
            height: 100dvh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        }
        .whisper-banner {
            background: rgba(10, 14, 23, 0.65);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding: 0.9rem 1.5rem;
        }
        .banner-container {
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .wordmark {
            font-family: 'Montserrat Alternates', system-ui, sans-serif;
            font-size: 1.55rem;
            font-weight: 600;
            background: linear-gradient(135deg, #ffffff, #c7d2fe);
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
        }
        .tagline {
            font-size: 0.75rem;
            color: #94a3b8;
            background: rgba(255,255,255,0.05);
            padding: 0.2rem 0.6rem;
            border-radius: 40px;
        }
        #messagesContainer {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
        }
        .message:not(.own) .message-bubble {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .own .message-bubble {
            background: rgba(99, 102, 241, 0.8);
            backdrop-filter: blur(4px);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .message-bubble {
            word-break: break-word;
            border-radius: 1rem;
            padding: 0.5rem 1rem;
            display: inline-block;
            max-width: 80%;
        }
        .input-container {
            background: rgba(0, 0, 0, 0.2);
            backdrop-filter: blur(8px);
            border-top: 1px solid rgba(255, 255, 255, 0.15);
            padding: 0.75rem;
        }
        .input-group {
            display: flex;
            gap: 0.5rem;
            max-width: 800px;
            margin: 0 auto;
        }
        #messageInput {
            flex: 1;
            background: rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 2rem;
            padding: 0.75rem 1rem;
            color: white;
        }
        .send-btn {
            background: linear-gradient(135deg, #4f46e5, #6366f1);
            border: none;
            border-radius: 2rem;
            padding: 0 1.25rem;
            color: white;
            font-weight: 600;
            cursor: pointer;
        }
        .avatar-img {
            width: 32px;
            height: 32px;
            border-radius: 50%;
        }
        .typing-indicator {
            font-size: 0.7rem;
            color: #94a3b8;
            padding: 0.25rem 1rem;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="whisper-banner">
        <div class="banner-container">
            <div class="brand">
                <span class="wordmark">Whisper · ${escapeHtml(roomName)}</span>
            </div>
            <div class="tagline">Anonymous · Instant</div>
        </div>
    </div>
    <div id="messagesContainer" class="space-y-2"></div>
    <div class="typing-indicator" id="typingIndicator"></div>
    <div class="input-container">
        <div class="input-group">
            <input type="text" id="messageInput" placeholder="Type a message..." autocomplete="off">
            <button id="sendBtn" class="send-btn">Send</button>
        </div>
    </div>

    <script>
        const roomName = ${JSON.stringify(roomName)};
        const hasPassword = ${room.hasPassword};
        let socket = io();
        let currentUserName = null;
        let currentUserId = null;
        let typingTimeout = null;

        const messagesContainer = document.getElementById('messagesContainer');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const typingIndicator = document.getElementById('typingIndicator');

        function appendMessage(msg) {
            const isOwn = (msg.senderName === currentUserName);
            const div = document.createElement('div');
            div.className = \`flex \${isOwn ? 'justify-end' : 'justify-start'} items-start gap-2 mb-2\`;
            if (!isOwn) {
                const avatarImg = document.createElement('img');
                avatarImg.src = msg.senderAvatar;
                avatarImg.className = 'avatar-img mt-1';
                div.appendChild(avatarImg);
            }
            const bubble = document.createElement('div');
            bubble.className = \`message-bubble \${isOwn ? 'own' : ''}\`;
            if (!isOwn) {
                const nameSpan = document.createElement('div');
                nameSpan.className = 'text-xs text-gray-400 mb-1';
                nameSpan.innerText = msg.senderName;
                bubble.appendChild(nameSpan);
            }
            const textSpan = document.createElement('div');
            if (msg.file) {
                if (msg.file.type && msg.file.type.startsWith('image/')) {
                    const img = document.createElement('img');
                    img.src = msg.file.url;
                    img.className = 'max-w-[200px] rounded cursor-pointer';
                    img.onclick = () => window.open(msg.file.url);
                    bubble.appendChild(img);
                } else {
                    const link = document.createElement('a');
                    link.href = msg.file.url;
                    link.textContent = \`📎 \${msg.file.name}\`;
                    link.target = '_blank';
                    link.className = 'text-indigo-300 underline';
                    bubble.appendChild(link);
                }
            } else {
                textSpan.innerText = msg.text;
                bubble.appendChild(textSpan);
            }
            div.appendChild(bubble);
            messagesContainer.appendChild(div);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function safeNotify(sender, text) {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'granted' && sender !== currentUserName) {
                new Notification(\`💬 \${sender}\`, { body: text, icon: '/icons/icon-192.png' });
            }
        }

        function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;
            socket.emit('room chat message', { text, file: null });
            messageInput.value = '';
        }

        if (hasPassword) {
            const modalHtml = \`
                <div id="roomPasswordModal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;">
                    <div style="background:#1e293b;border-radius:1rem;padding:2rem;max-width:400px;width:90%;text-align:center;">
                        <h3 style="color:white;margin-bottom:1rem;">🔐 Room Password Required</h3>
                        <p style="color:#94a3b8;margin-bottom:1.5rem;">This room is password protected.</p>
                        <input type="password" id="roomPassword" placeholder="Enter password" style="width:100%;padding:0.75rem;margin-bottom:1rem;background:#0f172a;border:1px solid #475569;border-radius:0.5rem;color:white;">
                        <button id="submitPassword" style="background:#3b82f6;padding:0.75rem 1.5rem;border:none;border-radius:0.5rem;color:white;cursor:pointer;">Enter Room</button>
                    </div>
                </div>
            \`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            document.getElementById('submitPassword').addEventListener('click', () => {
                const password = document.getElementById('roomPassword').value;
                authenticateAndJoin(password);
            });
        } else {
            authenticateAndJoin(null);
        }

        function authenticateAndJoin(password) {
            let storedId = localStorage.getItem('whisper_user_id');
            socket.emit('identify', storedId, (data) => {
                currentUserName = data.name;
                currentUserId = data.userId;
                localStorage.setItem('whisper_user_id', data.userId);
                socket.emit('join room', roomName, password, (response) => {
                    if (response.success) {
                        document.getElementById('roomPasswordModal')?.remove();
                        response.messages.forEach(msg => appendMessage(msg));
                        if (Notification.permission === 'default') Notification.requestPermission();
                    } else {
                        alert(response.error);
                        if (hasPassword) window.location.reload(); // retry
                    }
                });
            });
        }

        socket.on('room chat message', (msg) => {
            appendMessage(msg);
            if (msg.senderName !== currentUserName) safeNotify(msg.senderName, msg.text || 'sent a file');
        });

        socket.on('room typing', (data) => {
            if (data.userId !== currentUserId && data.isTyping) {
                typingIndicator.innerText = \`\${data.userName} is typing...\`;
            } else {
                typingIndicator.innerText = '';
            }
        });

        messageInput.addEventListener('input', () => {
            if (typingTimeout) clearTimeout(typingTimeout);
            socket.emit('room typing', true);
            typingTimeout = setTimeout(() => socket.emit('room typing', false), 1000);
        });

        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    </script>
</body>
</html>
    `;
    res.send(roomHtml);
});

// Admin panel (already includes room management in admin.js)
setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames, saveUserMappings);

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🔥 Chat running on http://localhost:${PORT}`);
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, (m) => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
