"use client";

import React, { useEffect, useState, useRef } from "react";
import { Terminal as TerminalIcon, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface LogEntry {
    type: "info" | "success" | "warning" | "error" | "log";
    message: string;
    status?: "success" | "error";
    progress?: number;
    timestamp: string;
}

interface TerminalUIProps {
    sessionId: string;
    onComplete: (success: boolean) => void;
}

export default function TerminalUI({ sessionId, onComplete }: TerminalUIProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [status, setStatus] = useState<"connecting" | "running" | "success" | "error">("connecting");
    const [progress, setProgress] = useState<number>(0);
    const [startTime, setStartTime] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Escrollea automáticamente al final al recibir nuevos logs
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const wsRef = useRef<WebSocket | null>(null);

    const getApiBase = () => {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/upgrader-service";
        const normalizedBasePath = basePath.startsWith("/") ? basePath : `/${basePath}`;
        const envApi = process.env.NEXT_PUBLIC_API_URL;
        if (envApi && envApi.length > 0) {
            return envApi.replace(/\/$/, "");
        }
        if (typeof window !== "undefined") {
            return `${window.location.origin}${normalizedBasePath}`;
        }
        return normalizedBasePath;
    };

    useEffect(() => {
        // Prevent duplicate connections from React StrictMode
        if (wsRef.current) return;

        const apiBase = getApiBase();
        const wsBase = apiBase.replace(/^http/, "ws");
        const wsUrl = `${wsBase}/api/sessions/${sessionId}/logs`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus("running");
            setStartTime(Date.now());
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const newLog: LogEntry = {
                    type: data.type || "log",
                    message: data.message,
                    status: data.status,
                    progress: data.progress,
                    timestamp: new Date().toLocaleTimeString(),
                };

                setLogs(prev => [...prev, newLog]);
                if (data.progress !== undefined) {
                    setProgress(data.progress);
                }

                if (newLog.status === "success") {
                    setStatus("success");
                    ws.close();
                    onComplete(true);
                } else if (newLog.status === "error") {
                    setStatus("error");
                    ws.close();
                    onComplete(false);
                }
            } catch (e) {
                console.error("Failed to parse log", event.data);
            }
        };

        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
            // Only set error if we haven't already reached a terminal state
            setStatus((prev) => (prev === "success" || prev === "error") ? prev : "error");
        };

        ws.onclose = () => {
            if (wsRef.current === ws) {
                wsRef.current = null;
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    const getEstimatedTimeRemaining = () => {
        if (!startTime || progress === 0 || progress === 100 || status !== "running") return null;
        const elapsedMs = Date.now() - startTime;
        const totalEstimatedMs = (elapsedMs / progress) * 100;
        const remainingMs = totalEstimatedMs - elapsedMs;

        const seconds = Math.floor((remainingMs / 1000) % 60);
        const minutes = Math.floor((remainingMs / 1000 / 60));

        if (minutes > 0) return `~${minutes}m ${seconds}s`;
        return `~${seconds}s`;
    };

    return (
        <div className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[500px]">
            {/* Terminal Header */}
            <div className="bg-neutral-900 px-4 py-3 border-b border-neutral-800 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2 text-neutral-400">
                    <TerminalIcon className="w-5 h-5" />
                    <span className="font-mono text-sm font-medium">migration_job.sh</span>
                </div>
                <div className="flex items-center gap-4 text-sm font-mono text-neutral-400">
                    {status === "running" && (
                        <div className="flex flex-col items-end">
                            <span className="font-medium text-emerald-400">{progress}%</span>
                            <span className="text-xs text-neutral-500">{getEstimatedTimeRemaining() ?? 'Calculando...'}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {status === "connecting" && <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />}
                        {status === "running" && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>}
                        {status === "success" && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                        {status === "error" && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                </div>
            </div>
            {/* Progress Bar under header */}
            <div className="h-1 bg-neutral-900 w-full relative overflow-hidden">
                <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-600 to-teal-400 shadow-[0_0_15px_rgba(52,211,153,0.5)] transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Terminal Body */}
            <div
                ref={scrollRef}
                className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-2"
                style={{ scrollBehavior: 'smooth' }}
            >
                {logs.map((log, i) => (
                    <div key={i} className="flex gap-3 break-all">
                        <span className="text-neutral-600 shrink-0 select-none">[{log.timestamp}]</span>
                        <span className={cn(
                            "flex-1",
                            log.type === "info" && "text-blue-400",
                            log.type === "success" && "text-emerald-400 font-medium",
                            log.type === "warning" && "text-yellow-400 font-medium",
                            log.type === "error" && "text-red-400 font-bold",
                            log.type === "log" && "text-neutral-300"
                        )}>
                            {log.message}
                        </span>
                    </div>
                ))}
                {status === "running" && (
                    <div className="flex gap-3">
                        <span className="text-neutral-600 shrink-0">[{new Date().toLocaleTimeString()}]</span>
                        <span className="text-neutral-500 flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Procesando...
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
