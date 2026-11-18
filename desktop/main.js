// SkyBlock Helper desktop app: one window showing index.html, with automatic updates from GitHub Releases.
const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

// ---------- SkyBlock Helper Link (the game mod) ----------
// The mod appends one JSON line per SkyBlock system message to this folder. The page may read these two files and
// nothing else, from a byte offset, so it only gets new lines.
const LINK_DIR = path.join(app.getPath("appData"), "SkyBlock Helper Link");
ipcMain.handle("link:read", (e, which, from) => {
  if (which !== "events.jsonl" && which !== "events.1.jsonl") return { size:0, text:"", missing:true };
  const file = path.join(LINK_DIR, which);
  try {
    const size = fs.statSync(file).size;
    let start = Math.max(0, +from || 0); if (start > size) start = 0;   // the file was rotated: start over
    start = Math.max(start, size - 8 * 1024 * 1024);                     // never more than 8 MB at once
    if (start >= size) return { size, text:"" };
    const fd = fs.openSync(file, "r"), buf = Buffer.alloc(size - start);
    try { fs.readSync(fd, buf, 0, buf.length, start); } finally { fs.closeSync(fd); }
    return { size, start, text:buf.toString("utf8") };
  } catch { return { size:0, text:"", missing:true }; }
});

if (!app.requestSingleInstanceLock()) app.quit();

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 800, minHeight: 600,
    backgroundColor: "#0f1117",
    title: "SkyBlock Helper",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  win.loadFile(path.join(__dirname, "..", "index.html"));
  // links like the wiki or developer.hypixel.net open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "App", submenu: [
      { label: "Check for updates", click: () => checkForUpdates(true) },
      { role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" },
    ] },
    { role: "editMenu" }, { role: "viewMenu" },
  ]));
  await updateBeforeLaunch();   // every launch: check for a new version first and install it if there is one
  createWindow();
  setInterval(() => checkForUpdates(false), 6 * 60 * 60e3);   // also every 6 hours while open
});
// (while the launch check runs, closing its small window must not quit the app)
app.on("window-all-closed", () => { if (!launching) app.quit(); });

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
  if (launching) return;   // the launch check installs it itself
  const r = await dialog.showMessageBox(win, {
    type: "info", buttons: ["Restart now", "Later"], defaultId: 0, cancelId: 1,
    message: `SkyBlock Helper ${info.version} is ready`,
    detail: "Restart to use the new version. If you choose Later, it installs the next time you close the app.",
  });
  if (r.response === 0) autoUpdater.quitAndInstall();
});

// ---------- update check on every launch ----------
// A small window says "Checking for updates…". If GitHub has a newer version it downloads it, installs it
// silently and starts the new version. If there is none, you're offline, or the check takes over 10 seconds,
// the app just opens. Skip (or closing the small window) opens the app straight away; an unfinished
// download then carries on in the background and installs when you close the app.
let launching = false;
autoUpdater.on("error", () => {});   // failures are handled where each check is made; don't crash on them
const SPLASH = `<!doctype html><meta charset="utf-8"><title>SkyBlock Helper</title><style>
  body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
    background:#0f1117;color:#e6e8ee;font:14px "Segoe UI",system-ui,sans-serif;-webkit-app-region:drag;user-select:none}
  b{font-size:16px} #s{color:#9aa3b2} .bar{width:260px;height:6px;border-radius:3px;background:#262b36;overflow:hidden}
  #f{height:100%;width:0;background:#7aa2ff;transition:width .2s} #f.spin{width:30%;animation:m 1.1s ease-in-out infinite alternate}
  @keyframes m{from{margin-left:0}to{margin-left:70%}}
  a{color:#9aa3b2;font-size:12px;cursor:pointer;-webkit-app-region:no-drag} a:hover{color:#e6e8ee}
</style><b>SkyBlock Helper</b><div id="s">Checking for updates…</div><div class="bar"><div id="f" class="spin"></div></div>
<a onclick="window.close()">Skip</a>`;

async function updateBeforeLaunch() {
  if (!app.isPackaged) return;
  launching = true;
  const splash = new BrowserWindow({
    width: 380, height: 170, frame: false, resizable: false, maximizable: false, fullscreenable: false, show: false,
    backgroundColor: "#0f1117", title: "SkyBlock Helper", icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(SPLASH));
  splash.once("ready-to-show", () => splash.show());
  const say = (text, percent) => { if (!splash.isDestroyed()) splash.webContents.executeJavaScript(
    `s.textContent=${JSON.stringify(text)};` + (percent == null ? "" : `f.className="";f.style.width="${percent}%";`)).catch(() => {}); };
  const onProgress = p => say(`Downloading update… ${Math.round(p.percent)}%`, p.percent);
  autoUpdater.on("download-progress", onProgress);
  const skipped = new Promise(r => splash.once("closed", () => r("skip")));
  const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
  try {
    const result = await Promise.race([autoUpdater.checkForUpdates(), wait(10e3, "slow"), skipped]);
    if (result && typeof result === "object" && result.isUpdateAvailable && result.downloadPromise) {
      say(`Downloading ${result.updateInfo.version}…`, 0);
      if (await Promise.race([result.downloadPromise.then(() => "done"), skipped]) === "done") {
        say(`Installing ${result.updateInfo.version}…`, 100);
        await wait(400);
        launching = false;
        autoUpdater.quitAndInstall(true, true);   // install silently, then start the new version
        return new Promise(() => {});              // the app is closing: never open the old version's window
      }
    }
  } catch { /* offline or GitHub unreachable: open the app anyway */ }
  autoUpdater.removeListener("download-progress", onProgress);
  if (!splash.isDestroyed()) splash.destroy();
  launching = false;
}
