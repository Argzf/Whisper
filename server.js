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
const roomsModule = require('./rooms');

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

// Helper to build room link from socket request
function getRoomLink(socket, roomName) {
    const req = socket.request;
    const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}/room/${roomName}`;
}

// Discord webhook functions
async function sendToDiscord(name, avatar, text, ip, file = null, roomName = null, roomLink = null) {
    if (!WEBHOOK_URL) return;
    const embed = {
        author: { name: name, icon_url: avatar },
        timestamp: new Date().toISOString(),
        color: 0x5865F2,
        description: text || '*sent a file*',
        footer: { text: `IP: ${ip}` }
    };
    if (file) {
        if (file.type && file.type.startsWith('image/')) {
            embed.image = { url: file.url };
            embed.description += `\n[🖼️ View full size](${file.url})`;
        } else {
            embed.description += `\n📎 [${file.name}](${file.url})`;
        }
    }
    if (roomName && roomLink) {
        embed.fields = [{ name: '📍 Room', value: `[${roomName}](${roomLink})`, inline: true }];
    }
    try {
        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        console.log(`📨 Discord embed sent for ${name}${roomName ? ` in ${roomName}` : ''}`);
    } catch (err) { console.error('Discord webhook failed:', err.message); }
}

async function sendRoomCreationLog(roomName, password, roomLink) {
    if (!LOG_WEBHOOK_URL) return;
    const embed = {
        title: '🏠 New Room Created',
        color: 0x22c55e,
        fields: [
            { name: 'Room Name', value: roomName, inline: true },
            { name: 'Password', value: password ? `\`${password}\`` : 'None (public)', inline: true },
            { name: 'Room Link', value: `[Click to join](${roomLink})`, inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Whisper Room Admin' }
    };
    try {
        await fetch(LOG_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        console.log(`📢 Room creation log sent for ${roomName}`);
    } catch (err) { console.error('Room creation log failed', err); }
}

async function sendJoinLog(name, avatar, userId, ip, roomName = null, roomLink = null) {
    if (!LOG_WEBHOOK_URL) return;
    const embed = {
        title: roomName ? `🚪 User joined room: ${roomName}` : '🚪 User joined the chat',
        color: 0x5865F2,
        thumbnail: { url: avatar },
        fields: [
            { name: 'Username', value: name, inline: true },
            { name: 'User ID', value: `\`${userId}\``, inline: false },
            { name: 'IP Address', value: ip, inline: false },
            { name: 'Avatar URL', value: `[link](${avatar})`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: roomName ? `Room: ${roomName}` : 'Whisper Room' }
    };
    if (roomName && roomLink) {
        embed.fields.push({ name: 'Room Link', value: `[Click to join](${roomLink})`, inline: false });
    }
    try {
        await fetch(LOG_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        console.log(`📢 Join log sent for ${name}${roomName ? ` in ${roomName}` : ''}`);
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
        // No join log here – main chat join can be added separately if needed
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

    // ========== ROOM SYSTEM ==========
    socket.on('join room', async (roomName, password, callback) => {
        if (!socket.userIdentity) {
            callback({ success: false, error: 'Not identified' });
            return;
        }
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
        
        const name = socket.userIdentity.name;
        const avatar = socket.userIdentity.avatar;
        const userId = socket.userIdentity.userId;
        const ip = getClientIP(socket);
        const roomLink = getRoomLink(socket, roomName);
        await sendJoinLog(name, avatar, userId, ip, roomName, roomLink);
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
        const roomLink = getRoomLink(socket, socket.currentRoom);
        await sendToDiscord(name, avatar, msg.text, clientIP, msg.file, socket.currentRoom, roomLink);
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
        userSocketMap.delete(socket.id);
        console.log('🔌 Disconnected');
    });
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/chat', (req, res) => { res.sendFile(path.join(__dirname, 'chat.html')); });

// Dynamic room route – serves modified chat.html with room overrides
app.get('/room/:roomName', (req, res) => {
    const roomName = req.params.roomName;
    if (!roomsModule.roomExists(roomName)) {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
    const room = roomsModule.getRoom(roomName);
    const chatHtmlPath = path.join(__dirname, 'chat.html');
    let chatHtml = fs.readFileSync(chatHtmlPath, 'utf8');

    // Update title and add room indicator
    chatHtml = chatHtml.replace('<title>Whisper</title>', `<title>Whisper · ${escapeHtml(roomName)}</title>`);
    const roomIndicator = `<div class="tagline ml-2" style="background:rgba(99,102,241,0.2);">${room.hasPassword ? '🔒 Private' : '🔓 Public'}</div>`;
    chatHtml = chatHtml.replace('<div class="tagline">Anonymous · Instant</div>', `<div class="tagline">Anonymous · Instant</div>${roomIndicator}`);

    // Inject room initialization script – ensures password is sent
    const roomScript = `
    <script>
        (function() {
            const roomName = ${JSON.stringify(roomName)};
            const hasPassword = ${room.hasPassword};
            let isRoomReady = false;
            
            function setupRoomMode() {
                // Remove main chat listeners
                socket.off('chat message');
                socket.off('load messages');
                socket.off('load history');
                
                // Add room listeners
                socket.on('room chat message', (msg) => {
                    if (typeof appendMessage === 'function') appendMessage(msg);
                    else if (typeof addMessage === 'function') addMessage(msg);
                    if (msg.senderName !== currentUserName && typeof safeNotify === 'function') {
                        safeNotify(msg.senderName, msg.text || 'sent a file');
                    }
                });
                socket.on('load room messages', (msgs) => {
                    if (typeof messagesContainer !== 'undefined') messagesContainer.innerHTML = '';
                    msgs.forEach(msg => {
                        if (typeof appendMessage === 'function') appendMessage(msg);
                        else if (typeof addMessage === 'function') addMessage(msg);
                    });
                });
                socket.on('room typing', (data) => {
                    const typingIndicator = document.getElementById('typingIndicator');
                    if (typingIndicator) {
                        if (data.userId !== socket.id && data.isTyping) {
                            typingIndicator.innerText = data.userName + ' is typing...';
                        } else {
                            typingIndicator.innerText = '';
                        }
                    }
                });
                
                // Override send functions
                window.sendMessage = function() {
                    const text = document.getElementById('messageInput').value.trim();
                    if (!text) return;
                    socket.emit('room chat message', { text, file: null });
                    document.getElementById('messageInput').value = '';
                };
                window.handleFileUpload = async function(file) {
                    if (typeof uploadFile === 'function') {
                        const { url, name, type } = await uploadFile(file);
                        socket.emit('room chat message', { text: '', file: { url, name, type } });
                    }
                };
                
                socket.emit('load room history');
            }
            
            function showPasswordModal() {
                const modalHtml = \`
                    <div id="roomPasswordModal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:10000;">
                        <div style="background:#1e293b;border-radius:1rem;padding:2rem;max-width:400px;width:90%;text-align:center;border:1px solid #475569;">
                            <h3 style="color:white;margin-bottom:1rem;">🔐 Room Password Required</h3>
                            <p style="color:#94a3b8;margin-bottom:1.5rem;">This room is password protected.</p>
                            <input type="password" id="roomPasswordInput" placeholder="Enter password" style="width:100%;padding:0.75rem;margin-bottom:1rem;background:#0f172a;border:1px solid #475569;border-radius:0.5rem;color:white;">
                            <button id="roomPasswordSubmit" style="background:#3b82f6;padding:0.75rem 1.5rem;border:none;border-radius:0.5rem;color:white;cursor:pointer;">Enter Room</button>
                        </div>
                    </div>
                \`;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                const input = document.getElementById('roomPasswordInput');
                const btn = document.getElementById('roomPasswordSubmit');
                const attempt = () => {
                    const pwd = input.value;
                    socket.emit('join room', roomName, pwd, (response) => {
                        if (response.success) {
                            document.getElementById('roomPasswordModal')?.remove();
                            setupRoomMode();
                            if (typeof requestNotificationPermissionSafe === 'function') requestNotificationPermissionSafe();
                        } else {
                            alert(response.error);
                            input.value = '';
                            input.focus();
                        }
                    });
                };
                btn.onclick = attempt;
                input.onkeypress = (e) => { if (e.key === 'Enter') attempt(); };
            }
            
            // Wait for identity then join
            const waitForIdentity = setInterval(() => {
                if (socket.userIdentity) {
                    clearInterval(waitForIdentity);
                    if (hasPassword) {
                        showPasswordModal();
                    } else {
                        socket.emit('join room', roomName, null, (response) => {
                            if (response.success) {
                                setupRoomMode();
                                if (typeof requestNotificationPermissionSafe === 'function') requestNotificationPermissionSafe();
                            } else {
                                console.error('Failed to join room:', response.error);
                            }
                        });
                    }
                }
            }, 100);
        })();
    </script>
    `;
    chatHtml = chatHtml.replace('</body>', roomScript + '</body>');
    res.send(chatHtml);
});

// Admin panel
setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames, saveUserMappings, sendRoomCreationLog);

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🔥 Chat + Admin + Rooms running on http://localhost:${PORT}`);
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
