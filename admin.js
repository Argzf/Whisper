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

    // Helper to truncate long strings
    function truncate(str, len = 50) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '…' : str;
    }

    // Admin dashboard (authenticated)
    app.get('/admin', (req, res) => {
        if (isAuthenticated(req)) {
            const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
            const recentMessages = messages.slice(-50).reverse();

            // Modern, responsive CSS
            const css = `
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
                    background: #f1f5f9;
                    color: #1e293b;
                    padding: 2rem;
                    line-height: 1.5;
                }

                /* Dashboard container */
                .dashboard {
                    max-width: 1400px;
                    margin: 0 auto;
                    display: grid;
                    gap: 2rem;
                }

                /* Header */
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 1rem;
                    padding-bottom: 1rem;
                    border-bottom: 2px solid #cbd5e1;
                }
                .header h1 {
                    font-size: 1.8rem;
                    font-weight: 600;
                    background: linear-gradient(135deg, #1e293b, #3b82f6);
                    background-clip: text;
                    -webkit-background-clip: text;
                    color: transparent;
                }
                .logout-btn {
                    background: #ef4444;
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    text-decoration: none;
                    font-weight: 500;
                    transition: 0.2s;
                }
                .logout-btn:hover {
                    background: #dc2626;
                }

                /* Cards */
                .card {
                    background: white;
                    border-radius: 1rem;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                }
                .card-header {
                    background: #f8fafc;
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                }
                .card-header h2 {
                    font-size: 1.25rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .card-body {
                    padding: 1.5rem;
                }

                /* Message list */
                .message-list {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .message-item {
                    background: #f8fafc;
                    border-radius: 0.75rem;
                    padding: 1rem;
                    border: 1px solid #e2e8f0;
                    transition: 0.1s;
                }
                .message-meta {
                    font-size: 0.8rem;
                    color: #475569;
                    margin-bottom: 0.5rem;
                    display: flex;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                .message-text {
                    margin: 0.5rem 0;
                    word-break: break-word;
                }
                .file-link {
                    display: inline-block;
                    margin-top: 0.5rem;
                    background: #e2e8f0;
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.5rem;
                    font-size: 0.8rem;
                }
                .delete-btn {
                    background: #ef4444;
                    color: white;
                    border: none;
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    font-size: 0.8rem;
                    margin-top: 0.5rem;
                }
                .delete-btn:hover {
                    background: #dc2626;
                }

                /* User grid */
                .user-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 0.75rem;
                }
                .user-card {
                    background: #f8fafc;
                    border-radius: 0.75rem;
                    padding: 0.75rem;
                    border: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .user-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    object-fit: cover;
                    flex-shrink: 0;
                }
                .user-info {
                    flex: 1;
                    min-width: 0;
                }
                .user-name {
                    font-weight: 600;
                    word-break: break-word;
                }
                .user-id {
                    font-size: 0.7rem;
                    color: #64748b;
                    word-break: break-all;
                }

                /* Forms */
                .form-group {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    margin-top: 0.5rem;
                }
                input, select {
                    padding: 0.5rem 0.75rem;
                    border-radius: 0.5rem;
                    border: 1px solid #cbd5e1;
                    background: white;
                    font-size: 0.9rem;
                    flex: 1;
                    min-width: 150px;
                }
                button {
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    font-weight: 500;
                    transition: 0.2s;
                }
                button:hover {
                    background: #2563eb;
                }
                .danger-btn {
                    background: #ef4444;
                }
                .danger-btn:hover {
                    background: #dc2626;
                }

                /* Responsive */
                @media (max-width: 768px) {
                    body {
                        padding: 1rem;
                    }
                    .card-body {
                        padding: 1rem;
                    }
                    .user-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `;

            let html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Whisper – Admin</title>
                <style>${css}</style>
            </head>
            <body>
                <div class="dashboard">
                    <div class="header">
                        <h1>🛡️ Admin Dashboard</h1>
                        <a href="/admin/logout" class="logout-btn">🔓 Logout</a>
                    </div>

                    <!-- Recent Messages -->
                    <div class="card">
                        <div class="card-header">
                            <h2>📩 Recent Messages (last 50)</h2>
                        </div>
                        <div class="card-body">`;

            if (recentMessages.length === 0) {
                html += '<p>No messages yet.</p>';
            } else {
                html += '<div class="message-list">';
                for (const m of recentMessages) {
                    let fileHtml = '';
                    if (m.file) {
                        if (m.file.type && m.file.type.startsWith('image/')) {
                            fileHtml = `<div class="file-link"><img src="${escapeHtml(m.file.url)}" style="max-width: 100px; border-radius: 8px;" /></div>`;
                        } else {
                            fileHtml = `<div class="file-link"><a href="${escapeHtml(m.file.url)}" target="_blank">📎 ${escapeHtml(m.file.name)}</a></div>`;
                        }
                    }
                    html += `<div class="message-item">
                        <div class="message-meta">
                            <span><strong>${escapeHtml(m.senderName)}</strong></span>
                            <span>${new Date(m.timestamp).toLocaleString()}</span>
                        </div>
                        <div class="message-text">${escapeHtml(m.text || '')}</div>
                        ${fileHtml}
                        <form action="/admin/delete-message/${m.id}" method="POST" style="margin-top: 0.5rem;">
                            <button type="submit" class="delete-btn">🗑️ Delete</button>
                        </form>
                    </div>`;
                }
                html += '</div>';
            }

            html += `</div></div>

                    <!-- Users -->
                    <div class="card">
                        <div class="card-header">
                            <h2>👥 Users (${userList.length})</h2>
                        </div>
                        <div class="card-body">
                            <div class="user-grid">`;

            for (const u of userList) {
                html += `<div class="user-card">
                            <img src="${escapeHtml(u.avatar)}" class="user-avatar" alt="avatar">
                            <div class="user-info">
                                <div class="user-name">${escapeHtml(u.name)}</div>
                                <div class="user-id" title="${escapeHtml(u.id)}">${truncate(u.id, 30)}</div>
                            </div>
                        </div>`;
            }

            html += `</div></div></div>

                    <!-- Broadcast Message -->
                    <div class="card">
                        <div class="card-header">
                            <h2>📢 Broadcast Message</h2>
                        </div>
                        <div class="card-body">
                            <form action="/admin/broadcast" method="POST">
                                <div class="form-group">
                                    <input type="text" name="broadcastText" placeholder="Broadcast message..." required>
                                    <button type="submit">Send Broadcast</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- Change Identity (Presets) -->
                    <div class="card">
                        <div class="card-header">
                            <h2>🔄 Change Identity (Presets)</h2>
                        </div>
                        <div class="card-body">
                            <form action="/admin/change-identity" method="POST">
                                <div class="form-group">
                                    <input type="text" name="userId" placeholder="User ID" required>
                                    <select name="preset">
                                        <option value="Arsan">Arsan</option>
                                        <option value="ArGzf">ArGzf</option>
                                        <option value="Admin">Admin</option>
                                    </select>
                                    <button type="submit">Change</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- Change Identity (Custom) -->
                    <div class="card">
                        <div class="card-header">
                            <h2>✏️ Change Identity (Custom)</h2>
                        </div>
                        <div class="card-body">
                            <form action="/admin/change-custom-identity" method="POST">
                                <div class="form-group">
                                    <input type="text" name="userId" placeholder="User ID" required>
                                    <input type="text" name="customName" placeholder="New custom name" required>
                                    <button type="submit">Apply Custom Name</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- Danger Zone -->
                    <div class="card" style="border-color: #fecaca;">
                        <div class="card-header" style="background: #fef2f2;">
                            <h2>⚠️ Danger Zone</h2>
                        </div>
                        <div class="card-body">
                            <form action="/admin/purge-messages" method="POST" onsubmit="return confirm('⚠️ Are you sure you want to purge ALL messages? This cannot be undone!');">
                                <button type="submit" class="danger-btn">🧹 Purge All Messages</button>
                            </form>
                        </div>
                    </div>
                </div>
            </body>
            </html>`;

            res.send(html);
        } else {
            // Original login page preserved exactly as you had it
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Admin Login</title>
                    <style>
                        body{background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui,sans-serif;}
                        .login-box{background:#1e293b;padding:2rem;border-radius:1rem;text-align:center;border:1px solid #334155;}
                        input{background:#0f172a;border:1px solid #475569;color:#e2e8f0;padding:0.5rem;border-radius:0.5rem;margin:0.5rem 0;width:100%;}
                        button{background:#3b82f6;border:none;padding:0.5rem 1rem;border-radius:0.5rem;color:white;cursor:pointer;width:100%;}
                        button:hover{background:#2563eb;}
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

    // Admin login handler (unchanged)
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

    // Custom identity change (unchanged logic)
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
        console.log(`✏️ Admin changed user ${userId} name from "${oldName}" to "${newName}"`);
        res.json({ success: true });
    });
}

module.exports = setupAdmin;
