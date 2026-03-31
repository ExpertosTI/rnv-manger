const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, Notification } = require("electron");
const path = require("path");
const Store = require("electron-store");

const store = new Store({
  defaults: {
    serverUrl: "https://rnv.renace.tech",
    windowBounds: { width: 1400, height: 900 },
    startMinimized: false,
    alwaysOnTop: false,
  },
});

let mainWindow;
let tray;

function createWindow() {
  const { width, height } = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 700,
    title: "RNV Manager",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 15, y: 15 },
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#f8f4ff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
    show: false,
    icon: path.join(__dirname, "assets", "icon.png"),
  });

  const serverUrl = store.get("serverUrl");
  mainWindow.loadURL(serverUrl);

  // Show when ready
  mainWindow.once("ready-to-show", () => {
    if (!store.get("startMinimized")) {
      mainWindow.show();
    }
  });

  // Save window bounds on resize
  mainWindow.on("resize", () => {
    const bounds = mainWindow.getBounds();
    store.set("windowBounds", { width: bounds.width, height: bounds.height });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Inject CSS for native-like feel on macOS
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.insertCSS(`
      body {
        -webkit-app-region: no-drag;
        user-select: auto;
      }
      /* Make the top area draggable for macOS title bar */
      .app-drag-region {
        -webkit-app-region: drag;
      }
      /* Scrollbar styling */
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
    `);
  });

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: "RNV Manager",
      submenu: [
        { role: "about", label: "Acerca de RNV Manager" },
        { type: "separator" },
        {
          label: "Preferencias...",
          accelerator: "CmdOrCtrl+,",
          click: () => openSettings(),
        },
        { type: "separator" },
        { role: "hide", label: "Ocultar RNV Manager" },
        { role: "hideOthers", label: "Ocultar otros" },
        { role: "unhide", label: "Mostrar todos" },
        { type: "separator" },
        { role: "quit", label: "Salir de RNV Manager" },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Deshacer" },
        { role: "redo", label: "Rehacer" },
        { type: "separator" },
        { role: "cut", label: "Cortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Pegar" },
        { role: "selectAll", label: "Seleccionar todo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "reload", label: "Recargar", accelerator: "CmdOrCtrl+R" },
        { role: "forceReload", label: "Forzar recarga", accelerator: "CmdOrCtrl+Shift+R" },
        { role: "toggleDevTools", label: "Herramientas de desarrollo" },
        { type: "separator" },
        { role: "zoomIn", label: "Acercar" },
        { role: "zoomOut", label: "Alejar" },
        { role: "resetZoom", label: "Zoom original" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
      ],
    },
    {
      label: "Navegacion",
      submenu: [
        { label: "Panel Principal", accelerator: "CmdOrCtrl+1", click: () => navigate("/") },
        { label: "Servidores VPS", accelerator: "CmdOrCtrl+2", click: () => navigate("/vps") },
        { label: "Servicios", accelerator: "CmdOrCtrl+3", click: () => navigate("/services") },
        { label: "Clientes", accelerator: "CmdOrCtrl+4", click: () => navigate("/clients") },
        { label: "Facturacion", accelerator: "CmdOrCtrl+5", click: () => navigate("/billing") },
        { label: "Auditoria", accelerator: "CmdOrCtrl+6", click: () => navigate("/audit") },
        { label: "Usuarios", accelerator: "CmdOrCtrl+7", click: () => navigate("/users") },
        { type: "separator" },
        { label: "Configuracion", accelerator: "CmdOrCtrl+,", click: () => navigate("/settings") },
      ],
    },
    {
      label: "Ventana",
      submenu: [
        { role: "minimize", label: "Minimizar" },
        { role: "zoom", label: "Zoom" },
        { type: "separator" },
        {
          label: "Siempre visible",
          type: "checkbox",
          checked: store.get("alwaysOnTop"),
          click: (menuItem) => {
            store.set("alwaysOnTop", menuItem.checked);
            mainWindow?.setAlwaysOnTop(menuItem.checked);
          },
        },
        { type: "separator" },
        { role: "front", label: "Traer al frente" },
      ],
    },
    {
      label: "Ayuda",
      submenu: [
        {
          label: "Documentacion",
          click: () => shell.openExternal("https://rnv.renace.tech"),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function navigate(path) {
  if (mainWindow) {
    const serverUrl = store.get("serverUrl");
    mainWindow.loadURL(`${serverUrl}${path}`);
  }
}

function openSettings() {
  if (mainWindow) {
    const serverUrl = store.get("serverUrl");
    mainWindow.loadURL(`${serverUrl}/settings`);
  }
}

function createTray() {
  // Create a simple tray icon
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "tray-icon.png"));
  tray = new Tray(icon.resize({ width: 18, height: 18 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: "Mostrar RNV Manager", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "Panel Principal", click: () => { mainWindow?.show(); navigate("/"); } },
    { label: "Servidores", click: () => { mainWindow?.show(); navigate("/vps"); } },
    { label: "Clientes", click: () => { mainWindow?.show(); navigate("/clients"); } },
    { type: "separator" },
    { label: "Salir", click: () => app.quit() },
  ]);

  tray.setToolTip("RNV Manager");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

// IPC handlers
ipcMain.handle("get-server-url", () => store.get("serverUrl"));
ipcMain.handle("set-server-url", (_, url) => store.set("serverUrl", url));
ipcMain.handle("get-app-version", () => app.getVersion());

ipcMain.handle("show-notification", (_, { title, body }) => {
  new Notification({ title, body }).show();
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  if (process.platform === "darwin") {
    createTray();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

// Handle certificate errors for self-signed certs (dev)
app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
  const serverUrl = store.get("serverUrl");
  if (url.startsWith(serverUrl)) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
