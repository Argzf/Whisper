const fs = require('fs');
const path = require('path');
const roomsModule = require('./rooms');

function setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames, saveUserMappings, sendRoomCreationLog, ROOMS_ENABLED = true, ADMIN_LOG_WEBHOOK = null) {
    function escapeHtml(str) {
        return str.replace(/[&<>]/g, (m) => {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function isAuthenticated(req) {
        return req.session && req.session.authenticated === true;
    }

    function getRequestIP(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) return forwarded.split(',')[0].trim();
        return req.socket.remoteAddress;
    }

    async function sendAdminLog(action, details, req) {
        if (!ADMIN_LOG_WEBHOOK) return;
        const ip = getRequestIP(req);
        const embed = {
            title: `🛡️ Admin Action: ${action}`,
            color: 0x5865F2,
            fields: [
                { name: 'Action', value: action, inline: true },
                { name: 'IP Address', value: ip, inline: true },
                { name: 'Timestamp', value: new Date().toISOString(), inline: false }
            ],
            footer: { text: 'Whisper Room Admin Log' }
        };
        if (details) {
            embed.fields.push({ name: 'Details', value: details, inline: false });
        }
        try {
            await fetch(ADMIN_LOG_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] })
            });
            console.log(`📝 Admin log sent: ${action}`);
        } catch (err) {
            console.error('Admin log webhook failed:', err.message);
        }
    }

    app.get('/admin/login', (req, res) => {
        res.redirect('/admin');
    });

    app.get('/admin', (req, res) => {
        if (!isAuthenticated(req)) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Admin Login - Whisper</title>
                    <style>
                        body {
                            font-family: system-ui, -apple-system, sans-serif;
                            background: linear-gradient(135deg, #1e293b 0%, #312e81 100%);
                            margin: 0;
                            padding: 2rem;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .login-card {
                            background: rgba(15, 25, 35, 0.8);
                            backdrop-filter: blur(10px);
                            border: 1px solid rgba(255,255,255,0.1);
                            border-radius: 1.5rem;
                            padding: 2rem;
                            max-width: 400px;
                            width: 100%;
                        }
                        h2 {
                            color: #e2e8f0;
                            margin-bottom: 1.5rem;
                            font-size: 1.5rem;
                        }
                        input {
                            width: 100%;
                            padding: 0.75rem;
                            border-radius: 0.75rem;
                            border: 1px solid rgba(255,255,255,0.2);
                            background: rgba(0,0,0,0.5);
                            color: white;
                            font-size: 1rem;
                            margin-bottom: 1rem;
                        }
                        button {
                            width: 100%;
                            padding: 0.75rem;
                            border-radius: 0.75rem;
                            border: none;
                            background: linear-gradient(135deg, #4f46e5, #6366f1);
                            color: white;
                            font-weight: 600;
                            cursor: pointer;
                        }
                        button:hover {
                            background: linear-gradient(135deg, #6366f1, #818cf8);
                        }
                    </style>
                </head>
                <body>
                    <div class="login-card">
                        <h2>🔐 Admin Access</h2>
                        <form method="POST" action="/admin/login">
                            <input type="password" name="passcode" placeholder="Enter passcode" autocomplete="off" required>
                            <button type="submit">Login</button>
                        </form>
                    </div>
                </body>
                </html>
            `);
        }

        const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
        const recentMessages = messages.slice(-50).reverse();
        const allRooms = roomsModule.getAllRooms();

        let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard - Whisper</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #1e293b 0%, #312e81 100%);
            margin: 0;
            padding: 2rem;
            color: #e2e8f0;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1 { font-size: 2rem; margin-bottom: 1rem; }
        .stats {
            display: flex;
            gap: 1rem;
            margin-bottom: 2rem;
            flex-wrap: wrap;
        }
        .stat-card {
            background: rgba(15,25,35,0.6);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 1rem;
            padding: 1rem;
            text-align: center;
            flex: 1;
            min-width: 120px;
        }
        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: #a5b4fc;
        }
        .section {
            background: rgba(15,25,35,0.6);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 1rem;
            padding: 1rem;
            margin-bottom: 2rem;
        }
        h2 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            color: #cbd5e1;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        th { color: #a5b4fc; }
        .message-row { word-break: break-word; }
        .file-link { color: #818cf8; text-decoration: none; }
        .btn-danger {
            background: #ef4444;
            border: none;
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            cursor: pointer;
            color: white;
        }
        .btn-primary {
            background: #4f46e5;
            border: none;
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            cursor: pointer;
            color: white;
        }
        .room-list, .user-list {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
        }
        .room-card, .user-card {
            background: rgba(0,0,0,0.3);
            border-radius: 0.5rem;
            padding: 0.5rem;
        }
        .user-card {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
        }
        .identity-input {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .identity-input input {
            flex: 1;
            padding: 0.5rem;
            border-radius: 0.5rem;
            border: 1px solid rgba(255,255,255,0.2);
            background: rgba(0,0,0,0.5);
            color: white;
        }
        .broadcast-area {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        textarea {
            width: 100%;
            padding: 0.5rem;
            border-radius: 0.5rem;
            border: 1px solid rgba(255,255,255,0.2);
            background: rgba(0,0,0,0.5);
            color: white;
            resize: vertical;
        }
        .danger-zone {
            border-color: #ef4444;
        }
        /* Mobile fixes */
        @media (max-width: 640px) {
            body { padding: 1rem; }
            .section { overflow-x: auto; }
            table { display: block; overflow-x: auto; white-space: nowrap; }
            .stats { flex-direction: column; }
            .btn-danger, .btn-primary { padding: 0.5rem 0.75rem; }
            .identity-input { flex-direction: column; }
        }
    </style>
</head>
<body>
<div class="container">
    <h1>🛡️ Admin Dashboard</h1>
    <a href="/chat" style="display: inline-block; margin-bottom: 1rem; background: #4f46e5; padding: 0.5rem 1rem; border-radius: 0.5rem; color: white; text-decoration: none;">← Go to Chat</a>

    <div class="stats">
        <div class="stat-card"><div class="stat-number">${messages.length}</div><div>Total Messages</div></div>
        <div class="stat-card"><div class="stat-number">${userList.length}</div><div>Total Users</div></div>
        <div class="stat-card"><div class="stat-number">${recentMessages.length}</div><div>Recent Activity</div></div>
    </div>

    <div class="section">
        <h2>📩 Recent Messages</h2>
        ${recentMessages.length === 0 ? '<p>No messages yet.</p>' : `
        <div style="overflow-x: auto;">
            <table>
                <thead><tr><th>User</th><th>Time</th><th>Content</th><th>Action</th></tr></thead>
                <tbody>
                    ${recentMessages.map(m => {
                        let fileHtml = '';
                        if (m.file) {
                            if (m.file.type && m.file.type.startsWith('image/')) {
                                fileHtml = `<div><a href="${m.file.url}" target="_blank">📷 Image</a></div>`;
                            } else {
                                fileHtml = `<div><a href="${m.file.url}" target="_blank">📎 ${escapeHtml(m.file.name)}</a></div>`;
                            }
                        }
                        return `
                            <tr class="message-row">
                                <td>${escapeHtml(m.senderName)}</td>
                                <td>${new Date(m.timestamp).toLocaleString()}</td>
                                <td>${escapeHtml(m.text || '')}${fileHtml}</td>
                                <td><button class="btn-danger" onclick="deleteMessage('${m.id}')">🗑️ Delete</button></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        `}
    </div>

    <div class="section">
        <h2>🏠 Rooms ${!ROOMS_ENABLED ? '(Inactive)' : ''}</h2>
        ${ROOMS_ENABLED ? `
            <button class="btn-primary" onclick="createRoom()">+ New Room</button>
            <div class="room-list">
                ${Object.entries(allRooms).map(([name, room]) => `
                    <div class="room-card">
                        <strong>${escapeHtml(name)}</strong>
                        ${room.hasPassword ? '🔒 Password protected' : '🌍 Public'}
                        <div><button class="btn-primary" onclick="editRoom('${escapeHtml(name)}')">Edit</button>
                        <button class="btn-danger" onclick="deleteRoom('${escapeHtml(name)}')">Delete</button></div>
                    </div>
                `).join('')}
            </div>
        ` : '<p>This feature is temporarily disabled.</p>'}
    </div>

    <div class="section">
        <h2>👥 Active Users (${userList.length})</h2>
        <div class="user-list">
            ${userList.map(u => `
                <div class="user-card">
                    <img src="${u.avatar}" class="user-avatar" alt="avatar">
                    <div>
                        <strong>${escapeHtml(u.name)}</strong>
                        <div><small>${u.id}</small></div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h2>🔄 Change Identity</h2>
        <div class="identity-input">
            <input type="text" id="presetName" placeholder="Arsan, ArGzf, Admin">
            <button class="btn-primary" onclick="applyPresetIdentity()">Apply Preset</button>
        </div>
        <div class="identity-input">
            <input type="text" id="customName" placeholder="Custom name">
            <input type="text" id="customAvatar" placeholder="Avatar URL">
            <button class="btn-primary" onclick="applyCustomIdentity()">Apply Custom</button>
        </div>
    </div>

    <div class="section">
        <h2>📢 Broadcast Message</h2>
        <div class="broadcast-area">
            <textarea id="broadcastMessage" rows="3" placeholder="Enter message to broadcast..."></textarea>
            <button class="btn-primary" onclick="sendBroadcast()">Send Broadcast</button>
        </div>
    </div>

    <div class="section danger-zone">
        <h2>⚠️ Danger Zone</h2>
        <button class="btn-danger" onclick="purgeMessages()">Purge All Messages</button>
        <button class="btn-danger" onclick="logout()" style="margin-left: 1rem;">Logout</button>
    </div>
</div>

<script>
    function deleteMessage(id) {
        if (confirm('Delete this message?')) {
            fetch('/admin/delete-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            }).then(() => location.reload());
        }
    }
    function createRoom() {
        const name = prompt('Room name:');
        if (name) {
            fetch('/admin/create-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            }).then(() => location.reload());
        }
    }
    function editRoom(name) {
        const newName = prompt('New name:', name);
        if (newName && newName !== name) {
            fetch('/admin/edit-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldName: name, newName })
            }).then(() => location.reload());
        }
    }
    function deleteRoom(name) {
        if (confirm('Delete this room?')) {
            fetch('/admin/delete-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            }).then(() => location.reload());
        }
    }
    function applyPresetIdentity() {
        const name = document.getElementById('presetName').value;
        if (name) {
            fetch('/admin/rename-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            }).then(() => location.reload());
        }
    }
    function applyCustomIdentity() {
        const name = document.getElementById('customName').value;
        const avatar = document.getElementById('customAvatar').value;
        if (name || avatar) {
            fetch('/admin/change-identity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, avatar })
            }).then(() => location.reload());
        }
    }
    function sendBroadcast() {
        const message = document.getElementById('broadcastMessage').value;
        if (message) {
            fetch('/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            }).then(() => {
                document.getElementById('broadcastMessage').value = '';
                alert('Broadcast sent');
            });
        }
    }
    function purgeMessages() {
        if (confirm('⚠️ This will delete ALL messages! Are you sure?')) {
            fetch('/admin/purge-messages', { method: 'POST' })
                .then(() => location.reload());
        }
    }
    function logout() {
        fetch('/admin/logout', { method: 'POST' })
            .then(() => location.reload());
    }
</script>
</body>
</html>`;
        res.send(html);
    });

    app.post('/admin/login', (req, res) => {
        const { passcode } = req.body;
        if (passcode === ADMIN_PASSCODE) {
            req.session.authenticated = true;
            res.redirect('/admin');
        } else {
            res.send('<h3>Invalid passcode. <a href="/admin">Try again</a></h3>');
        }
    });

    app.post('/admin/delete-message', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        const { id } = req.body;
        const index = messages.findIndex(m => m.id === id);
        if (index !== -1) {
            const deleted = messages.splice(index, 1)[0];
            io.emit('message deleted', { id });
            sendAdminLog('Delete Message', `Deleted message from ${deleted.senderName}`, req);
        }
        res.json({ success: true });
    });

    app.post('/admin/purge-messages', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        messages.length = 0;
        io.emit('messages purged');
        sendAdminLog('Purge Messages', 'All messages deleted', req);
        res.json({ success: true });
    });

    app.post('/admin/broadcast', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        const { message } = req.body;
        if (message) {
            io.emit('system message', { text: message });
            sendAdminLog('Broadcast', `"${message}"`, req);
        }
        res.json({ success: true });
    });

    app.post('/admin/rename-user', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        const { name } = req.body;
        if (name) {
            sendAdminLog('Rename User', `Renamed user to ${name}`, req);
        }
        res.json({ success: true });
    });

    app.post('/admin/change-identity', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        const { name, avatar } = req.body;
        sendAdminLog('Change Identity', `Name: ${name}, Avatar: ${avatar}`, req);
        res.json({ success: true });
    });

    app.post('/admin/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/admin');
    });

    if (ROOMS_ENABLED) {
        app.post('/admin/create-room', (req, res) => {
            if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
            const { name, password } = req.body;
            if (name && !roomsModule.roomExists(name)) {
                roomsModule.createRoom(name, password);
                sendAdminLog('Create Room', `Room "${name}" created`, req);
                if (sendRoomCreationLog) sendRoomCreationLog(name);
            }
            res.json({ success: true });
        });
        app.post('/admin/edit-room', (req, res) => {
            if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
            const { oldName, newName, password } = req.body;
            if (oldName && newName && roomsModule.roomExists(oldName)) {
                roomsModule.renameRoom(oldName, newName);
                if (password) roomsModule.setRoomPassword(newName, password);
                sendAdminLog('Edit Room', `Renamed "${oldName}" to "${newName}"`, req);
            }
            res.json({ success: true });
        });
        app.post('/admin/delete-room', (req, res) => {
            if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
            const { name } = req.body;
            if (name && roomsModule.roomExists(name)) {
                roomsModule.deleteRoom(name);
                sendAdminLog('Delete Room', `Room "${name}" deleted`, req);
            }
            res.json({ success: true });
        });
    }
}

module.exports = setupAdmin;
