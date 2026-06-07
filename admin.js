const fs = require('fs');
const path = require('path');
const roomsModule = require('./rooms');

function setupAdmin(app, io, userMappings, messages, ADMIN_PASSCODE, takenNames, saveTakenNames, saveUserMappings, sendRoomCreationLog, ROOMS_ENABLED = true, ADMIN_LOG_WEBHOOK = null) {

    // Helper functions (must be defined before any potential usage)
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
        if (details) embed.fields.push({ name: 'Details', value: details, inline: false });
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

    // ========== DISCORD OAUTH2 (optional, graceful fallback) ==========
    let discordAuthEnabled = false;
    const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
    const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://whisper.arsan.my/admin/auth/discord/callback';
    const ALLOWED_DISCORD_IDS = ['935053416877666304', '935150412661682256'];

    // Try to load Passport modules only if environment variables are set
    if (DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET) {
        try {
            const passport = require('passport');
            const DiscordStrategy = require('passport-discord').Strategy;

            app.use(passport.initialize());
            app.use(passport.session());

            passport.use(new DiscordStrategy({
                clientID: DISCORD_CLIENT_ID,
                clientSecret: DISCORD_CLIENT_SECRET,
                callbackURL: DISCORD_REDIRECT_URI,
                scope: ['identify']
            }, (accessToken, refreshToken, profile, done) => {
                return done(null, profile);
            }));

            passport.serializeUser((user, done) => done(null, user));
            passport.deserializeUser((obj, done) => done(null, obj));

            // OAuth2 routes
            app.get('/admin/auth/discord', passport.authenticate('discord'));

            app.get('/admin/auth/discord/callback',
                passport.authenticate('discord', { failureRedirect: '/admin' }),
                (req, res) => {
                    const discordId = req.user?.id;
                    if (discordId && ALLOWED_DISCORD_IDS.includes(discordId)) {
                        req.session.authenticated = true;
                        req.session.authMethod = 'discord';
                        req.session.discordUser = {
                            id: req.user.id,
                            username: req.user.username,
                            avatar: req.user.avatar
                        };
                        sendAdminLog('Discord Login Success', `Discord user ${req.user.username} (${discordId}) logged in`, req);
                        res.redirect('/admin');
                    } else {
                        sendAdminLog('Discord Login Denied', `Discord user ${req.user?.username} (${discordId}) attempted to log in but is not authorized`, req);
                        res.send(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>Access Denied</title>
                                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                                <script src="https://cdn.tailwindcss.com"></script>
                                <style>body{font-family:'Inter',sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);}</style>
                            </head>
                            <body class="min-h-screen flex items-center justify-center px-4">
                                <div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-700/50 text-center">
                                    <div class="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <h2 class="text-2xl font-bold text-white mb-2">Access Denied</h2>
                                    <p class="text-gray-400 mb-6">Your Discord account is not authorized to access the admin panel.</p>
                                    <a href="/admin" class="inline-block bg-indigo-600 hover:bg-indigo-700 px-6 py-2 rounded-lg font-medium transition-colors">Return to Login</a>
                                </div>
                            </body>
                            </html>
                        `);
                    }
                }
            );
            discordAuthEnabled = true;
            console.log('✅ Discord OAuth2 enabled for admin panel');
        } catch (err) {
            console.warn('⚠️ Could not load passport modules – Discord login will be unavailable. Run `npm install passport passport-discord` to enable it.', err.message);
            discordAuthEnabled = false;
        }
    } else {
        console.log('ℹ️ Discord OAuth2 not configured – password login only');
    }

    // ========== ADMIN ROUTES ==========
    app.get('/admin/login', (req, res) => res.redirect('/admin'));

    app.get('/admin', (req, res) => {
        if (!isAuthenticated(req)) {
            // Login page – show Discord button only if enabled
            return res.send(`<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Admin Login</title>
                <link rel="icon" type="image/svg+xml" href="/icons/admin-favicon.svg">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <script src="https://cdn.tailwindcss.com"></script>
                <style>body{font-family:'Inter',sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);}</style>
            </head>
            <body class="min-h-screen flex items-center justify-center px-4">
                <div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-700/50">
                    <div class="flex justify-center mb-6">
                        <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-8 h-8 text-white"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                    </div>
                    <h2 class="text-2xl font-bold text-center text-white mb-2">Admin Access</h2>
                    <p class="text-center text-gray-400 mb-6">Please authenticate to continue</p>
                    <form action="/admin/login" method="POST" class="space-y-4">
                        <input type="password" name="passcode" placeholder="Enter passcode" autofocus class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <button type="submit" class="w-full bg-[#5865F2] hover:bg-[#4752C4] py-2 rounded-lg font-medium transition-colors shadow-lg">Login with Password</button>
                    </form>
                    ${discordAuthEnabled ? `
                    <div class="relative my-6"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-600"></div></div><div class="relative flex justify-center text-sm"><span class="px-2 bg-gray-800/50 text-gray-400">or</span></div></div>
                    <a href="/admin/auth/discord" class="flex items-center justify-center w-full bg-[#5865F2] hover:bg-[#4752C4] py-2 rounded-lg font-medium transition-colors shadow-lg gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" class="w-5 h-5"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 8.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.077.077 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1275c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-10.6739-3.5485-15.2276a.061.061 0 00-.0312-.0286zM8.02 15.331c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1569 2.4189 0 1.3332-.9555 2.419-2.1569 2.419zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1569 2.4189 0 1.3332-.946 2.419-2.1569 2.419z"/></svg>
                        Login with Discord
                    </a>
                    ` : ''}
                </div>
            </body>
            </html>`);
        }

        // ========== AUTHENTICATED DASHBOARD ==========
        const userList = Object.entries(userMappings).map(([id, data]) => ({ id, name: data.name, avatar: data.avatar }));
        const recentMessages = messages.slice(-50).reverse();
        const allRooms = roomsModule.getAllRooms();

        let html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
            <title>Whisper – Admin</title>
            <link rel="icon" type="image/svg+xml" href="/icons/admin-favicon.svg">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <script src="/socket.io/socket.io.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body { font-family: 'Inter', system-ui, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); }
                ::-webkit-scrollbar { width: 8px; height: 8px; }
                ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
                ::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 10px; }
                .card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
                .card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); }
                .message-card { transition: all 0.2s ease; }
                .message-card:hover { background: rgba(51, 65, 85, 0.8); }
                .avatar-img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
                @media (max-width: 640px) {
                    .container { padding-left: 1rem; padding-right: 1rem; }
                    .stat-card { min-width: 100px; }
                }
                #toast-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .toast {
                    background: #1e293b;
                    border-left: 4px solid;
                    border-radius: 8px;
                    padding: 12px 20px;
                    min-width: 250px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    animation: slideIn 0.3s ease;
                    backdrop-filter: blur(8px);
                    color: white;
                }
                .toast.success { border-left-color: #22c55e; }
                .toast.error { border-left-color: #ef4444; }
                .toast.info { border-left-color: #3b82f6; }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .fade-out { animation: fadeOut 0.3s ease forwards; }
                @keyframes fadeOut {
                    to { opacity: 0; transform: translateX(100%); }
                }
                .chat-btn { background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.5); transition: all 0.2s; }
                .chat-btn:hover { background: rgba(99, 102, 241, 0.4); border-color: #6366f1; transform: scale(0.98); }
            </style>
        </head>
        <body>
            <div id="toast-container"></div>
            <div class="container mx-auto px-4 py-6 max-w-7xl">
                <!-- Header -->
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-5 h-5 text-white"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                        <div><h1 class="text-2xl font-bold bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">Admin Dashboard</h1></div>
                    </div>
                    <a href="/chat" class="chat-btn px-4 py-2 rounded-lg text-indigo-300 hover:text-white transition-colors flex items-center gap-2 shadow-md">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <span class="hidden sm:inline">Go to Chat</span>
                    </a>
                </div>

                <!-- Stats -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                        <div class="flex items-center justify-between">
                            <div><p class="text-gray-400 text-sm">Total Messages</p><p class="text-2xl font-bold text-white">${messages.length}</p></div>
                            <div class="w-12 h-12 rounded-full bg-indigo-900/50 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-indigo-400"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></div>
                        </div>
                    </div>
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                        <div class="flex items-center justify-between">
                            <div><p class="text-gray-400 text-sm">Total Users</p><p class="text-2xl font-bold text-white">${userList.length}</p></div>
                            <div class="w-12 h-12 rounded-full bg-purple-900/50 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-purple-400"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg></div>
                        </div>
                    </div>
                    <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 card">
                        <div class="flex items-center justify-between">
                            <div><p class="text-gray-400 text-sm">Recent Activity</p><p class="text-2xl font-bold text-white">${recentMessages.length}</p></div>
                            <div class="w-12 h-12 rounded-full bg-green-900/50 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-6 h-6 text-green-400"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                        </div>
                    </div>
                </div>

                <!-- Recent Messages -->
                <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden card mb-8">
                    <div class="p-5 border-b border-gray-700/50 bg-gray-800/60"><h2 class="text-lg font-semibold text-white">📩・Recent Messages</h2></div>
                    <div class="p-4 max-h-96 overflow-y-auto">`;
        if (recentMessages.length === 0) html += '<div class="text-center py-8 text-gray-400">No messages yet.</div>';
        else {
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
                            <div class="message-card bg-gray-800/60 rounded-lg p-3 mb-3 border border-gray-700/30" data-message-id="${m.id}">
                                <div class="flex justify-between items-start mb-1"><span class="font-medium text-indigo-300 text-sm">${escapeHtml(m.senderName)}</span><span class="text-xs text-gray-500">${new Date(m.timestamp).toLocaleString()}</span></div>
                                <div class="text-gray-300 text-sm mb-2 break-words">${escapeHtml(m.text || '')}</div>
                                ${fileHtml}
                                <button class="delete-msg-btn text-red-400 hover:text-red-300 text-xs transition-colors" data-id="${m.id}">🗑️ Delete</button>
                            </div>`;
            }
        }
        html += `</div></div>

                <!-- Rooms Card -->
                <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border ${ROOMS_ENABLED ? 'border-gray-700/50' : 'border-gray-600/50 bg-gray-800/20'} p-5 card mb-8">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                        <h2 class="text-lg font-semibold text-white">🏠・Rooms ${!ROOMS_ENABLED ? '<span class="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">Inactive</span>' : ''}</h2>
                        ${ROOMS_ENABLED ? '<button id="createRoomBtn" class="bg-green-600 hover:bg-green-700 px-3 py-1 rounded-lg text-sm transition-colors shadow">+ New Room</button>' : '<button class="bg-gray-600 cursor-not-allowed px-3 py-1 rounded-lg text-sm opacity-50" disabled>+ New Room (Disabled)</button>'}
                    </div>`;
        if (ROOMS_ENABLED) {
            html += `<div id="roomsList" class="space-y-2 max-h-64 overflow-y-auto">`;
            for (const [name, room] of Object.entries(allRooms)) {
                html += `
                    <div class="bg-gray-800/60 rounded-lg p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border border-gray-700/30">
                        <div class="flex-1"><div class="font-medium text-white">${escapeHtml(name)}</div><div class="text-xs text-gray-400 mt-1">${room.hasPassword ? '🔒 Password protected' : '🔓 Public'}</div></div>
                        <div class="flex gap-2"><button class="edit-room-btn bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded-lg text-sm transition-colors" data-room="${name}">Edit</button><button class="delete-room-btn bg-red-700 hover:bg-red-800 px-3 py-1 rounded-lg text-sm transition-colors" data-room="${name}">Delete</button></div>
                    </div>`;
            }
            html += `</div>`;
        } else {
            html += `<div class="text-center py-8 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-12 h-12 mx-auto mb-2 opacity-50"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg><p>This feature is temporarily disabled.</p><p class="text-xs mt-1">I know I'm just being lazy...</p></div>`;
        }
        html += `</div>

                <!-- Two column: Users & Identity -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden card">
                        <div class="p-5 border-b border-gray-700/50 bg-gray-800/60"><h2 class="text-lg font-semibold text-white">👥・Active Users (<span id="usersCount">${userList.length}</span>)</h2></div>
                        <div class="p-4 max-h-[400px] overflow-y-auto"><div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="usersGrid">`;
        for (const u of userList) {
            html += `
                            <div class="bg-gray-800/60 rounded-lg p-3 flex items-center gap-3 border border-gray-700/30">
                                <img src="${escapeHtml(u.avatar)}" class="avatar-img w-10 h-10 rounded-full border border-gray-600" alt="avatar">
                                <div class="flex-1"><p class="font-medium text-gray-200">${escapeHtml(u.name)}</p><p class="text-xs text-gray-500">${u.id}</p></div>
                            </div>`;
        }
        html += `</div></div></div>

                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 p-5 card">
                        <h2 class="text-lg font-semibold text-white mb-4">🔄・Change Identity</h2>
                        <div class="space-y-4">
                            <input type="text" id="identityUserId" placeholder="User ID" class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <div class="flex flex-col sm:flex-row gap-2">
                                <select id="presetSelect" class="flex-1 px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="Arsan">Arsan</option><option value="ArGzf">ArGzf</option><option value="Admin">Admin</option></select>
                                <button id="applyPresetBtn" class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">Apply Preset</button>
                            </div>
                            <div class="flex flex-col sm:flex-row gap-2">
                                <input type="text" id="customNameInput" placeholder="Custom name" class="flex-1 px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <input type="text" id="customAvatarInput" placeholder="Avatar URL (optional)" class="flex-1 px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <button id="applyCustomBtn" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">Apply Custom</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Broadcast & Danger Zone -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-gray-700/50 p-5 card">
                        <h2 class="text-lg font-semibold text-white mb-4">📢・Broadcast Message</h2>
                        <div class="space-y-3"><textarea id="broadcastText" rows="3" placeholder="Enter your announcement..." class="w-full px-4 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea><button id="broadcastBtn" class="w-full bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">Send Broadcast</button></div>
                    </div>
                    <div class="bg-gray-800/40 backdrop-blur-sm rounded-xl border border-red-500/30 p-5 card">
                        <h2 class="text-lg font-semibold text-white mb-4">⚠️・Danger Zone</h2>
                        <div class="flex flex-col sm:flex-row gap-3"><button id="purgeMessagesBtn" class="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">Purge All Messages</button><button id="logoutBtn" class="flex-1 bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-lg">Logout</button></div>
                    </div>
                </div>
            </div>

            <script>
                const socket = io();
                function showToast(message, type) {
                    const container = document.getElementById('toast-container');
                    const toast = document.createElement('div');
                    toast.className = \`toast \${type}\`;
                    toast.innerText = message;
                    container.appendChild(toast);
                    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
                }
                document.querySelectorAll('.delete-msg-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const id = btn.dataset.id;
                        if (confirm('Delete this message?')) {
                            const res = await fetch('/admin/delete-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                            if (res.ok) { showToast('Message deleted', 'success'); btn.closest('.message-card').remove(); }
                            else showToast('Failed to delete message', 'error');
                        }
                    });
                });
                const createRoomBtn = document.getElementById('createRoomBtn');
                if (createRoomBtn) createRoomBtn.addEventListener('click', async () => {
                    const name = prompt('Room name:');
                    if (name) {
                        const res = await fetch('/admin/create-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                        if (res.ok) { showToast('Room created', 'success'); location.reload(); }
                        else showToast('Failed to create room', 'error');
                    }
                });
                document.querySelectorAll('.edit-room-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const oldName = btn.dataset.room;
                        const newName = prompt('New room name:', oldName);
                        if (newName && newName !== oldName) {
                            const res = await fetch('/admin/edit-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldName, newName }) });
                            if (res.ok) { showToast('Room renamed', 'success'); location.reload(); }
                            else showToast('Failed to rename room', 'error');
                        }
                    });
                });
                document.querySelectorAll('.delete-room-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const name = btn.dataset.room;
                        if (confirm('Delete this room?')) {
                            const res = await fetch('/admin/delete-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                            if (res.ok) { showToast('Room deleted', 'success'); location.reload(); }
                            else showToast('Failed to delete room', 'error');
                        }
                    });
                });
                document.getElementById('applyPresetBtn')?.addEventListener('click', async () => {
                    const userId = document.getElementById('identityUserId').value;
                    const name = document.getElementById('presetSelect').value;
                    if (!userId) { showToast('Please enter a User ID', 'error'); return; }
                    const res = await fetch('/admin/rename-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, name }) });
                    if (res.ok) { showToast('Identity updated', 'success'); setTimeout(() => location.reload(), 1000); }
                    else showToast('Failed to update identity', 'error');
                });
                document.getElementById('applyCustomBtn')?.addEventListener('click', async () => {
                    const userId = document.getElementById('identityUserId').value;
                    const name = document.getElementById('customNameInput').value;
                    const avatar = document.getElementById('customAvatarInput').value;
                    if (!userId) { showToast('Please enter a User ID', 'error'); return; }
                    if (!name && !avatar) { showToast('Please enter a name or avatar URL', 'error'); return; }
                    const res = await fetch('/admin/change-identity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, name, avatar }) });
                    if (res.ok) { showToast('Identity updated', 'success'); setTimeout(() => location.reload(), 1000); }
                    else showToast('Failed to update identity', 'error');
                });
                document.getElementById('broadcastBtn')?.addEventListener('click', async () => {
                    const message = document.getElementById('broadcastText').value;
                    if (!message) { showToast('Please enter a message', 'error'); return; }
                    const res = await fetch('/admin/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
                    if (res.ok) { showToast('Broadcast sent', 'success'); document.getElementById('broadcastText').value = ''; }
                    else showToast('Failed to send broadcast', 'error');
                });
                document.getElementById('purgeMessagesBtn')?.addEventListener('click', async () => {
                    if (confirm('⚠️ WARNING: This will delete ALL messages. Are you absolutely sure?')) {
                        const res = await fetch('/admin/purge-messages', { method: 'POST' });
                        if (res.ok) { showToast('All messages purged', 'success'); setTimeout(() => location.reload(), 1000); }
                        else showToast('Failed to purge messages', 'error');
                    }
                });
                document.getElementById('logoutBtn')?.addEventListener('click', async () => {
                    const res = await fetch('/admin/logout', { method: 'POST' });
                    if (res.ok) location.reload();
                });
            </script>
        </body>
        </html>`;
        res.send(html);
    });

    // ========== POST ROUTES ==========
    app.post('/admin/login', (req, res) => {
        const { passcode } = req.body;
        if (passcode === ADMIN_PASSCODE) {
            req.session.authenticated = true;
            req.session.authMethod = 'password';
            sendAdminLog('Password Login Success', 'Logged in via password', req);
            res.redirect('/admin');
        } else {
            sendAdminLog('Password Login Failed', 'Invalid passcode attempt', req);
            res.send('<h3>Invalid passcode. <a href="/admin">Try again</a></h3>');
        }
    });

    app.post('/admin/delete-message', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        const { id } = req.body;
        const idx = messages.findIndex(m => m.id === id);
        if (idx !== -1) {
            const deleted = messages.splice(idx, 1)[0];
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
        const { userId, name } = req.body;
        if (userId && name && userMappings[userId]) {
            const oldName = userMappings[userId].name;
            userMappings[userId].name = name;
            saveUserMappings();
            io.emit('force-reload-identity', { userId });
            sendAdminLog('Rename User', `Renamed user ${userId} from "${oldName}" to "${name}"`, req);
            res.json({ success: true });
        } else res.status(400).json({ success: false, error: 'Invalid user ID or name' });
    });

    app.post('/admin/change-identity', (req, res) => {
        if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
        const { userId, name, avatar } = req.body;
        if (userId && userMappings[userId]) {
            if (name) userMappings[userId].name = name;
            if (avatar) userMappings[userId].avatar = avatar;
            saveUserMappings();
            io.emit('force-reload-identity', { userId });
            sendAdminLog('Change Identity', `Changed identity for user ${userId} - Name: ${name}, Avatar: ${avatar}`, req);
            res.json({ success: true });
        } else res.status(400).json({ success: false, error: 'Invalid user ID' });
    });

    app.post('/admin/logout', (req, res) => {
        const authMethod = req.session.authMethod;
        if (authMethod === 'discord') sendAdminLog('Discord Logout', 'Logged out via Discord', req);
        else sendAdminLog('Password Logout', 'Logged out via password', req);
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
