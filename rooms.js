// rooms.js - Complete room management module
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOMS_FILE = path.join(__dirname, 'rooms.json');

// Initialize rooms storage
if (!fs.existsSync(ROOMS_FILE)) {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify({}));
}

let rooms = {};
let messageStorage = {}; // Store messages per room: { roomName: [messages] }

function loadRooms() {
    try {
        const data = fs.readFileSync(ROOMS_FILE, 'utf8');
        rooms = JSON.parse(data);
    } catch (e) {
        console.error('Failed to load rooms:', e.message);
        rooms = {};
    }
}

function saveRooms() {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}

function initializeMessageStorage(roomName) {
    if (!messageStorage[roomName]) {
        messageStorage[roomName] = [];
    }
}

function getRoomMessages(roomName, limit = 50) {
    initializeMessageStorage(roomName);
    return messageStorage[roomName].slice(-limit).reverse();
}

function addRoomMessage(roomName, message) {
    initializeMessageStorage(roomName);
    messageStorage[roomName].push(message);
    if (messageStorage[roomName].length > 500) {
        messageStorage[roomName].shift();
    }
}

function deleteRoomMessage(roomName, messageId) {
    if (!messageStorage[roomName]) return false;
    const index = messageStorage[roomName].findIndex(m => m.id === messageId);
    if (index !== -1) {
        messageStorage[roomName].splice(index, 1);
        return true;
    }
    return false;
}

function purgeRoomMessages(roomName) {
    if (messageStorage[roomName]) {
        messageStorage[roomName] = [];
    }
}

function getAllRooms() {
    return rooms;
}

function getRoom(roomName) {
    return rooms[roomName];
}

function roomExists(roomName) {
    return !!rooms[roomName];
}

function createRoom(roomName, roomPassword = null) {
    if (rooms[roomName]) return false;
    rooms[roomName] = {
        name: roomName,
        password: roomPassword || null,
        createdAt: new Date().toISOString(),
        hasPassword: !!roomPassword
    };
    saveRooms();
    initializeMessageStorage(roomName);
    return true;
}

function updateRoomPassword(roomName, newPassword) {
    if (!rooms[roomName]) return false;
    rooms[roomName].password = newPassword || null;
    rooms[roomName].hasPassword = !!newPassword;
    saveRooms();
    return true;
}

function deleteRoom(roomName) {
    if (!rooms[roomName]) return false;
    delete rooms[roomName];
    saveRooms();
    // Clean up message storage
    if (messageStorage[roomName]) {
        delete messageStorage[roomName];
    }
    return true;
}

function verifyRoomPassword(roomName, password) {
    const room = rooms[roomName];
    if (!room) return false;
    if (!room.hasPassword) return true;
    return room.password === password;
}

// Load rooms on startup
loadRooms();

module.exports = {
    getAllRooms,
    getRoom,
    roomExists,
    createRoom,
    updateRoomPassword,
    deleteRoom,
    verifyRoomPassword,
    getRoomMessages,
    addRoomMessage,
    deleteRoomMessage,
    purgeRoomMessages
};
