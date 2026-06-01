const fs = require('fs');
const path = require('path');

function setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames, saveUserMappings) {
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

    // Admin dashboard (authenticated)
    app.get('/admin', (req, res) => {
        if (isAuthenticated(req)) {
            const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
            const recentMessages = messages.slice(-50).reverse();

            let html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Whisper – Admin</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; max-width: 1200px; margin: 0 auto; }
                    h1, h2 { color: #c084fc; }
                    .message-card, .user-card, .broadcast-form, .identity-form, .danger-zone, .custom-identity-form { background: #1e293b; border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.5rem; border: 1px solid #334155; }
                    .message-meta { font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.5rem; }
                    .message-text { margin: 0.5rem 0; }
                    .file-link { display: inline-block; margin-top: 0.5rem; background: #0f172a; padding: 0.25rem 0.5rem; border-radius: 0.5rem; }
                    .delete-btn { background: #ef4444; color: white; border: none; padding: 0.25rem 0.75rem; border-radius: 0.5rem; cursor: pointer; }
                    .delete-btn:hover { background: #dc2626; }
                    input, select, button { padding: 0.5rem; border-radius: 0.5rem; border: none; }
                    input, select { background: #0f172a; color: #e2e8f0; border: 1px solid #475569; margin-right: 0.5rem; }
                    button { background: #3b82f6; color: white; cursor: pointer; }
                    button.danger { background: #ef4444; }
                    button.danger:hover { background: #dc2626; }
                    .danger-zone { border-color: #ef4444; }
                    a { color: #60a5fa; text-decoration: none; }
                    .user-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 8px; }
                </style>
            </head>
            <body>
                <h1>🛡️ Admin Dashboard</h1>
                <h2>📩 Recent Messages (last 50)</h2>`;

            if (recentMessages.length === 0) {
                html += '<p>No messages yet.</p>';
            } else {
                for (const m of recentMessages) {
                    let fileHtml = '';
                    if (m.file) {
                        if (m.file.type && m.file.type.startsWith('image/')) {
                            fileHtml = `<div class="file-link"><img src="${escapeHtml(m.file.url)}" style="max-width: 200px; border-radius: 8px;" /></div>`;
                        } else {
                            fileHtml = `<div class="file-link"><a href="${escapeHtml(m.file.url)}" target="_blank">📎 ${escapeHtml(m.file.name)}</a></div>`;
                        }
                    }
                    html += `<div class="message-card">
                        <div class="message-meta">${escapeHtml(m.senderName)} (${new Date(m.timestamp).toLocaleString()}):</div>
                        <div class="message-text">${escapeHtml(m.text || '')}</div>
                        ${fileHtml}
                        <form action="/admin/delete-message/${m.id}" method="POST" style="margin-top: 0.5rem;"><button type="submit" class="delete-btn">🗑️ Delete</button></form>
                    </div>`;
                }
            }

            html += `<h2>👥 Users (${userList.length})</h2>`;
            for (const u of userList) {
                html += `<div class="user-card"><img src="${escapeHtml(u.avatar)}" class="user-avatar" alt="avatar"><strong>${escapeHtml(u.name)}</strong><br><small>${u.id}</small></div>`;
            }

            html += `<div class="broadcast-form">
                        <h2>📢 Broadcast Message</h2>
                        <form action="/admin/broadcast" method="POST">
                            <input type="text" name="broadcastText" placeholder="Broadcast message...">
                            <button type="submit">Send Broadcast</button>
                        </form>
                    </div>

                    <div class="identity-form">
                        <h2>🔄 Change Identity (Presets)</h2>
                        <form action="/admin/change-identity" method="POST">
                            <input type="text" name="userId" placeholder="User ID">
                            <select name="preset">
                                <option value="Arsan">Arsan</option>
                                <option value="ArGzf">ArGzf</option>
                                <option value="Admin">Admin</option>
                            </select>
                            <button type="submit">Change</button>
                        </form>
                    </div>

                    <div class="custom-identity-form">
                        <h2>🖊️ Change Identity (Custom)</h2>
                        <form action="/admin/change-custom-identity" method="POST">
                            <input type="text" name="userId" placeholder="User ID" required>
                            <input type="text" name="customName" placeholder="New custom name" required>
                            <button type="submit">Apply Custom Name</button>
                        </form>
                    </div>

                    <div class="danger-zone">
                        <h2>⚠️ Danger Zone</h2>
                        <form action="/admin/purge-messages" method="POST" onsubmit="return confirm('⚠️ Are you sure you want to purge ALL messages? This cannot be undone!');">
                            <button type="submit" class="danger">🧹 Purge All Messages</button>
                        </form>
                    </div>

                    <a href="/admin/logout">🔓 Logout</a>
            </body></html>`;
            res.send(html);
        } else {
            // RESTORED LOGIN PAGE – button now centered
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Admin Login</title>
                    <style>
                        body {
                            background: #0f172a;
                            color: #e2e8f0;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            font-family: system-ui, -apple-system, sans-serif;
                        }
                        .login-box {
                            background: #1e293b;
                            padding: 2rem;
                            border-radius: 1rem;
                            text-align: center;
                            border: 1px solid #334155;
                            width: 300px;
                        }
                        input {
                            background: #0f172a;
                            border: 1px solid #475569;
                            color: #e2e8f0;
                            padding: 0.5rem;
                            border-radius: 0.5rem;
                            margin: 0.5rem 0;
                            width: 100%;
                            box-sizing: border-box;
                        }
                        button {
                            background: #3b82f6;
                            border: none;
                            padding: 0.5rem 1rem;
                            border-radius: 0.5rem;
                            color: white;
                            cursor: pointer;
                            width: 100%;
                            margin-top: 0.5rem;
                        }
                        button:hover { background: #2563eb; }
                    </style>
                </head>
                <body>
                    <div class="login-box">
                        <h2>🔐 Admin Passcode</h2>
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

    // Admin login handler (unchanged logic, only UI restored)
    app.post('/admin/login', (req, res) => {
        const { passcode } = req.body;
        if (passcode === ADMIN_PASSCODE) {
            req.session.authenticated = true;
            res.redirect('/admin');
        } else {
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head><meta charset="UTF-8"><title>Admin Login</title>
                <style>body{background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;}</style>
                </head>
                <body>
                    <div style="background:#1e293b;padding:2rem;border-radius:1rem;text-align:center;">
                        <p>Wrong passcode. <a href="/admin" style="color:#60a5fa;">Try again</a></p>
                    </div>
                </body>
                </html>
            `);
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
            io.emit('system message', { text: `📢 Admin: ${broadcastText}` });
            console.log(`Admin broadcast: ${broadcastText}`);
            res.status(200).send('OK');
        } else {
            res.status(400).send('No message');
        }
    });

    app.post('/admin/delete-message/:id', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        const messageId = req.params.id;
        const index = messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
            const msg = messages[index];
            if (msg.file && msg.file.url) {
                const filePath = path.join(__dirname, msg.file.url);
                fs.unlink(filePath, (err) => {
                    if (err && err.code !== 'ENOENT') console.error(`Failed to delete file ${filePath}:`, err);
                });
            }
            messages.splice(index, 1);
            io.emit('message deleted', { id: messageId });
            console.log(`🗑️ Admin deleted message ${messageId}`);
            res.redirect('/admin');
        } else {
            res.status(404).send('Message not found');
        }
    });

    app.post('/admin/purge-messages', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        for (const msg of messages) {
            if (msg.file && msg.file.url) {
                const filePath = path.join(__dirname, msg.file.url);
                fs.unlink(filePath, (err) => {
                    if (err && err.code !== 'ENOENT') console.error(`Failed to delete file ${filePath}:`, err);
                });
            }
        }
        messages.length = 0;
        io.emit('messages purged');
        console.log('🧹 Admin purged all messages');
        res.redirect('/admin');
    });

    // Preset identity change (unchanged)
    app.post('/admin/change-identity', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        const { preset, userId } = req.body;
        if (!preset || !userId) return res.status(400).json({ error: 'Missing preset or user ID' });
        if (!userMappings[userId]) return res.status(400).json({ error: 'User not found' });

        const presets = {
            Arsan: { name: 'Arsan', avatar: 'https://cdn.discordapp.com/avatars/935053416877666304/47a4a97c8aec961daed192cd2c4cde12.png' },
            ArGzf: { name: 'ArGzf', avatar: 'https://cdn.discordapp.com/avatars/935053416877666304/47a4a97c8aec961daed192cd2c4cde12.png' },
            Admin: { name: 'Admin', avatar: 'https://randomuser.me/api/portraits/lego/8.jpg' },
        };
        const newIdentity = presets[preset];
        if (!newIdentity) return res.status(400).json({ error: 'Invalid preset' });

        const existing = Object.entries(userMappings).find(([id, data]) => data.name === newIdentity.name && id !== userId);
        if (existing) return res.status(400).json({ error: 'This name is already taken and cannot be reused.' });

        userMappings[userId] = { name: newIdentity.name, avatar: newIdentity.avatar };
        saveUserMappings();

        if (!takenNames.has(newIdentity.name)) {
            takenNames.add(newIdentity.name);
            saveTakenNames();
        }

        io.emit('force-reload-identity', { userId });
        res.json({ success: true });
    });

    // Custom identity change
    app.post('/admin/change-custom-identity', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        const { userId, customName } = req.body;
        if (!userId || !customName || customName.trim() === '') {
            return res.status(400).json({ error: 'User ID and custom name are required' });
        }
        if (!userMappings[userId]) return res.status(400).json({ error: 'User not found' });

        const newName = customName.trim();
        const existing = Object.entries(userMappings).find(([id, data]) => data.name === newName && id !== userId);
        if (existing) return res.status(400).json({ error: 'This name is already taken and cannot be reused.' });

        const oldName = userMappings[userId].name;
        userMappings[userId].name = newName;
        saveUserMappings();

        if (oldName && takenNames.has(oldName)) {
            takenNames.delete(oldName);
            saveTakenNames();
        }
        if (!takenNames.has(newName)) {
            takenNames.add(newName);
            saveTakenNames();
        }

        io.emit('force-reload-identity', { userId });
        console.log(`🖊️ Admin changed user ${userId} name from "${oldName}" to "${newName}"`);
        res.json({ success: true });
    });
}

module.exports = setupAdmin;
