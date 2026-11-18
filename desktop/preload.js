// The only thing the page gets from the desktop side: reading the SkyBlock Helper Link mod's events file.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("sbLink", {
  // which: "events.jsonl" or "events.1.jsonl"; from: byte offset already read
  read: (which, from) => ipcRenderer.invoke("link:read", which, from),
});
