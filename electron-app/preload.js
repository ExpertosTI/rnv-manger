const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getServerUrl: () => ipcRenderer.invoke("get-server-url"),
  setServerUrl: (url) => ipcRenderer.invoke("set-server-url", url),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  showNotification: (title, body) => ipcRenderer.invoke("show-notification", { title, body }),
  platform: process.platform,
  isElectron: true,
});
