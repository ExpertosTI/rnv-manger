import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";

interface SSHConfig {
    host: string;
    port: number;
    username: string;
    password: string;
}

interface BackupResult {
    success: boolean;
    type: string;
    filename: string;
    size?: string;
    path?: string;
    duration?: number;
    error?: string;
}

async function sshExec(config: SSHConfig, command: string, timeout = 120000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let output = "";
        let errorOutput = "";

        const timer = setTimeout(() => {
            conn.end();
            reject(new Error("Command timeout"));
        }, timeout);

        conn.on("ready", () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timer);
                    conn.end();
                    reject(err);
                    return;
                }
                stream.on("data", (data: Buffer) => { output += data.toString(); });
                stream.stderr.on("data", (data: Buffer) => { errorOutput += data.toString(); });
                stream.on("close", (code: number) => {
                    clearTimeout(timer);
                    conn.end();
                    if (code !== 0 && errorOutput) {
                        reject(new Error(errorOutput));
                    } else {
                        resolve(output.trim());
                    }
                });
            });
        });

        conn.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });

        conn.connect({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            readyTimeout: 10000
        });
    });
}

// Backup commands for different services
const BACKUP_COMMANDS = {
    postgres: (dbName: string, filename: string) =>
        `pg_dump -U postgres ${dbName} | gzip > /tmp/${filename} && echo "SIZE:$(du -h /tmp/${filename} | cut -f1)"`,

    mysql: (dbName: string, filename: string) =>
        `mysqldump ${dbName} | gzip > /tmp/${filename} && echo "SIZE:$(du -h /tmp/${filename} | cut -f1)"`,

    odoo: (instanceName: string, filename: string) =>
        `tar -czf /tmp/${filename} /opt/${instanceName} 2>/dev/null && echo "SIZE:$(du -h /tmp/${filename} | cut -f1)"`,

    docker: (containerName: string, filename: string) =>
        `docker exec ${containerName} pg_dump -U odoo postgres 2>/dev/null | gzip > /tmp/${filename} && echo "SIZE:$(du -h /tmp/${filename} | cut -f1)"`,

    files: (path: string, filename: string) =>
        `tar -czf /tmp/${filename} ${path} 2>/dev/null && echo "SIZE:$(du -h /tmp/${filename} | cut -f1)"`,

    full: (filename: string) =>
        `tar -czf /tmp/${filename} /opt /etc/nginx/sites-available /home 2>/dev/null && echo "SIZE:$(du -h /tmp/${filename} | cut -f1)"`
};

// POST - Execute backup
export async function POST(request: NextRequest) {
    try {
        const { host, port, username, password, type, target, customCommand } = await request.json();

        if (!host || !username || !password) {
            return NextResponse.json({ success: false, error: "Faltan credenciales SSH" }, { status: 400 });
        }

        const config: SSHConfig = { host, port: port || 22, username, password };
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const startTime = Date.now();

        let command: string;
        let filename: string;

        switch (type) {
            case "postgres":
                filename = `${target || "database"}_${timestamp}.sql.gz`;
                command = BACKUP_COMMANDS.postgres(target || "postgres", filename);
                break;

            case "mysql":
                filename = `${target || "database"}_${timestamp}.sql.gz`;
                command = BACKUP_COMMANDS.mysql(target || "mysql", filename);
                break;

            case "odoo":
                filename = `${target || "odoo"}_${timestamp}.tar.gz`;
                command = BACKUP_COMMANDS.odoo(target || "odoo", filename);
                break;

            case "docker":
                filename = `${target || "container"}_${timestamp}.sql.gz`;
                command = BACKUP_COMMANDS.docker(target || "odoo", filename);
                break;

            case "files":
                filename = `files_${timestamp}.tar.gz`;
                command = BACKUP_COMMANDS.files(target || "/opt", filename);
                break;

            case "full":
                filename = `full_backup_${timestamp}.tar.gz`;
                command = BACKUP_COMMANDS.full(filename);
                break;

            case "custom":
                if (!customCommand) {
                    return NextResponse.json({ success: false, error: "Comando custom requerido" }, { status: 400 });
                }
                filename = `custom_${timestamp}.backup`;
                command = customCommand;
                break;

            default:
                return NextResponse.json({ success: false, error: "Tipo de backup no válido" }, { status: 400 });
        }

        // Ensure backup directory exists
        await sshExec(config, "mkdir -p /tmp/rnv_backups");

        // Execute backup
        const output = await sshExec(config, command, 300000); // 5 min timeout for backups

        // Parse size from output
        const sizeMatch = output.match(/SIZE:(.+)/);
        const size = sizeMatch ? sizeMatch[1].trim() : "unknown";

        const duration = Date.now() - startTime;

        const result: BackupResult = {
            success: true,
            type,
            filename,
            size,
            path: `/tmp/${filename}`,
            duration
        };

        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error("Backup API Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Error ejecutando backup"
            },
            { status: 500 }
        );
    }
}

// GET - List existing backups
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const host = url.searchParams.get("host");
        const port = parseInt(url.searchParams.get("port") || "22");
        const username = url.searchParams.get("username");
        const password = url.searchParams.get("password");

        if (!host || !username || !password) {
            return NextResponse.json({ success: false, error: "Faltan parámetros" }, { status: 400 });
        }

        const config: SSHConfig = { host, port, username, password };

        // List backups in /tmp
        const output = await sshExec(config,
            "ls -lh /tmp/*.gz /tmp/*.backup 2>/dev/null | awk '{print $5,$9}' | tail -20"
        );

        const backups = output.split("\n")
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split(" ");
                return {
                    size: parts[0],
                    path: parts[1],
                    filename: parts[1]?.split("/").pop() || ""
                };
            });

        return NextResponse.json({ success: true, data: backups });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Error listando backups" },
            { status: 500 }
        );
    }
}
