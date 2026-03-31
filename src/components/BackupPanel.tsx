"use client";

import { useState } from "react";
import { Download, Database, FolderArchive, Server, Loader2, CheckCircle, X, FileArchive } from "lucide-react";

interface BackupPanelProps {
    host: string;
    port: number;
    username: string;
    onPasswordRequest: () => Promise<string | null>;
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

const BACKUP_TYPES = [
    { id: "postgres", label: "PostgreSQL", icon: Database, description: "Base de datos PostgreSQL" },
    { id: "mysql", label: "MySQL", icon: Database, description: "Base de datos MySQL" },
    { id: "odoo", label: "Odoo Instance", icon: Server, description: "Instancia Odoo completa" },
    { id: "docker", label: "Docker DB", icon: Database, description: "DB desde container Docker" },
    { id: "files", label: "Archivos", icon: FolderArchive, description: "Directorio específico" },
    { id: "full", label: "Backup Completo", icon: FileArchive, description: "/opt, nginx, home" },
];

export default function BackupPanel({ host, port, username, onPasswordRequest }: BackupPanelProps) {
    const [password, setPassword] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<string>("postgres");
    const [target, setTarget] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<BackupResult | null>(null);
    const [showPanel, setShowPanel] = useState(false);

    const runBackup = async () => {
        let pwd = password;
        if (!pwd) {
            pwd = await onPasswordRequest();
            if (!pwd) return;
            setPassword(pwd);
        }

        setIsRunning(true);
        setResult(null);

        try {
            const res = await fetch("/api/backup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    host,
                    port,
                    username,
                    password: pwd,
                    type: selectedType,
                    target: target || undefined,
                }),
            });
            const data = await res.json();

            if (data.success) {
                setResult(data.data);
            } else {
                setResult({ success: false, type: selectedType, filename: "", error: data.error });
            }
        } catch (err) {
            setResult({ success: false, type: selectedType, filename: "", error: "Error de conexión" });
        } finally {
            setIsRunning(false);
        }
    };

    if (!showPanel) {
        return (
            <button
                onClick={() => setShowPanel(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
                <Download className="w-4 h-4" />
                Backup
            </button>
        );
    }

    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-blue-400" />
                    <span className="text-white font-medium">Panel de Backups</span>
                </div>
                <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-white">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Backup Type Selection */}
                <div>
                    <label className="text-sm text-gray-400 mb-2 block">Tipo de Backup</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {BACKUP_TYPES.map((type) => (
                            <button
                                key={type.id}
                                onClick={() => setSelectedType(type.id)}
                                className={`p-3 rounded-lg border transition text-left ${selectedType === type.id
                                        ? "border-blue-500 bg-blue-900/30"
                                        : "border-gray-600 hover:border-gray-500"
                                    }`}
                            >
                                <type.icon className={`w-4 h-4 mb-1 ${selectedType === type.id ? "text-blue-400" : "text-gray-400"}`} />
                                <div className="text-xs font-medium text-white">{type.label}</div>
                                <div className="text-[10px] text-gray-500">{type.description}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Target Input */}
                {["postgres", "mysql", "odoo", "docker", "files"].includes(selectedType) && (
                    <div>
                        <label className="text-sm text-gray-400 mb-1 block">
                            {selectedType === "files" ? "Ruta a respaldar" :
                                selectedType === "docker" ? "Nombre del container" :
                                    selectedType === "odoo" ? "Nombre de instancia" : "Nombre de base de datos"}
                        </label>
                        <input
                            type="text"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            placeholder={
                                selectedType === "files" ? "/opt/myapp" :
                                    selectedType === "docker" ? "odoo-container" :
                                        selectedType === "odoo" ? "odoo17" : "mi_base_datos"
                            }
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                )}

                {/* Execute Button */}
                <button
                    onClick={runBackup}
                    disabled={isRunning}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
                >
                    {isRunning ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Ejecutando backup...
                        </>
                    ) : (
                        <>
                            <Download className="w-4 h-4" />
                            Ejecutar Backup
                        </>
                    )}
                </button>

                {/* Result */}
                {result && (
                    <div className={`p-4 rounded-lg ${result.success ? "bg-green-900/30 border border-green-700" : "bg-red-900/30 border border-red-700"}`}>
                        <div className="flex items-start gap-3">
                            {result.success ? (
                                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                            ) : (
                                <X className="w-5 h-5 text-red-400 mt-0.5" />
                            )}
                            <div className="flex-1">
                                <p className={`font-medium ${result.success ? "text-green-300" : "text-red-300"}`}>
                                    {result.success ? "Backup completado" : "Error en backup"}
                                </p>
                                {result.success ? (
                                    <div className="text-sm text-gray-300 mt-1 space-y-1">
                                        <p><span className="text-gray-500">Archivo:</span> {result.filename}</p>
                                        <p><span className="text-gray-500">Tamaño:</span> {result.size}</p>
                                        <p><span className="text-gray-500">Ruta:</span> {result.path}</p>
                                        <p><span className="text-gray-500">Duración:</span> {(result.duration! / 1000).toFixed(1)}s</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-red-400 mt-1">{result.error}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Info */}
                <p className="text-xs text-gray-500">
                    Los backups se guardan en <code className="bg-gray-700 px-1 rounded">/tmp/</code> del servidor.
                    Recuerda descargarlos o moverlos a una ubicación segura.
                </p>
            </div>
        </div>
    );
}
