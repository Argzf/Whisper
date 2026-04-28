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

// Persistent storage
const TAKEN_NAMES_FILE = path.join(__dirname, 'takenNames.json');
const USER_MAPPINGS_FILE = path.join(__dirname, 'userMappings.json');

let takenNames = new Set();
let userMappings = {};

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
function saveTakenNames() { fs.writeFileSync(TAKEN_NAMES_FILE, JSON.stringify(Array.from(takenNames), null, 2)); }
function saveUserMappings() { fs.writeFileSync(USER_MAPPINGS_FILE, JSON.stringify(userMappings, null, 2)); }
loadData();

const adjectives = ['Happy', 'Sleepy', 'Curious', 'Clever', 'Quiet', 'Bright', 'Witty', 'Calm', 'Bold', 'Swift'];
const nouns = ['Panda', 'Fox', 'Owl', 'Cat', 'Wolf', 'Koala', 'Raven', 'Falcon', 'Deer', 'Hedgehog'];
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

function getRandomAvatar() {
  return avatars[Math.floor(Math.random() * avatars.length)];
}

async function sendToDiscord(name, avatar, text) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, username: name, avatar_url: avatar })
    });
    console.log(`📨 Discord: ${name} said "${text}"`);
  } catch (err) {
    console.error('Discord webhook failed', err);
  }
}

let messages = []; // { text, timestamp }

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('identify', (storedUserId, callback) => {
    let userId = storedUserId;
    let name, avatar;

    if (storedUserId && userMappings[storedUserId]) {
      const identity = userMappings[storedUserId];
      name = identity.name;
      avatar = identity.avatar;
      userId = storedUserId;
      console.log(`Returning user: ${name} (${userId})`);
    } else {
      userId = crypto.randomUUID();
      name = generateUniqueName();
      avatar = getRandomAvatar();
      userMappings[userId] = { name, avatar };
      saveUserMappings();
      console.log(`New user: ${name} (${userId})`);
    }
    socket.userIdentity = { name, avatar, userId };
    callback({ userId, name, avatar });
  });

  socket.on('load history', () => {
    socket.emit('load messages', messages);
  });

  socket.on('chat message', async ({ text }) => {
    if (!socket.userIdentity) return;
    const { name, avatar } = socket.userIdentity;
    const msg = { text, timestamp: new Date().toISOString() };
    messages.push(msg);
    if (messages.length > 500) messages.shift();
    io.emit('chat message', msg);
    await sendToDiscord(name, avatar, text);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔥 Chat running on http://localhost:${PORT}`);
});
