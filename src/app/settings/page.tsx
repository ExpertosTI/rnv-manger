"use client";

import { useState, useEffect } from "react";
import {
    Settings, Save, Mail, Key, Bell, Server, RefreshCw,
    CheckCircle, AlertTriangle, Eye, EyeOff, Shield, Database, Download, Upload, HardDrive
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import BackupPanel from "@/components/BackupPanel";

interface SettingsSection {
    id: string;
    title: string;
    icon: React.ElementType;
    description: string;
    fields: SettingsField[];
}

interface SettingsField {
    key: string;
    label: string;
    type: "text" | "password" | "number" | "email";
    placeholder?: string;
    description?: string;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
    {
        id: "smtp",
        title: "Email (SMTP)",
        icon: Mail,
        description: "Configuración para enviar notificaciones por email",
        fields: [
            { key: "smtp_host", label: "Host SMTP", type: "text", placeholder: "smtp.gmail.com" },
            { key: "smtp_port", label: "Puerto", type: "number", placeholder: "587" },
            { key: "smtp_user", label: "Usuario", type: "email", placeholder: "tu@email.com" },
            { key: "smtp_pass", label: "Contraseña", type: "password", placeholder: "••••••••" },
            { key: "alert_email", label: "Email de alertas", type: "email", placeholder: "admin@tuempresa.com", description: "Recibe alertas de pagos y recursos" },
        ],
    },
    {
        id: "api",
        title: "API Tokens",
        icon: Key,
        description: "Tokens de acceso para integraciones",
        fields: [
            { key: "hostinger_token", label: "Hostinger API Token", type: "password", placeholder: "Bearer token..." },
            { key: "odoo_url", label: "Odoo URL", type: "text", placeholder: "https://odoo.tuempresa.com" },
            { key: "odoo_db", label: "Odoo Database", type: "text", placeholder: "production" },
            { key: "odoo_user", label: "Odoo Usuario", type: "text", placeholder: "admin" },
            { key: "odoo_key", label: "Odoo API Key", type: "password", placeholder: "API key..." },
        ],
    },
    {
        id: "alerts",
        title: "Umbrales de Alertas",
        icon: Bell,
        description: "Configurar cuándo se generan alertas de recursos",
        fields: [
            { key: "alert_cpu_warning", label: "CPU Warning (%)", type: "number", placeholder: "70" },
            { key: "alert_cpu_critical", label: "CPU Critical (%)", type: "number", placeholder: "90" },
            { key: "alert_ram_warning", label: "RAM Warning (%)", type: "number", placeholder: "80" },
            { key: "alert_ram_critical", label: "RAM Critical (%)", type: "number", placeholder: "95" },
            { key: "alert_disk_warning", label: "Disco Warning (%)", type: "number", placeholder: "85" },
            { key: "alert_disk_critical", label: "Disco Critical (%)", type: "number", placeholder: "95" },
        ],
    },
    {
        id: "security",
        title: "Seguridad",
        icon: Shield,
        description: "Configuración de seguridad de la aplicación",
        fields: [
            { key: "master_password", label: "Master Password", type: "password", placeholder: "Contraseña maestra" },
            { key: "session_timeout", label: "Timeout de sesión (min)", type: "number", placeholder: "60" },
        ],
    },
    {
        id: "backup",
        title: "Backups",
        icon: Database,
        description: "Credenciales SSH para respaldos de datos",
        fields: [
            { key: "backup_host", label: "Host", type: "text", placeholder: "127.0.0.1" },
            { key: "backup_port", label: "Puerto", type: "number", placeholder: "22" },
            { key: "backup_user", label: "Usuario SSH", type: "text", placeholder: "root" },
        ],
    },
];

export default function SettingsPage() {
    const { addToast } = useToast();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
    const [smtpStatus, setSmtpStatus] = useState<"unknown" | "ok" | "error">("unknown");
    const [backupPassword, setBackupPassword] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        fetchSettings();
        checkSmtpStatus();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch("/api/settings");
            const data = await res.json();
            if (data.success) {
                setSettings(data.data || {});
            }
        } catch (err) {
            console.error("Error fetching settings:", err);
        } finally {
            setLoading(false);
        }
    };

    const checkSmtpStatus = async () => {
        try {
            const res = await fetch("/api/email");
            const data = await res.json();
            setSmtpStatus(data.success ? "ok" : "error");
        } catch {
            setSmtpStatus("error");
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings }),
            });
            const data = await res.json();

            if (data.success) {
                addToast("Configuración guardada. Los cambios se aplicaron.", "success");
                checkSmtpStatus();
            } else {
                addToast(data.error || "No se pudo guardar la configuración", "error");
            }
        } catch (err) {
            addToast("No se pudo guardar", "error");
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const togglePassword = (key: string) => {
        setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const requestBackupPassword = async (): Promise<string | null> => {
        if (backupPassword) return backupPassword;
        const pwd = window.prompt("Contraseña SSH:");
        if (pwd) setBackupPassword(pwd);
        return pwd;
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await fetch("/api/system/export");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `rnv-backup-${new Date().toISOString().split("T")[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            addToast("Exportación completada. Archivo descargado.", "success");
        } catch (err) {
            console.error(err);
            addToast("Falló la exportación", "error");
        } finally {
            setExporting(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm("⚠️ ADVERTENCIA: Esta acción reemplazará TODOS los datos actuales con los del respaldo. ¿Estás seguro de continuar?")) {
            e.target.value = "";
            return;
        }

        setImporting(true);
        try {
            const content = await file.text();
            const json = JSON.parse(content);

            const res = await fetch("/api/system/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(json),
            });

            const data = await res.json();
            if (data.success) {
                addToast("Restauración exitosa. Recargando página...", "success");
                setTimeout(() => window.location.reload(), 2000);
            } else {
                addToast(data.error || "Falló la importación", "error");
            }
        } catch (err) {
            console.error(err);
            addToast("Archivo de respaldo inválido", "error");
        } finally {
            setImporting(false);
            e.target.value = "";
        }
    };

    const backupHost = settings.backup_host || "";
    const backupUser = settings.backup_user || "";
    const backupPort = parseInt(settings.backup_port || "22", 10) || 22;
    const backupReady = Boolean(backupHost && backupUser);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Configuración</h1>
                    <p className="text-gray-400 mt-1">Gestiona las preferencias y conexiones de la aplicación</p>
                </div>
                <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-600 text-white font-medium rounded-xl transition flex items-center gap-2"
                >
                    {saving ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                        <Save className="w-5 h-5" />
                    )}
                    Guardar Cambios
                </button>
            </div>

            {/* SMTP Status Banner */}
            <div className={`p-4 rounded-xl border ${smtpStatus === "ok"
                    ? "bg-green-900/30 border-green-700"
                    : smtpStatus === "error"
                        ? "bg-red-900/30 border-red-700"
                        : "bg-gray-800 border-gray-700"
                }`}>
                <div className="flex items-center gap-3">
                    {smtpStatus === "ok" ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : smtpStatus === "error" ? (
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                    ) : (
                        <Mail className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                        <p className={`font-medium ${smtpStatus === "ok" ? "text-green-300" :
                                smtpStatus === "error" ? "text-red-300" : "text-gray-300"
                            }`}>
                            {smtpStatus === "ok" ? "Email configurado y funcionando" :
                                smtpStatus === "error" ? "Email no configurado o con errores" :
                                    "Verificando configuración de email..."}
                        </p>
                        <p className="text-sm text-gray-500">
                            {smtpStatus === "error" && "Configura SMTP para recibir alertas por email"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Settings Sections */}
            <div className="grid gap-6">
                {SETTINGS_SECTIONS.map((section) => (
                    <div key={section.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="px-6 py-4 bg-gray-900 border-b border-gray-700 flex items-center gap-3">
                            <section.icon className="w-5 h-5 text-violet-400" />
                            <div>
                                <h2 className="font-bold text-white">{section.title}</h2>
                                <p className="text-sm text-gray-500">{section.description}</p>
                            </div>
                        </div>
                        <div className="p-6 grid gap-4 md:grid-cols-2">
                            {section.fields.map((field) => (
                                <div key={field.key} className="space-y-1">
                                    <label className="text-sm font-medium text-gray-300">
                                        {field.label}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={field.type === "password" && !showPasswords[field.key] ? "password" : field.type === "password" ? "text" : field.type}
                                            value={settings[field.key] || ""}
                                            onChange={(e) => updateSetting(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none pr-10"
                                        />
                                        {field.type === "password" && (
                                            <button
                                                type="button"
                                                onClick={() => togglePassword(field.key)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                            >
                                                {showPasswords[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </div>
                                    {field.description && (
                                        <p className="text-xs text-gray-500">{field.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 bg-gray-900 border-b border-gray-700 flex items-center gap-3">
                    <HardDrive className="w-5 h-5 text-cyan-400" />
                    <div>
                        <h2 className="font-bold text-white">Gestión de Datos Locales</h2>
                        <p className="text-sm text-gray-500">Exportar e importar datos de la aplicación para migración</p>
                    </div>
                </div>
                <div className="p-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="flex-1 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-200 px-6 py-4 rounded-xl flex items-center justify-center gap-3 transition"
                        >
                            {exporting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                            <div className="text-left">
                                <span className="block font-bold">Exportar Datos</span>
                                <span className="text-xs opacity-70">Descargar JSON completo</span>
                            </div>
                        </button>

                        <div className="flex-1 relative">
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                disabled={importing}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-200 px-6 py-4 rounded-xl flex items-center justify-center gap-3 transition h-full">
                                {importing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                <div className="text-left">
                                    <span className="block font-bold">Importar Datos</span>
                                    <span className="text-xs opacity-70">Restaurar desde JSON</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-4 text-center">
                        ⚠️ La importación reemplazará todos los datos actuales. Asegúrate de tener un respaldo reciente.
                    </p>
                </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-6 py-4 bg-gray-900 border-b border-gray-700 flex items-center gap-3">
                    <Database className="w-5 h-5 text-violet-400" />
                    <div>
                        <h2 className="font-bold text-white">Backup de datos</h2>
                        <p className="text-sm text-gray-500">Genera respaldos desde el servidor configurado</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {!backupReady && (
                        <div className="text-sm text-yellow-300">
                            Completa Host y Usuario SSH en la sección de Backups para habilitar el respaldo.
                        </div>
                    )}
                    {backupReady && (
                        <BackupPanel
                            host={backupHost}
                            port={backupPort}
                            username={backupUser}
                            onPasswordRequest={requestBackupPassword}
                        />
                    )}
                </div>
            </div>

            {/* Info */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="flex items-start gap-3">
                    <Server className="w-5 h-5 text-cyan-400 mt-0.5" />
                    <div>
                        <p className="text-sm text-gray-300 font-medium">Configuración almacenada en base de datos</p>
                        <p className="text-xs text-gray-500 mt-1">
                            Los cambios se guardan en la tabla <code className="bg-gray-700 px-1 rounded">AppSettings</code>
                            y están disponibles para todas las instancias de la aplicación.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
