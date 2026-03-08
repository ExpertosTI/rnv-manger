import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";

interface SSHConnectionConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
}

interface SSHExecResult {
    success: boolean;
    output: string;
    error?: string;
    exitCode?: number;
}

async function sshExec(
    config: SSHConnectionConfig,
    command: string,
    timeout: number = 30000
): Promise<SSHExecResult> {
    return new Promise((resolve) => {
        const conn = new Client();
        let output = "";
        let errorOutput = "";
        let exitCode: number | undefined;

        const timer = setTimeout(() => {
            conn.end();
            resolve({
                success: false,
                output: output,
                error: "Command timeout",
            });
        }, timeout);

        conn.on("ready", () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timer);
                    conn.end();
                    resolve({
                        success: false,
                        output: "",
                        error: err.message,
                    });
                    return;
                }

                stream.on("close", (code: number) => {
                    clearTimeout(timer);
                    exitCode = code;
                    conn.end();
                    resolve({
                        success: code === 0,
                        output: output.trim(),
                        error: errorOutput.trim() || undefined,
                        exitCode,
                    });
                });

                stream.on("data", (data: Buffer) => {
                    output += data.toString();
                });

                stream.stderr.on("data", (data: Buffer) => {
                    errorOutput += data.toString();
                });
            });
        });

        conn.on("error", (err) => {
            clearTimeout(timer);
            resolve({
                success: false,
                output: "",
                error: err.message,
            });
        });

        conn.connect({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            readyTimeout: 10000,
        });
    });
}

async function testSSHConnection(config: SSHConnectionConfig): Promise<{
    success: boolean;
    message: string;
    latency?: number;
}> {
    const startTime = Date.now();
    const result = await sshExec(config, "echo 'RNV_SSH_TEST_OK'", 10000);
    const latency = Date.now() - startTime;

    if (result.success && result.output.includes("RNV_SSH_TEST_OK")) {
        return { success: true, message: "Conexión exitosa", latency };
    }
    return { success: false, message: result.error || "Conexión fallida" };
}

async function getServerInfo(config: SSHConnectionConfig) {
    const commands = {
        hostname: "hostname",
        uptime: "uptime -p 2>/dev/null || uptime",
        memory: "free -h | awk '/^Mem:/ {print $2,$3,$4}'",
        disk: "df -h / | awk 'NR==2 {print $2,$3,$4,$5}'",
        cpu: "cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d: -f2",
        os: "cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'",
    };

    const results: Record<string, SSHExecResult> = {};
    for (const [key, cmd] of Object.entries(commands)) {
        results[key] = await sshExec(config, cmd, 10000);
    }

    const memParts = (results.memory.output || "0 0 0").split(" ");
    const diskParts = (results.disk.output || "0 0 0 0%").split(" ");

    return {
        hostname: results.hostname.output || "Unknown",
        uptime: results.uptime.output || "Unknown",
        memory: {
            total: memParts[0] || "0",
            used: memParts[1] || "0",
            free: memParts[2] || "0",
        },
        disk: {
            total: diskParts[0] || "0",
            used: diskParts[1] || "0",
            free: diskParts[2] || "0",
            percent: diskParts[3] || "0%",
        },
        cpu: results.cpu.output?.trim() || "Unknown",
        os: results.os.output || "Unknown",
    };
}

// POST - Execute SSH command
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { host, port, username, password, command, action } = body;

        if (!host || !username || !password) {
            return NextResponse.json(
                { success: false, error: "Faltan credenciales SSH" },
                { status: 400 }
            );
        }

        const config = { host, port: port || 22, username, password };

        if (action === "test") {
            const result = await testSSHConnection(config);
            return NextResponse.json(result);
        }

        if (action === "info") {
            const info = await getServerInfo(config);
            return NextResponse.json({ success: true, data: info });
        }

        if (!command) {
            return NextResponse.json(
                { success: false, error: "No se especificó comando" },
                { status: 400 }
            );
        }

        const result = await sshExec(config, command);
        return NextResponse.json(result);
    } catch (error) {
        console.error("SSH API Error:", error);
        return NextResponse.json(
            { success: false, error: "Error interno del servidor SSH" },
            { status: 500 }
        );
    }
}

// GET - Quick server status check
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const host = url.searchParams.get("host");
    const port = parseInt(url.searchParams.get("port") || "22");
    const username = url.searchParams.get("username");
    const password = url.searchParams.get("password");

    if (!host || !username || !password) {
        return NextResponse.json(
            { success: false, error: "Faltan parámetros" },
            { status: 400 }
        );
    }

    const result = await testSSHConnection({ host, port, username, password });
    return NextResponse.json(result);
}
