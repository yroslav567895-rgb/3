const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

let MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI && !MONGODB_URI.includes('tls=')) {
    MONGODB_URI += (MONGODB_URI.includes('?') ? '&' : '?') + 'tls=true&tlsAllowInvalidCertificates=true&retryWrites=false';
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

let client = null;
let db = null;
let useMongo = false;

function readJSON(file, def) {
    try {
        if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(def, null, 2)); return def; }
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { return def; }
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function connect() {
    if (!MONGODB_URI) {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        return false;
    }
    try {
        client = new MongoClient(MONGODB_URI, {
            tls: true,
            tlsInsecure: true
        });
        await client.connect();
        db = client.db('moderutills');
        useMongo = true;
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('keys').createIndex({ key: 1 }, { unique: true });
        await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
        console.log('Connected to MongoDB');
        return true;
    } catch (e) {
        console.error('MongoDB connection failed:', e.message);
        return false;
    }
}

// Load all data into memory (either from MongoDB or JSON files)
async function loadAll() {
    const data = { users: {}, keys: {}, sessions: {}, activity: [], ircMessages: [], ircIdCounter: 0 };
    if (useMongo) {
        const usersArr = await db.collection('users').find().toArray();
        for (const u of usersArr) data.users[u.username] = { password: u.password, role: u.role, createdAt: u.createdAt, banned: u.banned || false };
        const keysArr = await db.collection('keys').find().toArray();
        for (const k of keysArr) data.keys[k.key] = { key: k.key, active: k.active, claimedBy: k.claimedBy, claimedAt: k.claimedAt, hwid: k.hwid, createdAt: k.createdAt, expiresAt: k.expiresAt };
        const sessArr = await db.collection('sessions').find().toArray();
        for (const s of sessArr) data.sessions[s.token] = { username: s.username, role: s.role, createdAt: s.createdAt, expiresAt: s.expiresAt, lastActivity: s.lastActivity };
        const actArr = await db.collection('activity').find().sort({ _id: -1 }).limit(100).toArray();
        data.activity = actArr.map(a => ({ username: a.username, action: a.action, details: a.details, timestamp: a.timestamp }));
        const ircArr = await db.collection('irc').find().toArray();
        data.ircMessages = ircArr;
        data.ircIdCounter = ircArr.length > 0 ? Math.max(...ircArr.map(m => m.id)) : 0;
    } else {
        data.users = readJSON(path.join(DATA_DIR, 'users.json'), {});
        data.keys = readJSON(path.join(DATA_DIR, 'keys.json'), {});
        data.sessions = readJSON(path.join(DATA_DIR, 'sessions.json'), {});
        data.activity = readJSON(path.join(DATA_DIR, 'activity.json'), []);
        const ircRaw = readJSON(path.join(DATA_DIR, 'irc.json'), []);
        data.ircMessages = Array.isArray(ircRaw) ? ircRaw : [];
        data.ircIdCounter = data.ircMessages.length > 0 ? Math.max(...data.ircMessages.map(m => m.id)) : 0;
    }
    return data;
}

// Sync helpers (called after in-memory changes)
async function saveUsers(users) {
    if (useMongo) {
        await db.collection('users').deleteMany({});
        const docs = Object.entries(users).map(([username, u]) => ({ username, password: u.password, role: u.role, createdAt: u.createdAt, banned: u.banned || false }));
        if (docs.length) await db.collection('users').insertMany(docs);
        return;
    }
    writeJSON(path.join(DATA_DIR, 'users.json'), users);
}
async function saveKeys(keys) {
    if (useMongo) {
        await db.collection('keys').deleteMany({});
        const docs = Object.values(keys);
        if (docs.length) await db.collection('keys').insertMany(docs);
        return;
    }
    writeJSON(path.join(DATA_DIR, 'keys.json'), keys);
}
async function saveSessions(sessions) {
    if (useMongo) {
        await db.collection('sessions').deleteMany({});
        const docs = Object.entries(sessions).map(([token, s]) => ({ token, username: s.username, role: s.role, createdAt: s.createdAt, expiresAt: s.expiresAt, lastActivity: s.lastActivity }));
        if (docs.length) await db.collection('sessions').insertMany(docs);
        return;
    }
    writeJSON(path.join(DATA_DIR, 'sessions.json'), sessions);
}
async function addActivityEntry(entry) {
    if (useMongo) {
        await db.collection('activity').insertOne(entry);
        return;
    }
    const file = path.join(DATA_DIR, 'activity.json');
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    arr.push(entry);
    if (arr.length > 1000) arr = arr.slice(-1000);
    writeJSON(file, arr);
}
async function saveIrc(ircMessages) {
    if (useMongo) {
        await db.collection('irc').deleteMany({});
        if (ircMessages.length) await db.collection('irc').insertMany(ircMessages);
        return;
    }
    writeJSON(path.join(DATA_DIR, 'irc.json'), ircMessages);
}

module.exports = { connect, loadAll, saveUsers, saveKeys, saveSessions, addActivityEntry, saveIrc, isMongo: () => useMongo };
