// Music Studio Tycoon: application de bureau (Electron). Le jeu entier tient dans www/index.html.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Le jeu s'appelait « Premier Mix » : on garde son dossier de données pour conserver les sauvegardes existantes.
app.setPath('userData', path.join(app.getPath('appData'), 'Premier Mix'));

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    title: 'Music Studio Tycoon',
    backgroundColor: '#e6edf1',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  // Les liens externes s'ouvrent dans le navigateur, jamais dans la fenêtre du jeu.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); } });
  // F11 : plein écran
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
