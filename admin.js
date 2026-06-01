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
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Whisper – Admin</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    body {
                        font-family: 'Inter', system-ui, -apple-system, sans-serif;
                        background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
                    }
                    ::-webkit-scrollbar {
                        width: 8px;
                        height: 8px;
                    }
                    ::-webkit-scrollbar-track {
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                    }
                    ::-webkit-scrollbar-thumb {
                        background: #6366f1;
                        border-radius: 10px;
                    }
                    ::-webkit-scrollbar-thumb:hover {
                        background: #818cf8;
                    }
                    .card {
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                    }
                    .card:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
                    }
                    .message-card {
                        transition: all 0.2s ease;
                    }
                    .message-card:hover {
                        background: rgba(51, 65, 85, 0.8);
                        transform: translateX(2px);
                    }
                    .avatar-img {
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        object-fit: cover;
                    }
                </style>
            </head>
            <body class="min-h-screen">
                <div class="container mx-auto px-4 py-6 max-w-7xl">
                    <!-- Header -->
                    <div class="flex justify-between items-center mb-8">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-5 h-5 text-white">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">Admin Dashboard</h1>
                        </div>
                        <div class="flex items-center gap-4">
                            <span class="text-sm text-gray-400">Welcome, Admin</span>
                            <a href="/admin/logout" class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors shadow-md">Logout</a>
                        </div>
                    </div>

                    <!-- Stats Overview (optional, can be removed if not needed) -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-400 text-sm">Total Messages</p>
                                    <p class="text-2xl font-bold text-white">${messages.length}</p>
                                </div>
                                <div class="w-12 h-12 rounded-full bg-indigo-900/50 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-indigo-400">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-400 text-sm">Total Users</p>
                                    <p class="text-2xl font-bold text-white">${userList.length}</p>
                                </div>
                                <div class="w-12 h-12 rounded-full bg-purple-900/50 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-purple-400">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-400 text-sm">Recent Activity</p>
                                    <p class="text-2xl font-bold text-white">${recentMessages.length}</p>
                                </div>
                                <div class="w-12 h-12 rounded-full bg-green-900/50 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-green-400">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Two Column Layout -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        <!-- Recent Messages -->
                        <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden card">
                            <div class="p-5 border-b border-gray-700/50 bg-gray-800/60">
                                <h2 class="text-lg font-semibold text-white">📩 Recent Messages</h2>
                            </div>
                            <div class="p-4 max-h-[400px] overflow-y-auto">`;
            if (recentMessages.length === 0) {
                html += `<div class="text-center py-8 text-gray-400">No messages yet.</div>`;
            } else {
                for (const m of recentMessages) {
                    let fileHtml = '';
                    if (m.file) {
                        if (m.file.type && m.file.type.startsWith('image/')) {
                            fileHtml = `<div class="mt-2"><img src="${escapeHtml(m.file.url)}" class="max-w-[150px] rounded-lg border border-gray-600" /></div>`;
                        } else {
                            fileHtml = `<div class="mt-2"><a href="${escapeHtml(m.file.url)}" target="_blank" class="text-indigo-400 hover:text-indigo-300 text-sm">📎 ${escapeHtml(m.file.name)}</a></div>`;
                        }
                    }
                    html += `
                                <div class="message-card bg-gray-800/60 rounded-lg p-3 mb-3 border border-gray-700/30">
                                    <div class="flex justify-between items-start mb-1">
                                        <span class="font-medium text-indigo-300 text-sm">${escapeHtml(m.senderName)}</span>
                                        <span class="text-xs text-gray-500">${new Date(m.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div class="text-gray-300 text-sm mb-2">${escapeHtml(m.text || '')}</div>
                                    ${fileHtml}
                                    <form action="/admin/delete-message/${m.id}" method="POST" class="mt-2">
                                        <button type="submit" class="text-red-400 hover:text-red-300 text-xs transition-colors">🗑️ Delete</button>
                                    </form>
                                </div>`;
                }
            }
            html += `</div>
                        </div>

                        <!-- Users List -->
                        <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden card">
                            <div class="p-5 border-b border-gray-700/50 bg-gray-800/60">
                                <h2 class="text-lg font-semibold text-white">👥 Active Users (${userList.length})</h2>
                            </div>
                            <div class="p-4 max-h-[400px] overflow-y-auto">
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">`;
            for (const u of userList) {
                html += `
                                    <div class="bg-gray-800/60 rounded-lg p-3 flex items-center gap-3 border border-gray-700/30">
                                        <img src="${escapeHtml(u.avatar)}" class="avatar-img w-10 h-10 rounded-full border border-gray-600" alt="avatar">
                                        <div class="flex-1 min-w-0">
                                            <p class="font-medium text-gray-200 truncate">${escapeHtml(u.name)}</p>
                                            <p class="text-xs text-gray-500 truncate">${u.id}</p>
                                        </div>
                                    </div>`;
            }
            html += `</div>
                            </div>
                        </div>
                    </div>

                    <!-- Action Cards Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Broadcast Message -->
                        <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 p-5 card">
                            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span>📢</span> Broadcast Message
                            </h2>
                            <form action="/admin/broadcast" method="POST" class="space-y-3">
                                <input type="text" name="broadcastText" placeholder="Enter your announcement..." class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg font-medium transition-colors shadow-lg">Send Broadcast</button>
                            </form>
                        </div>

                        <!-- Change Identity (Presets) -->
                        <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 p-5 card">
                            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span>🔄</span> Preset Identity
                            </h2>
                            <form action="/admin/change-identity" method="POST" class="space-y-3">
                                <input type="text" name="userId" placeholder="User ID" class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <select name="preset" class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value="Arsan">Arsan</option>
                                    <option value="ArGzf">ArGzf</option>
                                    <option value="Admin">Admin</option>
                                </select>
                                <button type="submit" class="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg font-medium transition-colors shadow-lg">Apply Preset</button>
                            </form>
                        </div>

                        <!-- Custom Identity -->
                        <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 p-5 card">
                            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span>✏️</span> Custom Identity
                            </h2>
                            <form action="/admin/change-custom-identity" method="POST" class="space-y-3">
                                <input type="text" name="userId" placeholder="User ID" class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input type="text" name="customName" placeholder="New Custom Name" class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-medium transition-colors shadow-lg">Apply Custom Name</button>
                            </form>
                        </div>

                        <!-- Danger Zone -->
                        <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-red-800/50 p-5 card">
                            <h2 class="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                                <span>⚠️</span> Danger Zone
                            </h2>
                            <form action="/admin/purge-messages" method="POST" onsubmit="return confirm('⚠️ Are you sure you want to purge ALL messages? This action cannot be undone!');">
                                <button type="submit" class="w-full bg-red-700 hover:bg-red-800 py-2 rounded-lg font-medium transition-colors shadow-lg">🧹 Purge All Messages</button>
                            </form>
                        </div>
                    </div>
                </div>
            </body>
            </html>`;
            res.send(html);
        } else {
            // Login page – fully centered with consistent styling
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Admin Login</title>
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        body {
                            font-family: 'Inter', system-ui, -apple-system, sans-serif;
                            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
                        }
                    </style>
                </head>
                <body class="min-h-screen flex items-center justify-center px-4">
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-700/50">
                        <div class="flex justify-center mb-6">
                            <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-8 h-8 text-white">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                        </div>
                        <h2 class="text-2xl font-bold text-center text-white mb-2">Admin Access</h2>
                        <p class="text-center text-gray-400 mb-6">Please enter the passcode to continue</p>
                        <form action="/admin/login" method="POST" class="space-y-4">
                            <input type="password" name="passcode" placeholder="Enter passcode" autofocus class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg font-medium transition-colors shadow-lg">Login</button>
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
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Admin Login</title>
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        body {
                            font-family: 'Inter', system-ui, -apple-system, sans-serif;
                            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
                        }
                    </style>
                </head>
                <body class="min-h-screen flex items-center justify-center px-4">
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-700/50 text-center">
                        <div class="text-red-400 mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-12 h-12 mx-auto">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p class="text-gray-300 mb-4">Wrong passcode. Please try again.</p>
                        <a href="/admin" class="text-indigo-400 hover:text-indigo-300 transition-colors">← Back to login</a>
                    </div>
                </body>
                </html>
            `);
        }
    });

    // Admin logout
    app.get('/admin/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/admin');
    });

    // Broadcast message
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

    // Delete single message
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

    // Purge all messages
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

    // Custom identity change (admin can set any name)
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
