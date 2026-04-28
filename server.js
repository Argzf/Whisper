require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const setupAdmin = require('./admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Storage files
const TAKEN_NAMES_FILE = path.join(__dirname, 'takenNames.json');
const USER_MAPPINGS_FILE = path.join(__dirname, 'userMappings.json');

// Ensure files exist with valid JSON
if (!fs.existsSync(TAKEN_NAMES_FILE)) {
  fs.writeFileSync(TAKEN_NAMES_FILE, '[]');
}
if (!fs.existsSync(USER_MAPPINGS_FILE)) {
  fs.writeFileSync(USER_MAPPINGS_FILE, '{}');
}

let takenNames = new Set();
let userMappings = {};

function loadData() {
  try {
    const takenRaw = fs.readFileSync(TAKEN_NAMES_FILE, 'utf8');
    takenNames = new Set(JSON.parse(takenRaw.length ? takenRaw : '[]'));
    const mappingRaw = fs.readFileSync(USER_MAPPINGS_FILE, 'utf8');
    userMappings = JSON.parse(mappingRaw.length ? mappingRaw : '{}');
    console.log(`✅ Loaded ${takenNames.size} taken names, ${Object.keys(userMappings).length} user mappings`);
  } catch (e) {
    console.error('Failed to load data – using empty defaults', e);
    takenNames = new Set();
    userMappings = {};
  }
}
function saveTakenNames() { fs.writeFileSync(TAKEN_NAMES_FILE, JSON.stringify([...takenNames], null, 2)); }
function saveUserMappings() { fs.writeFileSync(USER_MAPPINGS_FILE, JSON.stringify(userMappings, null, 2)); }
loadData();

// ... rest of your server.js (adjectives, nouns, avatars, generateUniqueName, getRandomAvatar, getClientIP, sendToDiscord, sendJoinLog, etc.)...

// After that, mount the admin panel correctly
setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE);

// 404 handler at the end
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔥 Chat + Admin running on http://localhost:${PORT}`);
});
