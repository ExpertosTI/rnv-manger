"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";

interface SSHTerminalProps {
    host: string;
    port: number;
    username: string;
    onClose?: () => void;
}

export default function SSHTerminal({ host, port, username, onClose }: SSHTerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [showPasswordPrompt, setShowPasswordPrompt] = useState(true);

    const connect = () => {
        if (!password) return;
        setShowPasswordPrompt(false);
        setIsConnecting(true);
        setError(null);

        // Initialize terminal
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
            theme: {
                background: "#1e1e2e",
                foreground: "#cdd6f4",
                cursor: "#f5e0dc",
                selectionBackground: "#45475a",
                black: "#45475a",
                red: "#f38ba8",
                green: "#a6e3a1",
                yellow: "#f9e2af",
                blue: "#89b4fa",
                magenta: "#f5c2e7",
                cyan: "#94e2d5",
                white: "#bac2de",
            },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        if (terminalRef.current) {
            term.open(terminalRef.current);
            fitAddon.fit();
        }

        termRef.current = term;
        term.writeln("\x1b[1;34m[RNV Manager]\x1b[0m Conectando a " + host + "...");

        // Connect via WebSocket to our API
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${window.location.host}/api/ssh?host=${encodeURIComponent(host)}&port=${port}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnecting(false);
                term.writeln("\x1b[1;32m[RNV Manager]\x1b[0m Conexión establecida!");
                term.writeln("");
            };

            ws.onmessage = (event) => {
                term.write(event.data);
            };

            ws.onerror = () => {
                setError("Error de conexión WebSocket");
                setIsConnecting(false);
            };

            ws.onclose = () => {
                term.writeln("\n\x1b[1;31m[RNV Manager]\x1b[0m Conexión cerrada.");
                setIsConnecting(false);
            };

            // Send user input to server
            term.onData((data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                }
            });

            // Handle resize
            const handleResize = () => {
                fitAddon.fit();
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "resize",
                        cols: term.cols,
                        rows: term.rows
                    }));
                }
            };

            window.addEventListener("resize", handleResize);

            return () => {
                window.removeEventListener("resize", handleResize);
            };
        } catch (err) {
            setError("No se pudo conectar al servidor SSH");
            setIsConnecting(false);
        }
    };

    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (termRef.current) {
                termRef.current.dispose();
            }
        };
    }, []);

    if (showPasswordPrompt) {
        return (
            <div className="bg-gray-900 rounded-xl p-6 text-white">
                <h3 className="text-lg font-bold mb-4 text-green-400">
                    🔐 Conexión SSH a {host}
                </h3>
                <p className="text-gray-400 mb-4">
                    Usuario: <span className="text-white font-mono">{username}</span>
                </p>
                <div className="flex gap-2">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña SSH"
                        className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-green-500 focus:outline-none"
                        onKeyDown={(e) => e.key === "Enter" && connect()}
                        autoFocus
                    />
                    <button
                        onClick={connect}
                        disabled={!password}
                        className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
                    >
                        Conectar
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                        >
                            Cancelar
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isConnecting ? "bg-yellow-500 animate-pulse" : error ? "bg-red-500" : "bg-green-500"}`} />
                    <span className="text-sm text-gray-300 font-mono">
                        {username}@{host}:{port}
                    </span>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-sm"
                    >
                        ✕ Cerrar
                    </button>
                )}
            </div>
            {error && (
                <div className="px-4 py-2 bg-red-900/50 text-red-300 text-sm">
                    {error}
                </div>
            )}
            <div
                ref={terminalRef}
                className="h-[400px] p-2"
                style={{ backgroundColor: "#1e1e2e" }}
            />
        </div>
    );
}
