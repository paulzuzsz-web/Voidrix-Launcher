'use strict';

/**
 * Konten-Verwaltung des Voidrix Launchers.
 *
 * - Passwörter werden niemals im Klartext gespeichert, sondern als
 *   scrypt-Hash mit zufaelligem Salt.
 * - Nach dem Login wird ein Session-Token erzeugt und gespeichert;
 *   beim nächsten Start ist man dadurch automatisch wieder angemeldet.
 * - Der Admin-Account wird beim ersten Start automatisch angelegt.
 */

const crypto = require('crypto');
const store = require('./store');

const ADMIN_USERNAME = 'adminpass';
const ADMIN_PROFILE_NAME = 'Admin';
const ADMIN_PASSWORD = 'PaulPass21.21';

const SESSION_DAYS = 180;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

const USERNAME_RE = /^[A-Za-z0-9._-]{3,20}$/;

const EMPTY_ACCOUNTS = { version: 1, users: [] };

/* --------------------------------------------------------------------- */
/* Passwörter                                                            */
/* --------------------------------------------------------------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2,
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/* --------------------------------------------------------------------- */
/* Datei-Zugriff                                                          */
/* --------------------------------------------------------------------- */

function readAccounts() {
  const data = store.readJson(store.accountsPath(), EMPTY_ACCOUNTS);
  if (!Array.isArray(data.users)) data.users = [];
  return data;
}

function writeAccounts(data) {
  return store.writeJson(store.accountsPath(), data);
}

function readSession() {
  return store.readJson(store.sessionPath(), null);
}

function writeSession(session) {
  return store.writeJson(store.sessionPath(), session);
}

function clearSession() {
  writeSession(null);
}

/* --------------------------------------------------------------------- */
/* Hilfen                                                                 */
/* --------------------------------------------------------------------- */

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

/** Die Version eines Users, die an das UI gehen darf (ohne Hashes). */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    profileName: user.profileName,
    role: user.role,
    avatar: user.avatar || '',
    accent: user.accent || '',
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
    isAdmin: user.role === 'admin',
  };
}

function findByUsername(data, username) {
  const key = String(username || '').trim().toLowerCase();
  return data.users.find((u) => String(u.username).toLowerCase() === key) || null;
}

function findById(data, id) {
  return data.users.find((u) => u.id === id) || null;
}

class AuthError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'AuthError';
    this.field = field || null;
  }
}

/* --------------------------------------------------------------------- */
/* Admin-Seed                                                             */
/* --------------------------------------------------------------------- */

/**
 * Legt den Admin-Account an, falls er noch nicht existiert.
 * Ein vorhandener Admin wird NICHT überschrieben (Passwortänderung bleibt).
 */
function ensureAdminAccount() {
  const data = readAccounts();
  if (findByUsername(data, ADMIN_USERNAME)) return publicUser(findByUsername(data, ADMIN_USERNAME));

  const admin = {
    id: newId('usr'),
    username: ADMIN_USERNAME,
    profileName: ADMIN_PROFILE_NAME,
    role: 'admin',
    passwordHash: hashPassword(ADMIN_PASSWORD),
    avatar: '',
    accent: '#8b5cf6',
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    sessionTokenHash: null,
    sessionExpiresAt: null,
  };
  data.users.unshift(admin);
  writeAccounts(data);
  console.log('[auth] Admin-Account angelegt (Benutzername: %s)', ADMIN_USERNAME);
  return publicUser(admin);
}

/* --------------------------------------------------------------------- */
/* Registrierung / Login                                                  */
/* --------------------------------------------------------------------- */

function validateRegistration({ username, profileName, password, passwordRepeat }) {
  const u = String(username || '').trim();
  const p = String(profileName || '').trim();

  if (!u) throw new AuthError('Bitte einen Benutzernamen eingeben.', 'username');
  if (!USERNAME_RE.test(u)) {
    throw new AuthError(
      'Benutzername: 3-20 Zeichen, erlaubt sind Buchstaben, Zahlen, . _ -',
      'username'
    );
  }
  if (!p) throw new AuthError('Bitte einen Profilnamen eingeben.', 'profileName');
  if (p.length < 2 || p.length > 24) {
    throw new AuthError('Profilname muss 2-24 Zeichen lang sein.', 'profileName');
  }
  if (!password) throw new AuthError('Bitte ein Passwort eingeben.', 'password');
  if (String(password).length < 6) {
    throw new AuthError('Das Passwort muss mindestens 6 Zeichen haben.', 'password');
  }
  if (password !== passwordRepeat) {
    throw new AuthError('Die Passwörter stimmen nicht überein.', 'passwordRepeat');
  }
  return { username: u, profileName: p };
}

function register(payload) {
  const { username, profileName } = validateRegistration(payload);
  const data = readAccounts();

  if (findByUsername(data, username)) {
    throw new AuthError('Dieser Benutzername ist bereits vergeben.', 'username');
  }

  const user = {
    id: newId('usr'),
    username,
    profileName,
    role: data.users.length === 0 ? 'admin' : 'user',
    passwordHash: hashPassword(payload.password),
    avatar: '',
    accent: '#22d3ee',
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    sessionTokenHash: null,
    sessionExpiresAt: null,
  };
  data.users.push(user);
  writeAccounts(data);

  return startSession(user.id, payload.remember !== false);
}

function login({ username, password, remember }) {
  if (!username || !password) {
    throw new AuthError('Benutzername und Passwort eingeben.', 'username');
  }
  const data = readAccounts();
  const user = findByUsername(data, username);

  // Gleiche Fehlermeldung für "kein Konto" und "falsches Passwort".
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new AuthError('Benutzername oder Passwort ist falsch.', 'password');
  }
  return startSession(user.id, remember !== false);
}

/** Erzeugt Token + Session-Datei und gibt den öffentlichen User zurück. */
function startSession(userId, remember = true) {
  const data = readAccounts();
  const user = findById(data, userId);
  if (!user) throw new AuthError('Konto nicht gefunden.');

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();

  user.lastLoginAt = new Date().toISOString();
  user.sessionTokenHash = sha256(token);
  user.sessionExpiresAt = expiresAt;
  writeAccounts(data);

  if (remember) {
    writeSession({ userId: user.id, token, issuedAt: new Date().toISOString(), expiresAt });
  } else {
    clearSession();
  }
  return publicUser(user);
}

/** Prueft beim Start, ob eine gültige gespeicherte Anmeldung existiert. */
function restoreSession() {
  const session = readSession();
  if (!session || !session.userId || !session.token) return null;

  if (session.expiresAt && Date.parse(session.expiresAt) < Date.now()) {
    clearSession();
    return null;
  }

  const data = readAccounts();
  const user = findById(data, session.userId);
  if (!user || !user.sessionTokenHash) {
    clearSession();
    return null;
  }
  if (sha256(session.token) !== user.sessionTokenHash) {
    clearSession();
    return null;
  }
  return publicUser(user);
}

function logout(userId) {
  const data = readAccounts();
  const user = findById(data, userId);
  if (user) {
    user.sessionTokenHash = null;
    user.sessionExpiresAt = null;
    writeAccounts(data);
  }
  clearSession();
  return true;
}

/* --------------------------------------------------------------------- */
/* Profil / Verwaltung                                                    */
/* --------------------------------------------------------------------- */

function updateProfile(userId, { profileName, avatar, accent }) {
  const data = readAccounts();
  const user = findById(data, userId);
  if (!user) throw new AuthError('Konto nicht gefunden.');

  if (profileName !== undefined) {
    const p = String(profileName).trim();
    if (p.length < 2 || p.length > 24) {
      throw new AuthError('Profilname muss 2-24 Zeichen lang sein.', 'profileName');
    }
    user.profileName = p;
  }
  if (avatar !== undefined) user.avatar = String(avatar || '');
  if (accent !== undefined) user.accent = String(accent || '');

  writeAccounts(data);
  return publicUser(user);
}

function changePassword(userId, { currentPassword, password, passwordRepeat }) {
  const data = readAccounts();
  const user = findById(data, userId);
  if (!user) throw new AuthError('Konto nicht gefunden.');
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new AuthError('Das aktuelle Passwort ist falsch.', 'currentPassword');
  }
  if (String(password || '').length < 6) {
    throw new AuthError('Das neue Passwort muss mindestens 6 Zeichen haben.', 'password');
  }
  if (password !== passwordRepeat) {
    throw new AuthError('Die Passwörter stimmen nicht überein.', 'passwordRepeat');
  }
  user.passwordHash = hashPassword(password);
  writeAccounts(data);
  return publicUser(user);
}

function listUsers() {
  return readAccounts().users.map(publicUser);
}

function setRole(actingUserId, targetUserId, role) {
  if (!['admin', 'user'].includes(role)) throw new AuthError('Unbekannte Rolle.');
  const data = readAccounts();
  const target = findById(data, targetUserId);
  if (!target) throw new AuthError('Konto nicht gefunden.');

  if (target.id === actingUserId && role !== 'admin') {
    throw new AuthError('Du kannst dir die Adminrechte nicht selbst entziehen.');
  }
  if (target.username.toLowerCase() === ADMIN_USERNAME && role !== 'admin') {
    throw new AuthError('Der Haupt-Admin kann nicht herabgestuft werden.');
  }
  target.role = role;
  writeAccounts(data);
  return publicUser(target);
}

function deleteUser(actingUserId, targetUserId) {
  const data = readAccounts();
  const target = findById(data, targetUserId);
  if (!target) throw new AuthError('Konto nicht gefunden.');
  if (target.id === actingUserId) throw new AuthError('Du kannst dein eigenes Konto hier nicht löschen.');
  if (target.username.toLowerCase() === ADMIN_USERNAME) {
    throw new AuthError('Der Haupt-Admin kann nicht gelöscht werden.');
  }
  data.users = data.users.filter((u) => u.id !== targetUserId);
  writeAccounts(data);
  return true;
}

function getUser(userId) {
  return publicUser(findById(readAccounts(), userId));
}

module.exports = {
  ADMIN_USERNAME,
  AuthError,
  changePassword,
  deleteUser,
  ensureAdminAccount,
  getUser,
  listUsers,
  login,
  logout,
  publicUser,
  register,
  restoreSession,
  setRole,
  updateProfile,
};
