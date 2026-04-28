require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname)));

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('❌ Missing DISCORD_WEBHOOK_URL in .env');
  process.exit(1);
}

// Persistent storage files
const TAKEN_NAMES_FILE = path.join(__dirname, 'takenNames.json');
const USER_MAPPINGS_FILE = path.join(__dirname, 'userMappings.json');

let takenNames = new Set();       // all names ever used (never reused)
let userMappings = {};            // userId -> { name, avatar }

function loadData() {
  try {
    if (fs.existsSync(TAKEN_NAMES_FILE)) {
      const arr = JSON.parse(fs.readFileSync(TAKEN_NAMES_FILE, 'utf8'));
      takenNames = new Set(arr);
    }
    if (fs.existsSync(USER_MAPPINGS_FILE)) {
      userMappings = JSON.parse(fs.readFileSync(USER_MAPPINGS_FILE, 'utf8'));
    }
  } catch (e) { console.error('Failed to load data', e); }
}
function saveTakenNames() {
  fs.writeFileSync(TAKEN_NAMES_FILE, JSON.stringify(Array.from(takenNames), null, 2));
}
function saveUserMappings() {
  fs.writeFileSync(USER_MAPPINGS_FILE, JSON.stringify(userMappings, null, 2));
}
loadData();

// Name generation pool – combinations are unique per user, never repeated globally
const adjectives = ['Happy', 'Sleepy', 'Curious', 'Clever', 'Quiet', 'Bright', 'Witty', 'Calm', 'Bold', 'Swift'];
const nouns = ['Panda', 'Fox', 'Owl', 'Cat', 'Wolf', 'Koala', 'Raven', 'Falcon', 'Deer', 'Hedgehog'];

function generateUniqueName() {
  // Try random combinations up to 100 times
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
  // Fallback: numbered names (never collide)
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

// Avatar pool – can be reused by any user
const avatars = [
  'https://randomuser.me/api/portraits/lego/1.jpg',
  'https://randomuser.me/api/portraits/lego/2.jpg',
  'https://randomuser.me/api/portraits/lego/3.jpg',
  'https://randomuser.me/api/portraits/lego/4.jpg',
  'https://randomuser.me/api/portraits/lego/5.jpg',
  'https://randomuser.me/api/portraits/lego/6.jpg',
  'https://randomuser.me/api/portraits/lego/7.jpg',
  'https://randomuser.me/api/portraits/lego/8.jpg'
];

function getRandomAvatar() {
  return avatars[Math.floor(Math.random() * avatars.length)];
}

// Send message to Discord with the user's permanent name and avatar
async function sendToDiscord(name, avatar, text) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: text,
        username: name,
        avatar_url: avatar
      })
    });
    console.log(`📨 Discord: ${name} said "${text}"`);
  } catch (err) {
    console.error('Discord webhook failed', err);
  }
}

// Message history (in memory – survives until server restart)
let messages = []; // { text, timestamp }

io.on('connection', (socket) => {
  console.log('a user connected');

  // When client sends its stored user ID (or null)
  socket.on('identify', (storedUserId, callback) => {
    let userId = storedUserId;
    let name, avatar;

    if (storedUserId && userMappings[storedUserId]) {
      // Returning user – retrieve existing name + avatar
      const identity = userMappings[storedUserId];
      name = identity.name;
      avatar = identity.avatar;
      userId = storedUserId;
    } else {
      // New user – create permanent identity with unique name and random avatar
      userId = crypto.randomUUID();
      name = generateUniqueName();   // never reused
      avatar = getRandomAvatar();    // may be reused across users, static for this user
      userMappings[userId] = { name, avatar };
      saveUserMappings();
    }

    socket.userIdentity = { name, avatar, userId };
    callback({ userId, name, avatar });
  });

  // Client requests message history
  socket.on('load history', () => {
    socket.emit('load messages', messages);
  });

  // Incoming chat message
  socket.on('chat message', async ({ text }) => {
    if (!socket.userIdentity) return;
    const { name, avatar } = socket.userIdentity;

    const msg = { text, timestamp: new Date().toISOString() };
    messages.push(msg);
    if (messages.length > 500) messages.shift();

    // Broadcast to all connected clients
    io.emit('chat message', msg);

    // Also forward to Discord with the user's permanent name/avatar
    await sendToDiscord(name, avatar, text);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔥 Anonymous chat running on http://localhost:${PORT}`);
});
