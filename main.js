const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// Ouvrir un lien externe dans le navigateur du système
ipcMain.on('open-url', (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// Lancer l'installateur téléchargé puis quitter l'app
ipcMain.on('run-update', (event, filePath) => {
  if (fs.existsSync(filePath)) {
    shell.openPath(filePath);
    setTimeout(() => app.quit(), 2000);
  }
});

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(app.getPath('appData'), 'aplm'));

function createWindow() {
    // Dossier userData accessible en lecture/écriture même après installation
    const dataDir = app.getPath('userData');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // Transmettre le chemin aux modules Node.js chargés dans le renderer
    process.env.APLM_DATA_PATH = dataDir;

    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "APLMGEST",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile("login.html");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
