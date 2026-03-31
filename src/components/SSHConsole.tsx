"use client";

import { useState } from "react";
import { Terminal, Loader2, Play, X, Info } from "lucide-react";

interface SSHConsoleProps {
    host: string;
    port: number;
    username: string;
    onClose?: () => void;
}

interface CommandResult {
    command: string;
    output: string;
    success: boolean;
    timestamp: Date;
}

export default function SSHConsole({ host, port, username, onClose }: SSHConsoleProps) {
    const [password, setPassword] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [command, setCommand] = useState("");
    const [isExecuting, setIsExecuting] = useState(false);
    const [history, setHistory] = useState<CommandResult[]>([]);
    const [serverInfo, setServerInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const connect = async () => {
        if (!password) return;
        setIsConnecting(true);
        setError(null);

        try {
            const res = await fetch("/api/ssh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    host,
                    port,
                    username,
                    password,
                    action: "test",
                }),
            });
            const data = await res.json();

            if (data.success) {
                setIsConnected(true);
                // Get server info
                const infoRes = await fetch("/api/ssh", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        host,
                        port,
                        username,
                        password,
                        action: "info",
                    }),
                });
                const infoData = await infoRes.json();
                if (infoData.success) {
                    setServerInfo(infoData.data);
                }
            } else {
                setError(data.message || "Conexión fallida");
            }
        } catch (err) {
            setError("Error de conexión");
        } finally {
            setIsConnecting(false);
        }
    };

    const executeCommand = async () => {
        if (!command.trim() || !isConnected) return;
        setIsExecuting(true);

        try {
            const res = await fetch("/api/ssh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    host,
                    port,
                    username,
                    password,
                    command: command.trim(),
                }),
            });
            const data = await res.json();

            setHistory((prev) => [
                ...prev,
                {
                    command: command.trim(),
                    output: data.output || data.error || "No output",
                    success: data.success,
                    timestamp: new Date(),
                },
            ]);
            setCommand("");
        } catch (err) {
            setHistory((prev) => [
                ...prev,
                {
                    command: command.trim(),
                    output: "Error ejecutando comando",
                    success: false,
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setIsExecuting(false);
        }
    };

    const quickCommands = [
        { label: "Uptime", cmd: "uptime" },
        { label: "Disk", cmd: "df -h /" },
        { label: "Memory", cmd: "free -h" },
        { label: "Docker PS", cmd: "docker ps --format 'table {{.Names}}\t{{.Status}}'" },
        { label: "Services", cmd: "systemctl list-units --type=service --state=running | head -20" },
    ];

    if (!isConnected) {
        return (
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                    <Terminal className="w-6 h-6 text-green-400" />
                    <h3 className="text-lg font-bold text-white">SSH Console</h3>
                </div>
                <p className="text-gray-400 mb-4 text-sm">
                    Conectar a <span className="font-mono text-cyan-400">{username}@{host}:{port}</span>
                </p>
                {error && (
                    <div className="bg-red-900/50 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">
                        {error}
                    </div>
                )}
                <div className="flex gap-2">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña SSH"
                        className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:border-green-500 focus:outline-none"
                        onKeyDown={(e) => e.key === "Enter" && connect()}
                        autoFocus
                    />
                    <button
                        onClick={connect}
                        disabled={!password || isConnecting}
                        className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
                    >
                        {isConnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Play className="w-4 h-4" />
                        )}
                        Conectar
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm text-gray-300 font-mono">
                        {username}@{host}
                    </span>
                    {serverInfo && (
                        <span className="text-xs text-gray-500">
                            {serverInfo.os} • {serverInfo.uptime}
                        </span>
                    )}
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Server Info */}
            {serverInfo && (
                <div className="grid grid-cols-4 gap-2 p-3 bg-gray-800/50 border-b border-gray-700 text-xs">
                    <div>
                        <span className="text-gray-500">CPU:</span>
                        <span className="text-gray-300 ml-1">{serverInfo.cpu.substring(0, 25)}...</span>
                    </div>
                    <div>
                        <span className="text-gray-500">RAM:</span>
                        <span className="text-green-400 ml-1">{serverInfo.memory.used}/{serverInfo.memory.total}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Disk:</span>
                        <span className="text-yellow-400 ml-1">{serverInfo.disk.percent}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Hostname:</span>
                        <span className="text-cyan-400 ml-1">{serverInfo.hostname}</span>
                    </div>
                </div>
            )}

            {/* Quick Commands */}
            <div className="flex gap-2 p-2 bg-gray-800/30 border-b border-gray-700 overflow-x-auto">
                {quickCommands.map((qc) => (
                    <button
                        key={qc.cmd}
                        onClick={() => {
                            setCommand(qc.cmd);
                        }}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 whitespace-nowrap"
                    >
                        {qc.label}
                    </button>
                ))}
            </div>

            {/* Output */}
            <div className="h-64 overflow-y-auto p-4 font-mono text-sm" style={{ backgroundColor: "#1e1e2e" }}>
                {history.length === 0 ? (
                    <p className="text-gray-500">Ready. Escribe un comando...</p>
                ) : (
                    history.map((item, idx) => (
                        <div key={idx} className="mb-4">
                            <div className="flex items-center gap-2 text-green-400">
                                <span>$</span>
                                <span>{item.command}</span>
                            </div>
                            <pre className={`mt-1 whitespace-pre-wrap ${item.success ? "text-gray-300" : "text-red-400"}`}>
                                {item.output}
                            </pre>
                        </div>
                    ))
                )}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 p-3 bg-gray-800 border-t border-gray-700">
                <span className="text-green-400 font-mono">$</span>
                <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && executeCommand()}
                    placeholder="Escribe un comando..."
                    className="flex-1 bg-transparent text-white focus:outline-none font-mono"
                    disabled={isExecuting}
                />
                <button
                    onClick={executeCommand}
                    disabled={isExecuting || !command.trim()}
                    className="px-4 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-white text-sm flex items-center gap-2"
                >
                    {isExecuting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Play className="w-4 h-4" />
                    )}
                    Ejecutar
                </button>
            </div>
        </div>
    );
}
