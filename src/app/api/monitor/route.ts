import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";

interface SSHConfig {
    host: string;
    port: number;
    username: string;
    password: string;
}

interface SystemMetrics {
    cpu: {
        usage: number;
        cores: number;
        load: number[];
    };
    memory: {
        total: number;
        used: number;
        free: number;
        percent: number;
    };
    disk: {
        total: number;
        used: number;
        free: number;
        percent: number;
    };
    processes: {
        total: number;
        running: number;
    };
    uptime: string;
    alerts: Alert[];
}

interface Alert {
    type: "cpu" | "memory" | "disk";
    level: "warning" | "critical";
    message: string;
    value: number;
    threshold: number;
}

// Thresholds
const THRESHOLDS = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    disk: { warning: 85, critical: 95 }
};

async function sshExec(config: SSHConfig, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let output = "";

        const timeout = setTimeout(() => {
            conn.end();
            reject(new Error("Command timeout"));
        }, 15000);

        conn.on("ready", () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timeout);
                    conn.end();
                    reject(err);
                    return;
                }
                stream.on("data", (data: Buffer) => { output += data.toString(); });
                stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
                stream.on("close", () => {
                    clearTimeout(timeout);
                    conn.end();
                    resolve(output.trim());
                });
            });
        });

        conn.on("error", (err) => {
            clearTimeout(timeout);
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

function generateAlerts(metrics: Omit<SystemMetrics, 'alerts'>): Alert[] {
    const alerts: Alert[] = [];

    // CPU Alert
    if (metrics.cpu.usage >= THRESHOLDS.cpu.critical) {
        alerts.push({
            type: "cpu",
            level: "critical",
            message: `CPU crítico: ${metrics.cpu.usage.toFixed(1)}%`,
            value: metrics.cpu.usage,
            threshold: THRESHOLDS.cpu.critical
        });
    } else if (metrics.cpu.usage >= THRESHOLDS.cpu.warning) {
        alerts.push({
            type: "cpu",
            level: "warning",
            message: `CPU alto: ${metrics.cpu.usage.toFixed(1)}%`,
            value: metrics.cpu.usage,
            threshold: THRESHOLDS.cpu.warning
        });
    }

    // Memory Alert
    if (metrics.memory.percent >= THRESHOLDS.memory.critical) {
        alerts.push({
            type: "memory",
            level: "critical",
            message: `RAM crítica: ${metrics.memory.percent.toFixed(1)}%`,
            value: metrics.memory.percent,
            threshold: THRESHOLDS.memory.critical
        });
    } else if (metrics.memory.percent >= THRESHOLDS.memory.warning) {
        alerts.push({
            type: "memory",
            level: "warning",
            message: `RAM alta: ${metrics.memory.percent.toFixed(1)}%`,
            value: metrics.memory.percent,
            threshold: THRESHOLDS.memory.warning
        });
    }

    // Disk Alert
    if (metrics.disk.percent >= THRESHOLDS.disk.critical) {
        alerts.push({
            type: "disk",
            level: "critical",
            message: `Disco crítico: ${metrics.disk.percent.toFixed(1)}%`,
            value: metrics.disk.percent,
            threshold: THRESHOLDS.disk.critical
        });
    } else if (metrics.disk.percent >= THRESHOLDS.disk.warning) {
        alerts.push({
            type: "disk",
            level: "warning",
            message: `Disco alto: ${metrics.disk.percent.toFixed(1)}%`,
            value: metrics.disk.percent,
            threshold: THRESHOLDS.disk.warning
        });
    }

    return alerts;
}

// POST - Get system metrics
export async function POST(request: NextRequest) {
    try {
        const { host, port, username, password } = await request.json();

        if (!host || !username || !password) {
            return NextResponse.json({ success: false, error: "Faltan credenciales" }, { status: 400 });
        }

        const config: SSHConfig = { host, port: port || 22, username, password };

        // Get all metrics in parallel
        const [cpuInfo, memInfo, diskInfo, uptimeInfo, processInfo, loadInfo] = await Promise.all([
            sshExec(config, "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").catch(() => "0"),
            sshExec(config, "free -b | awk '/^Mem:/ {print $2,$3,$4}'").catch(() => "0 0 0"),
            sshExec(config, "df -B1 / | awk 'NR==2 {print $2,$3,$4,$5}'").catch(() => "0 0 0 0%"),
            sshExec(config, "uptime -p 2>/dev/null || uptime").catch(() => "unknown"),
            sshExec(config, "ps aux | wc -l; ps aux | grep -c ' R'").catch(() => "0\n0"),
            sshExec(config, "cat /proc/loadavg | awk '{print $1,$2,$3}'").catch(() => "0 0 0"),
        ]);

        // Parse CPU
        const cpuUsage = parseFloat(cpuInfo) || 0;
        const cores = await sshExec(config, "nproc").catch(() => "1");
        const loadParts = loadInfo.split(" ").map(n => parseFloat(n) || 0);

        // Parse Memory
        const memParts = memInfo.split(" ").map(n => parseInt(n) || 0);
        const memTotal = memParts[0] || 1;
        const memUsed = memParts[1] || 0;
        const memFree = memParts[2] || 0;
        const memPercent = (memUsed / memTotal) * 100;

        // Parse Disk
        const diskParts = diskInfo.split(" ");
        const diskTotal = parseInt(diskParts[0]) || 1;
        const diskUsed = parseInt(diskParts[1]) || 0;
        const diskFree = parseInt(diskParts[2]) || 0;
        const diskPercent = parseFloat(diskParts[3]?.replace("%", "")) || 0;

        // Parse Processes
        const procLines = processInfo.split("\n");
        const totalProcs = parseInt(procLines[0]) || 0;
        const runningProcs = parseInt(procLines[1]) || 0;

        const baseMetrics = {
            cpu: {
                usage: cpuUsage,
                cores: parseInt(cores) || 1,
                load: loadParts
            },
            memory: {
                total: memTotal,
                used: memUsed,
                free: memFree,
                percent: memPercent
            },
            disk: {
                total: diskTotal,
                used: diskUsed,
                free: diskFree,
                percent: diskPercent
            },
            processes: {
                total: totalProcs,
                running: runningProcs
            },
            uptime: uptimeInfo
        };

        const metrics: SystemMetrics = {
            ...baseMetrics,
            alerts: generateAlerts(baseMetrics)
        };

        return NextResponse.json({ success: true, data: metrics });
    } catch (error) {
        console.error("Monitor API Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Error obteniendo métricas" },
            { status: 500 }
        );
    }
}
