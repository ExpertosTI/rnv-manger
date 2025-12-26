const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");

// Configuration
const APP_URL = "http://localhost:7463";
const APP_NAME = "RNV Manager";

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: APP_NAME,
        icon: path.join(__dirname, "icon.ico"),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        show: false, // Don't show until loaded
    });

    // Show window when ready
    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Load the app URL
    mainWindow.loadURL(APP_URL).catch((err) => {
        console.error("Failed to load URL:", err);
        dialog.showErrorBox(
            "Connection Error",
            `Could not connect to ${APP_URL}.\n\nMake sure Docker is running:\ndocker-compose up -d`
        );
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http")) {
            shell.openExternal(url);
        }
        return { action: "deny" };
    });

    // Create menu
    const menu = Menu.buildFromTemplate([
        {
            label: "File",
            submenu: [
                {
                    label: "Refresh",
                    accelerator: "F5",
                    click: () => mainWindow.reload(),
                },
                { type: "separator" },
                {
                    label: "Quit",
                    accelerator: "Alt+F4",
                    click: () => app.quit(),
                },
            ],
        },
        {
            label: "View",
            submenu: [
                {
                    label: "Zoom In",
                    accelerator: "CmdOrCtrl+Plus",
                    click: () => {
                        const zoom = mainWindow.webContents.getZoomFactor();
                        mainWindow.webContents.setZoomFactor(zoom + 0.1);
                    },
                },
                {
                    label: "Zoom Out",
                    accelerator: "CmdOrCtrl+-",
                    click: () => {
                        const zoom = mainWindow.webContents.getZoomFactor();
                        mainWindow.webContents.setZoomFactor(zoom - 0.1);
                    },
                },
                {
                    label: "Reset Zoom",
                    accelerator: "CmdOrCtrl+0",
                    click: () => mainWindow.webContents.setZoomFactor(1),
                },
                { type: "separator" },
                {
                    label: "Toggle DevTools",
                    accelerator: "F12",
                    click: () => mainWindow.webContents.toggleDevTools(),
                },
            ],
        },
        {
            label: "Help",
            submenu: [
                {
                    label: "About",
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: "info",
                            title: "About RNV Manager",
                            message: "RNV Manager v1.0.0",
                            detail: "Desktop application for managing VPS, clients, and Odoo integration.\n\nBy Renace Tech",
                        });
                    },
                },
            ],
        },
    ]);
    Menu.setApplicationMenu(menu);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
