require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session for admin login (in‑memory)
app.use(session({
  secret: crypto.randomUUID(),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 30 * 60 * 1000 } // 30 minutes
}));

// Webhooks
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('❌ Missing DISCORD_WEBHOOK_URL in .env');
  process.exit(1);
}
const LOG_WEBHOOK_URL = process.env.WH_LOG_WEBHOOK_URL;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'admin123'; // fallback

// Storage files
const TAKEN_NAMES_FILE = path.join(__dirname, 'takenNames.json');
const USER_MAPPINGS_FILE = path.join(__dirname, 'userMappings.json');

if (!fs.existsSync(TAKEN_NAMES_FILE)) {
  fs.writeFileSync(TAKEN_NAMES_FILE, '[]');
  console.log('📄 Created takenNames.json');
}
if (!fs.existsSync(USER_MAPPINGS_FILE)) {
  fs.writeFileSync(USER_MAPPINGS_FILE, '{}');
  console.log('📄 Created userMappings.json');
}

let takenNames = new Set();
let userMappings = {};

function loadData() {
  try {
    const takenRaw = fs.readFileSync(TAKEN_NAMES_FILE, 'utf8');
    takenNames = new Set(JSON.parse(takenRaw));
    const mappingRaw = fs.readFileSync(USER_MAPPINGS_FILE, 'utf8');
    userMappings = JSON.parse(mappingRaw);
    console.log(`✅ Loaded ${takenNames.size} taken names, ${Object.keys(userMappings).length} user mappings`);
  } catch (e) {
    console.error('Failed to load data', e);
  }
}
function saveTakenNames() {
  fs.writeFileSync(TAKEN_NAMES_FILE, JSON.stringify(Array.from(takenNames), null, 2));
}
function saveUserMappings() {
  fs.writeFileSync(USER_MAPPINGS_FILE, JSON.stringify(userMappings, null, 2));
}

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

// Helper to get real client IP (handles proxies)
function getClientIP(socket) {
  const req = socket.request;
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address;
}

async function sendToDiscord(name, avatar, text) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, username: name, avatar_url: avatar })
    });
    console.log(`📨 Discord: ${name} said "${text}"`);
  } catch (err) { console.error('Discord webhook failed', err); }
}

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
    await fetch(LOG_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    console.log(`📢 Join log sent for ${name} (IP: ${ip})`);
  } catch (err) { console.error('Join log failed', err); }
}

let messages = [];

app.get('/debug/mappings', (req, res) => {
  res.json(userMappings);
});

io.on('connection', (socket) => {
  console.log('🔌 New connection');

  socket.on('identify', (storedUserId, callback) => {
    const clientIP = getClientIP(socket);
    console.log(`🆔 Identify called with storedUserId = ${storedUserId} (IP: ${clientIP})`);

    let userId = storedUserId;
    let name, avatar;

    if (storedUserId && userMappings[storedUserId]) {
      const identity = userMappings[storedUserId];
      name = identity.name;
      avatar = identity.avatar;
      userId = storedUserId;
      console.log(`✅ Returning existing user: ${name} (${userId})`);
    } else {
      userId = crypto.randomUUID();
      name = generateUniqueName();
      avatar = getRandomAvatar();
      userMappings[userId] = { name, avatar };
      saveUserMappings();
      console.log(`🆕 Created new user: ${name} (${userId})`);
    }
    socket.userIdentity = { name, avatar, userId };
    callback({ userId, name, avatar });
    sendJoinLog(name, avatar, userId, clientIP);
  });

  socket.on('load history', () => {
    socket.emit('load messages', messages);
  });

  socket.on('chat message', async ({ text }) => {
    if (!socket.userIdentity) return;
    const { name, avatar } = socket.userIdentity;
    const msg = {
      text,
      timestamp: new Date().toISOString(),
      senderName: name,
      senderAvatar: avatar
    };
    messages.push(msg);
    if (messages.length > 500) messages.shift();
    io.emit('chat message', msg);
    await sendToDiscord(name, avatar, text);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Disconnected');
  });
});

// ---------- ADMIN PANEL ----------
function isAuthenticated(req) {
  return req.session && req.session.authenticated === true;
}

app.get('/admin', (req, res) => {
  if (isAuthenticated(req)) {
    const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
    const recentMessages = messages.slice(-50).reverse();
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Whisper – Admin</title>
        <style>
          body { font-family: system-ui; background: #0a0c10; color: #eee; margin: 0; padding: 2rem; }
          h1, h2 { color: #818cf8; }
          table { border-collapse: collapse; width: 100%; margin-top: 1rem; background: #1e1e2e; border-radius: 12px; overflow: hidden; }
          th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #333; }
          th { background: #2d3748; }
          .message-bubble { background: #2d3748; padding: 0.5rem; border-radius: 12px; margin: 0.25rem 0; }
          input, button { padding: 0.5rem; margin: 0.5rem 0; border-radius: 8px; border: none; }
          input { background: #2d3748; color: white; width: 100%; }
          button { background: #6366f1; color: white; cursor: pointer; }
          button:hover { background: #818cf8; }
          .container { max-width: 1200px; margin: 0 auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔐 Admin Dashboard</h1>
          <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
            <div style="flex: 2;">
              <h2>📨 Recent Messages (last 50)</h2>
              <div style="max-height: 400px; overflow-y: auto;">
                ${recentMessages.map(m => `<div class="message-bubble"><strong>${escapeHtml(m.senderName)}</strong> (${new Date(m.timestamp).toLocaleString()}): ${escapeHtml(m.text)}</div>`).join('')}
                ${recentMessages.length === 0 ? '<p>No messages yet.</p>' : ''}
              </div>
            </div>
            <div style="flex: 1;">
              <h2>👥 Users (${userList.length})</h2>
              <div style="max-height: 400px; overflow-y: auto;">
                ${userList.map(u => `<div><img src="${u.avatar}" width="24" style="border-radius: 50%; vertical-align: middle;"> <strong>${escapeHtml(u.name)}</strong><br><small>${u.id}</small></div><hr>`).join('')}
              </div>
            </div>
          </div>
          <h2 style="margin-top: 2rem;">📢 Broadcast Message</h2>
          <form action="/admin/broadcast" method="POST">
            <input type="text" name="broadcastText" placeholder="System message to all users" required>
            <button type="submit">Send Broadcast</button>
          </form>
          <div style="margin-top: 2rem;">
            <a href="/admin/logout" style="color: #f87171;">Logout</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Admin Login</title>
        <style>
          body { background: #0a0c10; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: system-ui; }
          .card { background: #1e1e2e; padding: 2rem; border-radius: 1rem; width: 300px; }
          input, button { width: 100%; padding: 0.5rem; margin: 0.5rem 0; border-radius: 8px; border: none; }
          button { background: #6366f1; color: white; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Admin Passcode</h2>
          <form action="/admin/login" method="POST">
            <input type="password" name="passcode" placeholder="Enter passcode" autofocus>
            <button type="submit">Login</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }
});

app.post('/admin/login', (req, res) => {
  const { passcode } = req.body;
  if (passcode === ADMIN_PASSCODE) {
    req.session.authenticated = true;
    res.redirect('/admin');
  } else {
    res.send('<p style="color:red;">Wrong passcode. <a href="/admin">Try again</a></p>');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin');
});

app.post('/admin/broadcast', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
  const broadcastText = req.body.broadcastText?.trim();
  if (broadcastText) {
    io.emit('system message', { text: `📢 ADMIN: ${broadcastText}` });
    console.log(`📢 Admin broadcast: ${broadcastText}`);
  }
  res.redirect('/admin');
});

function escapeHtml(str) {
  return str.replace(/[&<>]/g, (m) => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔥 Chat + Admin running on http://localhost:${PORT}`);
});
