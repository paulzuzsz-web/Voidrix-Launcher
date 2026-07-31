'use strict';

/**
 * Brücke zwischen UI und Hauptprozess.
 * Das UI bekommt ausschließlich diese Funktionen - kein Node, kein fs.
 */

const { contextBridge, ipcRenderer } = require('electron');

/** Ruft einen IPC-Kanal auf und wirft bei Fehlern eine echte Exception. */
async function call(channel, payload) {
  const res = await ipcRenderer.invoke(channel, payload);
  if (!res) throw new Error('Keine Antwort vom Launcher.');
  if (!res.ok) {
    const err = new Error(res.error?.message || 'Unbekannter Fehler');
    err.field = res.error?.field || null;
    throw err;
  }
  return res.data;
}

function on(channel, listener) {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('voidrix', {
  window: {
    minimize: () => call('window:minimize'),
    toggleMaximize: () => call('window:toggleMaximize'),
    close: () => call('window:close'),
    isMaximized: () => call('window:isMaximized'),
    onState: (cb) => on('window:state', cb),
  },

  setup: {
    status: () => call('setup:status'),
    pickFolder: (current) => call('setup:pickFolder', { current }),
    apply: (folder) => call('setup:apply', { folder }),
    changeFolder: (folder, restart = true) => call('setup:changeFolder', { folder, restart }),
  },

  auth: {
    bootstrap: () => call('auth:bootstrap'),
    register: (payload) => call('auth:register', payload),
    login: (payload) => call('auth:login', payload),
    logout: () => call('auth:logout'),
    me: () => call('auth:me'),
    updateProfile: (payload) => call('auth:updateProfile', payload),
    changePassword: (payload) => call('auth:changePassword', payload),
  },

  users: {
    list: () => call('users:list'),
    setRole: (userId, role) => call('users:setRole', { userId, role }),
    remove: (userId) => call('users:delete', { userId }),
  },

  library: {
    list: () => call('library:list'),
    get: (id) => call('library:get', { id }),
    info: () => call('library:info'),
    save: (entry) => call('library:save', entry),
    remove: (id) => call('library:delete', { id }),
    setExePath: (id, exePath) => call('library:setExePath', { id, exePath }),
    launch: (id) => call('library:launch', { id }),
    stop: (id) => call('library:stop', { id }),
    reveal: (id) => call('library:reveal', { id }),
    onChanged: (cb) => on('library:changed', cb),
    onRunning: (cb) => on('library:running', cb),
  },

  dialog: {
    pickExecutable: (title) => call('dialog:pickExecutable', { title }),
    pickImage: (multiple = false, kind = 'sonstiges') => call('dialog:pickImage', { multiple, kind }),
    pickFolder: () => call('dialog:pickFolder'),
  },

  shell: {
    openPath: (target) => call('shell:openPath', { target }),
    openExternal: (url) => call('shell:openExternal', { url }),
  },

  app: {
    info: () => call('app:info'),
  },

  /** Baut die URL für ein lokales Bild aus dem Katalog. */
  mediaUrl: (ref) => {
    const value = String(ref || '').trim();
    if (!value) return '';
    if (/^(https?|data|vximg):/i.test(value)) return value;
    return `vximg://img/?ref=${encodeURIComponent(value)}`;
  },
});
