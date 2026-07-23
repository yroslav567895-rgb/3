const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'moderutills-default-secret';

app.use(express.json());
app.use(cookieParser(SESSION_SECRET));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function readJSON(file, def) {
    try {
        if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(def, null, 2)); return def; }
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { return def; }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return salt + ':' + hash;
}

function verifyPassword(password, stored) {
    const salt = stored.split(':')[0];
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return stored === salt + ':' + hash;
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = 'MA-';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars[crypto.randomInt(chars.length)];
    }
    return key;
}

let users = readJSON(USERS_FILE, {});
let keys = readJSON(KEYS_FILE, {});
let sessions = readJSON(SESSIONS_FILE, {});
let activity = readJSON(ACTIVITY_FILE, []);

function saveAll() {
    writeJSON(USERS_FILE, users);
    writeJSON(KEYS_FILE, keys);
    writeJSON(SESSIONS_FILE, sessions);
    writeJSON(ACTIVITY_FILE, activity);
}

function initSuperAdmin() {
    if (!users['unluck']) {
        users['unluck'] = {
            password: hashPassword('Logan20241'),
            role: 'superadmin',
            createdAt: new Date().toISOString(),
            banned: false
        };
        saveAll();
    }
}
initSuperAdmin();

function getSession(req) {
    const token = req.signedCookies.session;
    if (token && sessions[token]) {
        const s = sessions[token];
        if (s.expiresAt > Date.now()) {
            s.lastActivity = Date.now();
            return s;
        }
        delete sessions[token]; saveAll();
    }
    return null;
}

function requireAuth(req, res, next) {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    req.session = session;
    req.username = session.username;
    next();
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        const user = users[req.username];
        if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return res.status(403).json({ error: 'Access denied' });
        next();
    });
}

function requireSuperAdmin(req, res, next) {
    requireAuth(req, res, () => {
        const user = users[req.username];
        if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Access denied' });
        next();
    });
}

function logActivity(username, action, details) {
    activity.push({ username, action, details, timestamp: new Date().toISOString() });
    if (activity.length > 1000) activity = activity.slice(-1000);
    saveAll();
}

setInterval(() => {
    let changed = false;
    for (const [t, s] of Object.entries(sessions)) { if (s.expiresAt < Date.now()) { delete sessions[t]; changed = true; } }
    if (changed) saveAll();
}, 60000);

// Register
app.post('/api/register', (req, res) => {
    const { username, password, remember } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username too short (min 3 chars)' });
    if (password.length < 4) return res.status(400).json({ error: 'Password too short (min 4 chars)' });
    if (users[username]) return res.status(400).json({ error: 'Username already exists' });
    users[username] = { password: hashPassword(password), role: 'not_user', createdAt: new Date().toISOString(), banned: false };
    saveAll();
    const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const token = generateSessionToken();
    sessions[token] = { username, role: 'not_user', createdAt: Date.now(), expiresAt: Date.now() + maxAge, lastActivity: Date.now() };
    saveAll();
    res.cookie('session', token, { signed: true, maxAge, httpOnly: true, sameSite: 'lax' });
    logActivity(username, 'REGISTER', 'User registered');
    res.json({ success: true, username, role: 'not_user' });
});

// Auth
app.post('/api/login', (req, res) => {
    const { username, password, remember } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = users[username];
    if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });
    const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const token = generateSessionToken();
    sessions[token] = { username, role: user.role, createdAt: Date.now(), expiresAt: Date.now() + maxAge, lastActivity: Date.now() };
    saveAll();
    res.cookie('session', token, { signed: true, maxAge, httpOnly: true, sameSite: 'lax' });
    res.json({ success: true, username, role: user.role });
});

app.post('/api/logout', (req, res) => {
    const token = req.signedCookies.session;
    if (token && sessions[token]) { delete sessions[token]; saveAll(); }
    res.clearCookie('session');
    res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
    const user = users[req.username];
    res.json({ username: req.username, role: user.role, createdAt: user.createdAt, banned: user.banned || false });
});

// License keys
app.post('/api/claim-key', requireAuth, (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'Key required' });
    const license = keys[key];
    if (!license) return res.status(404).json({ error: 'Invalid key' });
    if (license.claimedBy) return res.status(400).json({ error: 'Key already claimed' });
    if (new Date(license.expiresAt) < new Date()) return res.status(400).json({ error: 'Key expired' });
    license.claimedBy = req.username;
    license.claimedAt = new Date().toISOString();
    saveAll();
    res.json({ success: true, key: license.key, createdAt: license.createdAt, expiresAt: license.expiresAt });
});

app.get('/api/my-keys', requireAuth, (req, res) => {
    res.json(Object.values(keys).filter(k => k.claimedBy === req.username).map(k => ({
        key: k.key, createdAt: k.createdAt, expiresAt: k.expiresAt, hwid: k.hwid || null, active: k.active !== false
    })));
});

app.get('/api/verify-key', (req, res) => {
    const { key, hwid, username } = req.query;
    if (!key) return res.status(400).json({ error: 'Key required' });
    const license = keys[key];
    if (!license) return res.json({ success: false, error: 'Key not found' });
    if (!license.active) return res.json({ success: false, error: 'Key deactivated' });
    if (new Date(license.expiresAt) < new Date()) return res.json({ success: false, error: 'Key expired' });
    if (license.claimedBy && username && license.claimedBy !== username) return res.json({ success: false, error: 'Key not assigned to this user' });
    if (hwid) {
        if (!license.hwid) { license.hwid = hwid; saveAll(); }
        else if (license.hwid !== hwid) return res.json({ success: false, error: 'HWID mismatch' });
    }
    res.json({ success: true, key: license.key, createdAt: license.createdAt, expiresAt: license.expiresAt, username: license.claimedBy });
});

app.get('/api/download-mod', (req, res) => {
    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.jar'));
    if (!files.length) return res.status(404).json({ error: 'No mod file' });
    res.download(path.join(DOWNLOADS_DIR, files.sort().reverse()[0]));
});

app.get('/api/mod-version', (req, res) => {
    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.jar'));
    if (!files.length) return res.json({ version: null, filename: null });
    const f = files.sort().reverse()[0];
    res.json({ version: f.replace('.jar', '').replace('ModerUtills-', ''), filename: f });
});

// Admin
app.get('/api/admin/users', requireAdmin, (req, res) => {
    res.json(Object.entries(users).map(([u, d]) => ({ username: u, role: d.role, createdAt: d.createdAt, banned: d.banned || false })));
});

app.post('/api/admin/create-user', requireSuperAdmin, (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Required' });
    if (users[username]) return res.status(400).json({ error: 'Exists' });
    users[username] = { password: hashPassword(password), role: role || 'not_user', createdAt: new Date().toISOString(), banned: false };
    saveAll();
    logActivity(req.username, 'USER_CREATED', `Created: ${username}, role: ${role || 'not_user'}`);
    res.json({ success: true });
});

app.post('/api/admin/set-role', requireAuth, (req, res) => {
    const { targetUsername, newRole } = req.body;
    if (!targetUsername || !newRole) return res.status(400).json({ error: 'Required' });
    const target = users[targetUsername];
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'superadmin') return res.status(403).json({ error: 'Cannot modify superadmin' });

    const caller = users[req.username];
    if (!caller) return res.status(403).json({ error: 'Access denied' });

    const validRoles = ['superadmin', 'admin', 'user', 'not_user'];
    if (!validRoles.includes(newRole)) return res.status(400).json({ error: 'Invalid role' });

    if (caller.role === 'superadmin') {
        // Superadmin can set any role
        target.role = newRole;
    } else if (caller.role === 'admin') {
        // Admin can only toggle between user and not_user
        if (newRole !== 'user' && newRole !== 'not_user') {
            return res.status(403).json({ error: 'Admin can only set user/not_user role' });
        }
        target.role = newRole;
    } else {
        return res.status(403).json({ error: 'Access denied' });
    }
    saveAll();
    logActivity(req.username, 'ROLE_CHANGED', `${targetUsername} → ${newRole}`);
    res.json({ success: true, username: targetUsername, role: target.role });
});

app.post('/api/admin/user-key', requireAdmin, (req, res) => {
    const { targetUsername, durationDays } = req.body;
    if (!targetUsername) return res.status(400).json({ error: 'Username required' });
    if (!users[targetUsername]) return res.status(404).json({ error: 'User not found' });
    const days = durationDays || 30;
    const key = generateLicenseKey();
    const now = new Date();
    const expiresAt = new Date(now); expiresAt.setDate(expiresAt.getDate() + days);
    keys[key] = { key, active: true, claimedBy: targetUsername, claimedAt: now.toISOString(), hwid: null, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
    saveAll();
    logActivity(req.username, 'USER_KEY_CREATED', `Key for ${targetUsername}, ${days} days`);
    res.json({ success: true, key, username: targetUsername, createdAt: keys[key].createdAt, expiresAt: keys[key].expiresAt });
});

// Для мода: пакетная проверка ролей (значки в табе)
app.get('/api/batch-user-roles', (req, res) => {
    const raw = req.query.usernames;
    if (!raw) return res.json({});
    const names = raw.split(',').filter(Boolean);
    const result = {};
    for (const name of names) {
        const user = users[name];
        if (user && !user.banned) {
            const hasActiveKey = Object.values(keys).some(k =>
                k.claimedBy === name && k.active !== false && new Date(k.expiresAt) > new Date()
            );
            if (hasActiveKey) result[name] = user.role;
            else result[name] = 'no_key';
        } else {
            result[name] = 'not_user';
        }
    }
    res.json(result);
});

// Для мода: проверка роли и статуса пользователя
app.get('/api/user-role', (req, res) => {
    const { username } = req.query;
    if (!username || !users[username]) return res.json({ success: false, role: 'not_user', error: 'User not found' });
    const user = users[username];
    const hasActiveKey = Object.values(keys).some(k =>
        k.claimedBy === username &&
        k.active !== false &&
        new Date(k.expiresAt) > new Date()
    );
    res.json({
        success: true,
        username,
        role: user.role,
        banned: user.banned || false,
        hasActiveKey
    });
});

app.post('/api/admin/ban-user', requireAdmin, (req, res) => {
    const { username, ban } = req.body;
    if (!users[username]) return res.status(404).json({ error: 'Not found' });
    if (users[username].role === 'superadmin') return res.status(403).json({ error: 'Cannot ban superadmin' });
    users[username].banned = ban !== false; saveAll();
    res.json({ success: true, banned: users[username].banned });
});

app.post('/api/admin/create-key', requireAdmin, (req, res) => {
    const days = req.body.durationDays || 30;
    const key = generateLicenseKey();
    const now = new Date();
    const expiresAt = new Date(now); expiresAt.setDate(expiresAt.getDate() + days);
    keys[key] = { key, active: true, claimedBy: null, claimedAt: null, hwid: null, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
    saveAll();
    res.json({ success: true, key, createdAt: keys[key].createdAt, expiresAt: keys[key].expiresAt });
});

app.get('/api/admin/keys', requireAdmin, (req, res) => res.json(Object.values(keys)));

app.post('/api/admin/toggle-key', requireAdmin, (req, res) => {
    if (!keys[req.body.key]) return res.status(404).json({ error: 'Not found' });
    keys[req.body.key].active = req.body.active !== false; saveAll();
    res.json({ success: true });
});

app.post('/api/admin/delete-key', requireAdmin, (req, res) => {
    const { key } = req.body;
    if (!key || !keys[key]) return res.status(404).json({ error: 'Key not found' });
    const owner = keys[key].claimedBy || 'none';
    delete keys[key];
    saveAll();
    logActivity(req.username, 'KEY_DELETED', `Deleted key for ${owner}`);
    res.json({ success: true });
});

app.post('/api/admin/regenerate-key', requireAdmin, (req, res) => {
    const { key } = req.body;
    if (!key || !keys[key]) return res.status(404).json({ error: 'Key not found' });
    const oldKey = keys[key];
    const newKeyStr = generateLicenseKey();
    const now = new Date();
    const oldExpires = new Date(oldKey.expiresAt);
    const remainingMs = oldExpires.getTime() - now.getTime();
    const remainingDays = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
    const newExpires = new Date(now);
    newExpires.setDate(newExpires.getDate() + remainingDays);
    keys[newKeyStr] = {
        key: newKeyStr,
        active: true,
        claimedBy: oldKey.claimedBy || null,
        claimedAt: oldKey.claimedAt,
        hwid: oldKey.hwid || null,
        createdAt: now.toISOString(),
        expiresAt: newExpires.toISOString()
    };
    delete keys[key];
    saveAll();
    logActivity(req.username, 'KEY_REGENERATED', `Regenerated key for ${oldKey.claimedBy || 'unassigned'}`);
    res.json({ success: true, key: newKeyStr, expiresAt: newExpires.toISOString() });
});

app.get('/api/admin/activity', requireAdmin, (req, res) => res.json(activity.slice(-100)));

app.get('/api/admin/online-count', requireAdmin, (req, res) => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const online = Object.values(sessions).filter(s => s.lastActivity > fiveMinAgo);
    res.json({ count: online.length, users: online.map(s => s.username) });
});

let ircMessages = [];
let ircIdCounter = 0;
const IRC_FILE = path.join(DATA_DIR, 'irc.json');

function loadIrc() {
    try { if (fs.existsSync(IRC_FILE)) ircMessages = JSON.parse(fs.readFileSync(IRC_FILE, 'utf8')); } catch (e) {}
    if (ircMessages.length > 0) ircIdCounter = Math.max(...ircMessages.map(m => m.id));
}
function saveIrc() {
    fs.writeFileSync(IRC_FILE, JSON.stringify(ircMessages.slice(-200), null, 2));
}
loadIrc();

app.post('/api/irc/send', (req, res) => {
    const { username, message } = req.body;
    if (!username || !message || message.length > 500) return res.status(400).json({ success: false });
    const user = users[username];
    if (!user || user.banned) return res.status(403).json({ success: false, error: 'No access' });
    const hasActiveKey = Object.values(keys).some(k =>
        k.claimedBy === username && k.active !== false && new Date(k.expiresAt) > new Date()
    );
    if (!hasActiveKey || (user.role !== 'user' && user.role !== 'admin' && user.role !== 'superadmin'))
        return res.status(403).json({ success: false, error: 'Insufficient role' });
    const entry = { id: ++ircIdCounter, username, message, timestamp: Date.now() };
    ircMessages.push(entry);
    if (ircMessages.length > 200) ircMessages = ircMessages.slice(-200);
    saveIrc();
    res.json({ success: true, id: entry.id });
});

app.get('/api/irc/messages', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    res.json({ success: true, messages: ircMessages.filter(m => m.id > since) });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`ModerUtills Website running on http://localhost:${PORT}`);
    console.log(`Super admin: unluck / Logan20241`);
});
