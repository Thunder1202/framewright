// Desktop shell: loads the built editor from dist/ in its own window.
// No network access is needed; everything the editor uses is local.
const { app, BrowserWindow, Menu, protocol, net, session, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');

/**
 * The project folder, when the app is run from inside it (the desktop shortcut
 * opens release/win-unpacked/Framewright.exe; `npm run app` runs from the folder itself).
 * Null when the app was installed somewhere else with the installer.
 */
function findRoot() {
  const candidates = [path.resolve(path.dirname(process.execPath), '..', '..'), path.resolve(__dirname, '..')];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'kadr', 'run.py')) && fs.existsSync(path.join(dir, 'package.json'))) return dir;
  }
  return null;
}
const ROOT = findRoot();

// Keep projects and imported media beside the program (data/), not on the system drive.
// The first time, whatever was already saved in the old place is copied over.
if (ROOT) {
  const data = path.join(ROOT, 'data');
  const old = app.getPath('userData');
  try {
    if (!fs.existsSync(data) && fs.existsSync(old)) fs.cpSync(old, data, { recursive: true });
    fs.mkdirSync(data, { recursive: true });
    app.setPath('userData', data);
  } catch {
    /* could not prepare data/: stay with the default place */
  }
}

// A real origin (not file://) so IndexedDB, module scripts and storage
// persistence behave exactly as they do in the browser.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ---------- Kadr: the captions engine (Python), started only when asked for ----------

let kadr = null; // the process we started, if any

function kadrPort() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'kadr', 'settings.json'), 'utf8'));
    return Number(s.port) || 8000;
  } catch {
    return 8000;
  }
}

async function kadrAlive(url) {
  try {
    const r = await fetch(`${url}/api/info`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function startKadr() {
  if (!ROOT) return { ok: false, error: 'The captions engine is not next to this copy of the app. Open Framewright from its own folder.' };
  const url = `http://127.0.0.1:${kadrPort()}`;
  if (await kadrAlive(url)) return { ok: true, url };
  const dir = path.join(ROOT, 'kadr');
  const python = path.join(dir, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(python)) {
    return { ok: false, error: 'The captions engine is not installed yet. Double-click StartKadr.bat in the kadr folder once, then try again.' };
  }
  if (!kadr) {
    kadr = spawn(python, ['run.py', '--no-browser'], { cwd: dir, windowsHide: true, stdio: 'ignore', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    kadr.on('exit', () => {
      kadr = null;
    });
    kadr.on('error', () => {
      kadr = null;
    });
  }
  // loading the web server takes a few seconds the first time
  for (let i = 0; i < 90; i++) {
    if (await kadrAlive(url)) return { ok: true, url };
    if (!kadr) return { ok: false, error: 'The captions engine stopped while starting.' };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, error: 'The captions engine did not start in time.' };
}

function stopKadr() {
  if (!kadr || !kadr.pid) return;
  // the venv's python.exe is a launcher with the real Python as its child: stop the whole tree
  try {
    execFile('taskkill', ['/pid', String(kadr.pid), '/T', '/F'], { windowsHide: true }, () => {});
  } catch {
    kadr.kill();
  }
  kadr = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0c0f',
    autoHideMenuBar: true,
    title: 'Framewright',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  // The editor never navigates away; open anything external in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  void win.loadURL('app://editor/index.html');
}

// one window, one data folder: a second launch just brings the first to the front
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
      if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    // Voiceover recording needs the microphone; nothing else is granted.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media');
    });
    ipcMain.handle('kadr:start', () => startKadr());
    ipcMain.handle('kadr:open', async () => {
      const r = await startKadr();
      if (r.ok) void shell.openExternal(r.url.replace('127.0.0.1', 'localhost'));
      return r;
    });
    Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', stopKadr);
}
