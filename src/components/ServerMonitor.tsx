"use client";

import { useState, useEffect } from "react";
import { Cpu, HardDrive, MemoryStick, Activity, AlertTriangle, RefreshCw, Thermometer } from "lucide-react";

interface SystemMetrics {
    cpu: { usage: number; cores: number; load: number[] };
    memory: { total: number; used: number; free: number; percent: number };
    disk: { total: number; used: number; free: number; percent: number };
    processes: { total: number; running: number };
    uptime: string;
    alerts: Alert[];
}

interface Alert {
    type: "cpu" | "memory" | "disk";
    level: "warning" | "critical";
    message: string;
    value: number;
}

interface ServerMonitorProps {
    host: string;
    port: number;
    username: string;
    onPasswordRequest: () => Promise<string | null>;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
    const percent = Math.min((value / max) * 100, 100);
    return (
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
                className={`h-full ${color} transition-all duration-500`}
                style={{ width: `${percent}%` }}
            />
        </div>
    );
}

function getStatusColor(percent: number): string {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-yellow-500";
    return "bg-green-500";
}

export default function ServerMonitor({ host, port, username, onPasswordRequest }: ServerMonitorProps) {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [password, setPassword] = useState<string | null>(null);

    const fetchMetrics = async (pwd?: string) => {
        const usePassword = pwd || password;
        if (!usePassword) {
            const newPwd = await onPasswordRequest();
            if (!newPwd) return;
            setPassword(newPwd);
            return fetchMetrics(newPwd);
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/monitor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ host, port, username, password: usePassword }),
            });
            const data = await res.json();

            if (data.success) {
                setMetrics(data.data);
            } else {
                setError(data.error || "Error obteniendo métricas");
            }
        } catch (err) {
            setError("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Auto-refresh every 30 seconds if we have password
        if (!password) return;

        const interval = setInterval(() => fetchMetrics(), 30000);
        return () => clearInterval(interval);
    }, [password]);

    if (!metrics && !loading && !error) {
        return (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Activity className="w-5 h-5 text-cyan-400" />
                        <span className="text-gray-300 font-medium">Monitor de Recursos</span>
                    </div>
                    <button
                        onClick={() => fetchMetrics()}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg"
                    >
                        Activar Monitor
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <Thermometer className="w-5 h-5 text-cyan-400" />
                    <span className="text-white font-medium">Monitor de Recursos</span>
                    {metrics?.uptime && (
                        <span className="text-xs text-gray-500">Uptime: {metrics.uptime}</span>
                    )}
                </div>
                <button
                    onClick={() => fetchMetrics()}
                    disabled={loading}
                    className="p-1.5 hover:bg-gray-700 rounded-lg transition"
                >
                    <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {/* Alerts */}
            {metrics?.alerts && metrics.alerts.length > 0 && (
                <div className="p-3 bg-red-900/30 border-b border-red-800">
                    {metrics.alerts.map((alert, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                            <AlertTriangle className={`w-4 h-4 ${alert.level === "critical" ? "text-red-400" : "text-yellow-400"}`} />
                            <span className={alert.level === "critical" ? "text-red-300" : "text-yellow-300"}>
                                {alert.message}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-900/30 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {loading && !metrics && (
                <div className="p-8 text-center">
                    <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Obteniendo métricas...</p>
                </div>
            )}

            {metrics && (
                <div className="p-4 space-y-4">
                    {/* CPU */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <Cpu className="w-4 h-4 text-blue-400" />
                                <span className="text-sm text-gray-300">CPU</span>
                            </div>
                            <span className="text-sm font-mono text-white">{metrics.cpu.usage.toFixed(1)}%</span>
                        </div>
                        <ProgressBar value={metrics.cpu.usage} color={getStatusColor(metrics.cpu.usage)} />
                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                            <span>{metrics.cpu.cores} cores</span>
                            <span>Load: {metrics.cpu.load.map(l => l.toFixed(2)).join(", ")}</span>
                        </div>
                    </div>

                    {/* Memory */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <MemoryStick className="w-4 h-4 text-purple-400" />
                                <span className="text-sm text-gray-300">RAM</span>
                            </div>
                            <span className="text-sm font-mono text-white">{metrics.memory.percent.toFixed(1)}%</span>
                        </div>
                        <ProgressBar value={metrics.memory.percent} color={getStatusColor(metrics.memory.percent)} />
                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                            <span>{formatBytes(metrics.memory.used)} usado</span>
                            <span>{formatBytes(metrics.memory.total)} total</span>
                        </div>
                    </div>

                    {/* Disk */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <HardDrive className="w-4 h-4 text-green-400" />
                                <span className="text-sm text-gray-300">Disco</span>
                            </div>
                            <span className="text-sm font-mono text-white">{metrics.disk.percent.toFixed(1)}%</span>
                        </div>
                        <ProgressBar value={metrics.disk.percent} color={getStatusColor(metrics.disk.percent)} />
                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                            <span>{formatBytes(metrics.disk.used)} usado</span>
                            <span>{formatBytes(metrics.disk.total)} total</span>
                        </div>
                    </div>

                    {/* Processes */}
                    <div className="flex justify-between text-xs text-gray-500 pt-2 border-t border-gray-700">
                        <span>Procesos: {metrics.processes.total}</span>
                        <span>En ejecución: {metrics.processes.running}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
