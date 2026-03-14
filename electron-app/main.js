const { app, BrowserWindow, Menu, shell, dialog, Tray, globalShortcut, nativeImage, session } = require("electron");
const { spawn, exec } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");

function parseEnvValue(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return "";
    }
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function loadEnvFile(filePath, force = false) {
    if (!filePath || !fs.existsSync(filePath)) {
        return;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            return;
        }
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) {
            return;
        }
        const key = trimmed.slice(0, separatorIndex).trim();
        const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
        if (!key) {
            return;
        }
        if (force || process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

let userEnvPath = "";
const envCandidates = [
    path.join(process.cwd(), ".env"),
    path.join(__dirname, "..", ".env"),
    path.join(process.resourcesPath, "app", ".env"),
    path.join(path.dirname(process.execPath), ".env"),
];

try {
    userEnvPath = path.join(app.getPath("userData"), ".env");
} catch { }

envCandidates.forEach((candidate) => loadEnvFile(candidate, true));
if (userEnvPath) {
    loadEnvFile(userEnvPath, false);
}

const defaultDbEnv = {
    DB_USER: "rnvadmin",
    DB_PASSWORD: "rnv_local_2026",
    DB_NAME: "rnv_manager",
    DB_HOST: "127.0.0.1",
    DB_PORT: "5433",
};

Object.entries(defaultDbEnv).forEach(([key, value]) => {
    if (!process.env[key]) {
        process.env[key] = value;
    }
});

function buildDatabaseUrlFromParts() {
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbName = process.env.DB_NAME;
    if (!dbUser || !dbPassword || !dbName) {
        return "";
    }
    const dbHost = process.env.DB_HOST || "localhost";
    const dbPort = process.env.DB_PORT || "5432";
    return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=public`;
}

const rebuiltDatabaseUrl = buildDatabaseUrlFromParts();
if (rebuiltDatabaseUrl) {
    process.env.DATABASE_URL = rebuiltDatabaseUrl;
}

function setDatabasePort(port) {
    applyDatabasePortFallback(port);
    process.env.DB_PORT = String(port);
    const rebuilt = buildDatabaseUrlFromParts();
    if (rebuilt) {
        process.env.DATABASE_URL = rebuilt;
    }
}

// Configuration
const DEFAULT_APP_PORT = app.isPackaged ? 4210 : 4200;
const portFromEnv = app.isPackaged ? process.env.DESKTOP_APP_PORT : process.env.APP_PORT;
const parsedAppPort = parseInt(portFromEnv || "", 10);
let APP_PORT = Number.isFinite(parsedAppPort) ? parsedAppPort : DEFAULT_APP_PORT;
let APP_URL = `http://127.0.0.1:${APP_PORT}`;
const APP_NAME = "RNV Manager";
const APP_VERSION = app.getVersion();
const PROJECT_ROOT = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const MAX_RETRIES = 60; // 60 seconds max wait
const RETRY_INTERVAL = 1000; // 1 second

function setRuntimePort(port) {
    APP_PORT = port;
    APP_URL = `http://127.0.0.1:${APP_PORT}`;
}

function isPortFree(port) {
    return new Promise((resolve) => {
        const tester = net.createServer();
        tester.once("error", () => resolve(false));
        tester.once("listening", () => {
            tester.close(() => resolve(true));
        });
        tester.listen(port, "127.0.0.1");
    });
}

async function resolveRuntimePort() {
    if (!app.isPackaged) {
        return;
    }
    if (await isPortFree(APP_PORT)) {
        return;
    }
    for (let port = APP_PORT + 1; port <= APP_PORT + 30; port++) {
        if (await isPortFree(port)) {
            setRuntimePort(port);
            process.env.DESKTOP_APP_PORT = String(port);
            return;
        }
    }
}

function getAppIconPath() {
    if (app.isPackaged) {
        const packagedIcon = path.join(process.resourcesPath, "assets", "renace-cone.png");
        if (fs.existsSync(packagedIcon)) {
            return packagedIcon;
        }
    }
    const devIcon = path.join(__dirname, "..", "public", "renace-cone.png");
    if (fs.existsSync(devIcon)) {
        return devIcon;
    }
    return path.join(__dirname, "icon.png");
}

function getSplashLogoDataUrl() {
    const logoPath = getAppIconPath();
    try {
        const buffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch {
        return "";
    }
}

function formatDatabaseInfo() {
    const urlText = parseDatabaseUrl();
    if (!urlText) {
        return "No definido";
    }
    try {
        const parsed = new URL(urlText);
        const dbName = parsed.pathname.replace(/^\//, "") || "(sin nombre)";
        return `${parsed.hostname}:${parsed.port || "5432"}/${dbName}`;
    } catch {
        return "Formato inválido";
    }
}

function getRuntimeInfo() {
    return [
        `Versión app: ${APP_VERSION}`,
        `Producto: ${app.getName()}`,
        `Modo: ${app.isPackaged ? "Producción" : "Desarrollo"}`,
        `APP_URL: ${APP_URL}`,
        `DB destino: ${formatDatabaseInfo()}`,
        `Exec path: ${process.execPath}`,
        `Resources: ${process.resourcesPath}`,
        `UserData: ${app.getPath("userData")}`,
    ].join("\n");
}

let mainWindow;
let splashWindow;
let serverProcess = null;
let tray = null;

// Check if server is already running
function checkServer(url) {
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: "/",
            method: "GET",
            timeout: 2000,
        };

        const req = http.request(options, (res) => {
            resolve(true);
        });

        req.on("error", () => resolve(false));
        req.on("timeout", () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// Wait for server to be ready
async function waitForServer(url, maxRetries = MAX_RETRIES) {
    for (let i = 0; i < maxRetries; i++) {
        const isReady = await checkServer(url);
        if (isReady) {
            console.log(`✓ Server ready at ${url}`);
            return true;
        }

        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.webContents.send("status", `Esperando servidor... (${i + 1}/${maxRetries})`);
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL));
    }
    return false;
}

function parseDatabaseUrl() {
    const explicitUrl = process.env.DATABASE_URL;
    if (explicitUrl) {
        return explicitUrl;
    }
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbName = process.env.DB_NAME;
    const dbHost = process.env.DB_HOST || "localhost";
    const dbPort = process.env.DB_PORT || "5432";
    if (!dbUser || !dbPassword || !dbName) {
        return "";
    }
    return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=public`;
}

function applyDatabasePortFallback(targetPort) {
    const urlText = parseDatabaseUrl();
    if (!urlText) {
        return false;
    }
    try {
        const parsed = new URL(urlText);
        const currentPort = parseInt(parsed.port || "5432", 10);
        if (currentPort === targetPort) {
            return false;
        }
        parsed.port = String(targetPort);
        process.env.DATABASE_URL = parsed.toString();
        return true;
    } catch {
        return false;
    }
}

function getDatabaseTarget() {
    const urlText = parseDatabaseUrl();
    if (!urlText) {
        return null;
    }
    try {
        const parsed = new URL(urlText);
        const host = parsed.hostname;
        const port = parseInt(parsed.port || "5432", 10);
        return { host, port };
    } catch {
        return null;
    }
}

function isLocalHost(host) {
    return host === "localhost" || host === "127.0.0.1";
}

function canConnectTcp(host, port, timeout = 1500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let finished = false;
        const finish = (result) => {
            if (finished) {
                return;
            }
            finished = true;
            socket.destroy();
            resolve(result);
        };
        socket.setTimeout(timeout);
        socket.on("connect", () => finish(true));
        socket.on("timeout", () => finish(false));
        socket.on("error", () => finish(false));
        socket.connect(port, host);
    });
}

async function waitForPort(host, port, retries = 30) {
    for (let i = 0; i < retries; i++) {
        const ok = await canConnectTcp(host, port);
        if (ok) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
}

async function ensureLocalDatabase() {
    const target = getDatabaseTarget();
    if (!target) {
        return true;
    }
    if (!isLocalHost(target.host)) {
        return true;
    }
    const composePath = path.join(PROJECT_ROOT, "docker-compose.yml");
    if (!fs.existsSync(composePath)) {
        setDatabasePort(target.port);
        return await canConnectTcp(target.host, target.port);
    }
    const hasDocker = await isDockerAvailable();
    if (!hasDocker) {
        setDatabasePort(target.port);
        return await canConnectTcp(target.host, target.port);
    }
    const daemonRunning = await isDockerDaemonRunning();
    if (!daemonRunning) {
        updateSplash("Iniciando Docker Desktop...");
        const launched = tryStartDockerDesktop();
        if (launched) {
            updateSplash("Esperando Docker Desktop...");
            await waitForDockerDaemon();
        }
    }
    updateSplash("Iniciando base de datos...");
    const commands = [
        { command: "docker", args: ["compose", "up", "-d", "db"] },
        { command: "docker-compose", args: ["up", "-d", "db"] },
    ];
    for (const entry of commands) {
        const ok = await runDockerCompose(entry.command, entry.args);
        if (ok) {
            break;
        }
    }
    const detectedPort = await detectRunningContainerPort("rnv-postgres");
    if (detectedPort) {
        setDatabasePort(detectedPort);
        return await waitForPort(target.host, detectedPort, 45);
    }
    setDatabasePort(target.port);
    return await waitForPort(target.host, target.port, 45);
}

async function startUpgraderIntegration() {
    const upgraderRoot = path.join(PROJECT_ROOT, "OpenUpgrade", "upgradernc");
    const composeFile = path.join(upgraderRoot, "docker-compose.yml");
    if (!fs.existsSync(composeFile)) {
        return;
    }
    const hasDocker = await isDockerAvailable();
    if (!hasDocker) {
        return;
    }
    const daemonRunning = await isDockerDaemonRunning();
    if (!daemonRunning) {
        const launched = tryStartDockerDesktop();
        if (launched) {
            await waitForDockerDaemon();
        }
    }
    const commands = [
        { command: "docker", args: ["compose", "up", "-d"] },
        { command: "docker-compose", args: ["up", "-d"] },
    ];
    for (const entry of commands) {
        const ok = await runDockerComposeAt(upgraderRoot, entry.command, entry.args);
        if (ok) {
            await waitForPort("127.0.0.1", 3005, 90);
            break;
        }
    }
}

// Check if Docker is available
function isDockerAvailable() {
    return new Promise((resolve) => {
        exec("docker --version", (error) => {
            resolve(!error);
        });
    });
}

function isDockerDaemonRunning() {
    return new Promise((resolve) => {
        exec("docker info", (error) => {
            resolve(!error);
        });
    });
}

function tryStartDockerDesktop() {
    const candidates = [
        "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
        "C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe"
    ];
    const executable = candidates.find((candidate) => fs.existsSync(candidate));
    if (!executable) {
        return false;
    }
    try {
        spawn(executable, [], {
            detached: true,
            shell: false,
            stdio: "ignore",
        }).unref();
        return true;
    } catch {
        return false;
    }
}

async function waitForDockerDaemon(maxRetries = 90) {
    for (let i = 0; i < maxRetries; i++) {
        const ready = await isDockerDaemonRunning();
        if (ready) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
}

function runDockerCompose(command, args) {
    return runDockerComposeAt(PROJECT_ROOT, command, args);
}

function runDockerComposeAt(cwdPath, command, args) {
    return new Promise((resolve) => {
        const dockerProcess = spawn(command, args, {
            cwd: cwdPath,
            shell: true,
        });

        dockerProcess.stdout.on("data", (data) => {
            console.log(`Docker: ${data}`);
        });

        dockerProcess.stderr.on("data", (data) => {
            console.error(`Docker error: ${data}`);
        });

        dockerProcess.on("close", (code) => {
            resolve(code === 0);
        });
    });
}

function detectRunningContainerPort(containerName) {
    return new Promise((resolve) => {
        exec(`docker port ${containerName} 5432/tcp`, (error, stdout) => {
            if (error || !stdout) {
                resolve(null);
                return;
            }
            const output = String(stdout).trim();
            const match = output.match(/:(\d+)\s*$/m);
            if (!match) {
                resolve(null);
                return;
            }
            const parsed = parseInt(match[1], 10);
            resolve(Number.isFinite(parsed) ? parsed : null);
        });
    });
}

async function startDockerCompose() {
    const commands = [
        { command: "docker", args: ["compose", "up", "-d"] },
        { command: "docker-compose", args: ["up", "-d"] },
    ];

    for (const entry of commands) {
        const ok = await runDockerCompose(entry.command, entry.args);
        if (ok) {
            return true;
        }
    }

    return false;
}

// Start services (Docker or Local)
async function startServices() {
    console.log("Starting services...");
    updateSplash("Detectando modo de inicio...");

    if (app.isPackaged) {
        await ensureLocalDatabase();
        updateSplash("Iniciando servidor local...");
        return await startLocalServer();
    }

    const hasDocker = await isDockerAvailable();

    if (hasDocker) {
        const daemonRunning = await isDockerDaemonRunning();
        if (!daemonRunning) {
            updateSplash("Iniciando Docker Desktop...");
            const launched = tryStartDockerDesktop();
            if (launched) {
                updateSplash("Esperando Docker Desktop...");
                await waitForDockerDaemon();
            }
        }
        console.log("✓ Docker detected, starting containers...");
        updateSplash("Iniciando contenedores Docker...");

        const dockerStarted = await startDockerCompose();
        if (dockerStarted) {
            console.log("✓ Docker containers started");
            updateSplash("Contenedores iniciados, esperando servidor...");
            const isReady = await waitForServer(APP_URL);
            if (isReady) {
                return true;
            }
            updateSplash("Servidor no respondió, intentando modo local...");
        } else {
            console.error("Docker failed to start containers, trying local mode...");
            updateSplash("Docker falló, iniciando en modo local...");
        }
    }

    const serverAlreadyRunning = await checkServer(APP_URL);
    if (serverAlreadyRunning) {
        console.log("✓ Server is already running");
        return true;
    }

    console.log("Docker not available or failed, starting local server...");
    updateSplash("Iniciando servidor local...");
    return await startLocalServer();
}

// Start local npm dev server
async function startLocalServer() {
    await resolveRuntimePort();
    return new Promise((resolve) => {
        const isPackaged = app.isPackaged;
        let resolved = false;
        let exitedEarly = false;
        const finish = (value) => {
            if (resolved) {
                return;
            }
            resolved = true;
            resolve(value);
        };
        if (isPackaged) {
            const packagedRoot = path.join(process.resourcesPath, "app");
            const serverEntry = path.join(packagedRoot, "server.js");
            if (!fs.existsSync(serverEntry)) {
                finish(false);
                return;
            }

            // Find system node binary — ELECTRON_RUN_AS_NODE causes 500 errors on static assets
            const nodeCandidates = [
                path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"),
                path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", "node.exe"),
                path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs", "node.exe"),
                "node" // fallback: hope it's in PATH
            ];
            let nodeBin = nodeCandidates.find(c => {
                try { return c === "node" || fs.existsSync(c); } catch { return false; }
            }) || "node";

            const useSystemNode = nodeBin !== "node" || (() => {
                try { require("child_process").execSync("node --version", { stdio: "ignore" }); return true; } catch { return false; }
            })();

            if (useSystemNode) {
                serverProcess = spawn(nodeBin, [serverEntry], {
                    cwd: packagedRoot,
                    shell: nodeBin === "node",
                    detached: false,
                    env: {
                        ...process.env,
                        NODE_ENV: "production",
                        PORT: String(APP_PORT),
                        HOSTNAME: "127.0.0.1",
                    },
                });
            } else {
                // Fallback: use Electron as Node (may cause static asset issues)
                serverProcess = spawn(process.execPath, [serverEntry], {
                    cwd: packagedRoot,
                    shell: false,
                    detached: false,
                    env: {
                        ...process.env,
                        NODE_ENV: "production",
                        PORT: String(APP_PORT),
                        HOSTNAME: "127.0.0.1",
                        ELECTRON_RUN_AS_NODE: "1"
                    },
                });
            }
        } else {
            const buildIdPath = path.join(PROJECT_ROOT, ".next", "BUILD_ID");
            const hasBuild = fs.existsSync(buildIdPath);
            const commandArgs = hasBuild ? ["start"] : ["run", "dev"];
            console.log(`Spawn command: npm ${commandArgs.join(" ")}`);
            serverProcess = spawn("npm", commandArgs, {
                cwd: PROJECT_ROOT,
                shell: true,
                detached: false,
            });
        }

        serverProcess.stdout.on("data", (data) => {
            console.log(`Server: ${data}`);
        });

        serverProcess.stderr.on("data", (data) => {
            console.log(`Server Log: ${data}`);
        });

        serverProcess.on("error", (error) => {
            console.error("Failed to start server:", error);
            finish(false);
        });

        serverProcess.on("close", (code) => {
            if (!resolved) {
                exitedEarly = true;
                console.error(`Server process exited early with code: ${code}`);
                finish(false);
            }
        });

        // Start checking immediately, but with a longer total timeout if needed
        setTimeout(async () => {
            if (isPackaged) {
                updateSplash("Iniciando servidor de producción...");
            } else {
                const buildIdPath = path.join(PROJECT_ROOT, ".next", "BUILD_ID");
                const hasBuild = fs.existsSync(buildIdPath);
                updateSplash(hasBuild ? "Iniciando servidor de producción..." : "Iniciando servidor de desarrollo...");
            }
            if (exitedEarly) {
                return;
            }
            const isReady = await waitForServer(APP_URL);
            finish(isReady);
        }, 2000);
    });
}

// Update splash screen message
function updateSplash(message) {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.executeJavaScript(`
            document.querySelector('.status').textContent = '${message}';
        `);
    }
}

// Create splash screen
function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 500,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        icon: getAppIconPath(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const splashHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    background: transparent;
                }
                .splash {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 20px;
                    padding: 40px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    color: white;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                h1 {
                    font-size: 2em;
                    margin-bottom: 14px;
                    font-weight: 300;
                }
                .logo {
                    width: 72px;
                    height: 72px;
                    object-fit: contain;
                    margin-bottom: 14px;
                    filter: drop-shadow(0 6px 12px rgba(0,0,0,0.25));
                }
                .spinner {
                    border: 4px solid rgba(255,255,255,0.3);
                    border-radius: 50%;
                    border-top: 4px solid white;
                    width: 50px;
                    height: 50px;
                    animation: spin 1s linear infinite;
                    margin: 20px 0;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .status {
                    margin-top: 20px;
                    font-size: 0.9em;
                    opacity: 0.9;
                }
            </style>
        </head>
        <body>
            <div class="splash">
                <img class="logo" src="${getSplashLogoDataUrl()}" alt="Renace" />
                <h1>${APP_NAME}</h1>
                <div class="spinner"></div>
                <div class="status">v${APP_VERSION} · Iniciando...</div>
            </div>
        </body>
        </html>
    `;

    splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: APP_NAME,
        icon: getAppIconPath(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        show: false,
    });

    mainWindow.once("ready-to-show", () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
        }
        mainWindow.show();
        mainWindow.focus();
    });

    const loadWithRetry = (retries = 3) => {
        mainWindow.loadURL(APP_URL).catch((err) => {
            console.error(`Failed to load URL (Remaining retries: ${retries}):`, err);
            if (retries > 0) {
                setTimeout(() => loadWithRetry(retries - 1), 1000);
            } else {
                if (splashWindow && !splashWindow.isDestroyed()) {
                    splashWindow.close();
                }
                dialog.showErrorBox(
                    "Error de Conexión",
                    `No se pudo conectar a ${APP_URL}.\n\nEl servidor parece estar corriendo pero no responde.\n\nDetalles: ${err.message}`
                );
                // Don't quit immediately, allow user to try refresh via menu
            }
        });
    };

    loadWithRetry();

    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
        if (level >= 2) {
            console.log(`[Renderer ${level}] ${message} (${sourceId}:${line})`);
        }
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        dialog.showErrorBox("Render Error", `El proceso de la interfaz se cerró: ${details.reason}`);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http")) {
            shell.openExternal(url);
        }
        return { action: "deny" };
    });

    const menu = Menu.buildFromTemplate([
        {
            label: "File",
            submenu: [
                {
                    label: "Refresh",
                    accelerator: "F5",
                    click: () => mainWindow.reload(),
                },
                {
                    label: "Reset UI",
                    click: async () => {
                        try {
                            await session.defaultSession.clearStorageData({
                                storages: ["caches", "serviceworkers"],
                            });
                            mainWindow.reload();
                        } catch (error) {
                            dialog.showErrorBox("Reset UI", error instanceof Error ? error.message : "No se pudo resetear la UI");
                        }
                    },
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
                            message: `${APP_NAME} v${APP_VERSION}`,
                            detail: "Desktop application for managing VPS, clients, and Odoo integration.\n\nBy Renace Tech",
                        });
                    },
                },
                {
                    label: "Diagnóstico",
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: "info",
                            title: "Diagnóstico de ejecución",
                            message: `${APP_NAME} v${APP_VERSION}`,
                            detail: getRuntimeInfo(),
                        });
                    },
                },
            ],
        },
    ]);
    Menu.setApplicationMenu(menu);

    mainWindow.on("close", (e) => {
        // Minimize to tray instead of closing
        if (!app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    return;
}

app.on("second-instance", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// Initialize app
app.whenReady().then(async () => {
    app.setAppUserModelId("tech.renace.rnv-manager");
    createSplashWindow();
    try {
        await session.defaultSession.clearCache();
        await session.defaultSession.clearStorageData({
            storages: ["serviceworkers", "caches"],
        });
    } catch { }

    const serverReady = await startServices();


    if (serverReady) {
        createWindow();
        createTray();
        startUpgraderIntegration();
    } else {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
        }
        dialog.showErrorBox(
            "Error al Iniciar",
            "No se pudo iniciar el servidor.\n\nPor favor, intenta:\n1. Ejecutar 'docker-compose up' manualmente (si usas Docker)\n2. O ejecutar 'npm run dev' en la carpeta del proyecto\n\nLuego vuelve a abrir la aplicación."
        );
        app.quit();
    }
});

app.on("window-all-closed", () => {
    // Don't quit when all windows closed — we have a system tray
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Note: We intentionally don't kill server/docker on quit
// so that the next startup is faster

// Create system tray
function createTray() {
    const iconPath = getAppIconPath();
    let trayIcon;
    try {
        trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } catch {
        trayIcon = nativeImage.createEmpty();
    }
    tray = new Tray(trayIcon);
    tray.setToolTip("RNV Manager");

    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Abrir RNV Manager",
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: "Reset UI",
            click: async () => {
                try {
                    await session.defaultSession.clearStorageData({
                        storages: ["caches", "serviceworkers"],
                    });
                    if (mainWindow) {
                        mainWindow.reload();
                    }
                } catch (error) {
                    dialog.showErrorBox("Reset UI", error instanceof Error ? error.message : "No se pudo resetear la UI");
                }
            }
        },
        { type: "separator" },
        {
            label: "Siempre visible",
            type: "checkbox",
            checked: false,
            click: (menuItem) => {
                if (mainWindow) {
                    mainWindow.setAlwaysOnTop(menuItem.checked);
                }
            }
        },
        { type: "separator" },
        {
            label: "Salir",
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.focus();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}

// Cleanup on quit
app.on("before-quit", () => {
    app.isQuitting = true;
    globalShortcut.unregisterAll();
});
