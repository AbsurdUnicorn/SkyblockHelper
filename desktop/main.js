// SkyBlock Helper desktop app: one window showing index.html, with automatic updates from GitHub Releases.
const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

if (!app.requestSingleInstanceLock()) app.quit();

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 800, minHeight: 600,
    backgroundColor: "#0f1117",
    title: "SkyBlock Helper",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "..", "index.html"));
  // links like the wiki or developer.hypixel.net open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "App", submenu: [
      { label: "Check for updates", click: () => checkForUpdates(true) },
      { role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" },
    ] },
    { role: "editMenu" }, { role: "viewMenu" },
  ]));
  createWindow();
  checkForUpdates(false);
  setInterval(() => checkForUpdates(false), 6 * 60 * 60e3);   // also every 6 hours while open
});
app.on("window-all-closed", () => app.quit());

// ---------- updates ----------
// electron-updater reads latest.yml from the newest GitHub Release, downloads the new installer in the
// background, and installs it when the app closes (or right away if you click Restart).
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
let manual = false;
function checkForUpdates(byUser) {
  if (!app.isPackaged) { if (byUser) dialog.showMessageBox(win, { message: "Updates only work in the installed app." }); return; }
  manual = byUser;
  autoUpdater.checkForUpdates().catch(err => { if (manual) dialog.showMessageBox(win, { type: "error", message: "Couldn't check for updates", detail: String(err?.message || err) }); });
}
autoUpdater.on("update-not-available", () => { if (manual) dialog.showMessageBox(win, { message: `You're on the latest version (${app.getVersion()}).` }); });
autoUpdater.on("update-downloaded", async info => {
  const r = await dialog.showMessageBox(win, {
    type: "info", buttons: ["Restart now", "Later"], defaultId: 0, cancelId: 1,
    message: `SkyBlock Helper ${info.version} is ready`,
    detail: "Restart to use the new version. If you choose Later, it installs the next time you close the app.",
  });
  if (r.response === 0) autoUpdater.quitAndInstall();
});
