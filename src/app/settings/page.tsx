"use client";

import { useState, useEffect } from "react";
import {
    Save, Mail, Key, Bell, Server, RefreshCw,
    CheckCircle, AlertTriangle, Eye, EyeOff, Shield, Sparkles, MessageCircle, Copy, Trash2
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
            { key: "smtp_host", label: "Host SMTP", type: "text", placeholder: "smtp.hostinger.com" },
            { key: "smtp_port", label: "Puerto", type: "number", placeholder: "465" },
            { key: "smtp_user", label: "Usuario", type: "email", placeholder: "info@renace.tech" },
            { key: "smtp_pass", label: "Contraseña", type: "password", placeholder: "••••••••" },
            { key: "alert_email", label: "Email de alertas", type: "email", placeholder: "admin@tuempresa.com", description: "Recibe alertas de pagos y recursos" },
        ],
    },
    {
        id: "whatsapp",
        title: "WhatsApp (Evolution API)",
        icon: MessageCircle,
        description: "Canal central — línea 849 (instancia renace en Evolution)",
        fields: [
            { key: "evolution_api_url", label: "URL Evolution API", type: "text", placeholder: "https://evoapi.renace.tech" },
            { key: "evolution_api_key", label: "API Key", type: "password", placeholder: "apikey de Evolution" },
            { key: "evolution_instance", label: "Instancia", type: "text", placeholder: "renace", description: "Nombre exacto en evoapi (ahora: renace)" },
            { key: "whatsapp_notify_numbers", label: "Números de alerta", type: "text", placeholder: "18494577463", description: "OTP/login. Cobros van al teléfono del cliente." },
            { key: "whatsapp_sender_label", label: "Etiqueta remitente", type: "text", placeholder: "Renace" },
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
            { key: "odoo_key", label: "Odoo API Key", type: "password", placeholder: "API key...", description: "Usada por el asistente IA y facturación" },
        ],
    },
    {
        id: "ai",
        title: "Asistente IA",
        icon: Sparkles,
        description: "Motor Gemini — la API key va en el .env del servidor Go",
        fields: [],
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
];

export default function SettingsPage() {
    const { addToast } = useToast();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
    const [smtpStatus, setSmtpStatus] = useState<"unknown" | "ok" | "error">("unknown");
    const [waStatus, setWaStatus] = useState<"unknown" | "ok" | "warning" | "error">("unknown");
    const [waDetail, setWaDetail] = useState("");
    const [testingWa, setTestingWa] = useState(false);
    const [odooStatus, setOdooStatus] = useState<"unknown" | "ok" | "error">("unknown");
    const [testingOdoo, setTestingOdoo] = useState(false);
    const [svcTokens, setSvcTokens] = useState<Array<{
        id: string; name: string; role: string; active: boolean; createdAt?: string;
    }>>([]);
    const [newTokenName, setNewTokenName] = useState("cursor-mcp");
    const [creatingToken, setCreatingToken] = useState(false);
    const [freshToken, setFreshToken] = useState<string | null>(null);

    useEffect(() => {
        fetchSettings();
        checkSmtpStatus();
        checkWhatsAppStatus();
        loadServiceTokens();
    }, []);

    const loadServiceTokens = async () => {
        try {
            const res = await fetch("/api/auth/service-tokens");
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                setSvcTokens(data.data);
            }
        } catch {
            /* sin permiso o no disponible */
        }
    };

    const createServiceToken = async () => {
        setCreatingToken(true);
        setFreshToken(null);
        try {
            const res = await fetch("/api/auth/service-tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newTokenName.trim() || "cursor-mcp", role: "admin" }),
            });
            const data = await res.json();
            if (!data.success || !data.token) {
                addToast(data.error || "No se pudo crear el token", "error");
                return;
            }
            setFreshToken(data.token as string);
            addToast("Token creado — cópialo a mcp/rnv-manager/.env", "success");
            await loadServiceTokens();
        } catch {
            addToast("Error creando token", "error");
        } finally {
            setCreatingToken(false);
        }
    };

    const revokeServiceToken = async (id: string) => {
        try {
            const res = await fetch(`/api/auth/service-tokens/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) {
                addToast(data.error || "No se pudo revocar", "error");
                return;
            }
            addToast("Token revocado", "success");
            await loadServiceTokens();
        } catch {
            addToast("Error revocando token", "error");
        }
    };

    const copyFreshToken = async () => {
        if (!freshToken) return;
        try {
            await navigator.clipboard.writeText(freshToken);
            addToast("Token copiado al portapapeles", "success");
        } catch {
            addToast("No se pudo copiar — selecciona el texto a mano", "warning");
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch("/api/settings");
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                const map: Record<string, string> = {};
                for (const item of data.data) {
                    if (item?.key) map[item.key] = item.value ?? "";
                }
                setSettings(map);
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
            if (data.success && data.data?.configured) {
                setSmtpStatus("ok");
                setSettings((prev) => ({
                    ...prev,
                    smtp_host: data.data.host || prev.smtp_host || "smtp.hostinger.com",
                    smtp_port: String(data.data.port || prev.smtp_port || "465"),
                    smtp_user: data.data.user || prev.smtp_user || "info@renace.tech",
                    smtp_from: data.data.from || prev.smtp_from || "info@renace.tech",
                }));
            } else {
                setSmtpStatus("error");
            }
        } catch {
            setSmtpStatus("error");
        }
    };

    const checkWhatsAppStatus = async () => {
        try {
            const res = await fetch("/api/whatsapp", { credentials: "include" });
            const data = await res.json();
            const d = data.data || {};
            if (data.success && d.configured) {
                setSettings((prev) => ({
                    ...prev,
                    evolution_api_url: d.apiUrl || prev.evolution_api_url || "https://evoapi.renace.tech",
                    evolution_instance: d.instance || prev.evolution_instance || "renace",
                    whatsapp_sender_label: d.senderLabel || prev.whatsapp_sender_label || "Renace",
                }));
                if (d.connected || d.ready) {
                    setWaStatus("ok");
                    setWaDetail(`Instancia ${d.instance} conectada (${d.state || "open"})`);
                } else {
                    setWaStatus("warning");
                    setWaDetail(
                        `Credenciales OK pero instancia desconectada (estado: ${d.state || "close"}). Reconecta el QR en Evolution Manager.`
                    );
                }
            } else {
                setWaStatus("error");
                setWaDetail("Faltan EVOLUTION_API_URL, EVOLUTION_API_KEY o EVOLUTION_INSTANCE en el servidor.");
            }
        } catch {
            setWaStatus("error");
            setWaDetail("No se pudo verificar WhatsApp");
        }
    };

    const testWhatsApp = async () => {
        setTestingWa(true);
        try {
            const resSave = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings }),
            });
            const saveData = await resSave.json();
            if (!saveData.success) {
                addToast(saveData.error || "Error al guardar credenciales", "error");
                return;
            }
            const res = await fetch("/api/whatsapp/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            const data = await res.json();
            if (data.success) {
                setWaStatus("ok");
                addToast("Conexión WhatsApp verificada — no se envió ningún mensaje", "success");
            } else {
                setWaStatus("error");
                addToast(data.error || "No se pudo verificar WhatsApp", "error");
            }
        } catch {
            setWaStatus("error");
            addToast("Error al verificar WhatsApp", "error");
        } finally {
            setTestingWa(false);
        }
    };

    const testOdooConnection = async () => {
        setTestingOdoo(true);
        try {
            const resSave = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings }),
            });
            const saveData = await resSave.json();
            if (!saveData.success) {
                addToast(saveData.error || "Error al guardar credenciales", "error");
                return;
            }
            const res = await fetch("/api/odoo");
            const data = await res.json();
            if (data.success && data.connected) {
                setOdooStatus("ok");
                addToast("Odoo conectado correctamente", "success");
            } else {
                setOdooStatus("error");
                addToast(data.error || "No se pudo conectar a Odoo", "error");
            }
        } catch {
            setOdooStatus("error");
            addToast("Error al probar conexión Odoo", "error");
        } finally {
            setTestingOdoo(false);
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
                addToast("Configuración guardada", "success");
                checkSmtpStatus();
                checkWhatsAppStatus();
            } else {
                addToast(data.error || "Error al guardar", "error");
            }
        } catch {
            addToast("No se pudo guardar la configuración", "error");
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key: string, value: string) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
        );
    }

    const smtpBannerClass =
        smtpStatus === "ok"
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : smtpStatus === "error"
                ? "bg-red-50 border-red-200 text-red-900"
                : "bg-gray-50 border-gray-200 text-gray-700";

    const waBannerClass =
        waStatus === "ok"
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : waStatus === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-900"
            : waStatus === "error"
                ? "bg-red-50 border-red-200 text-red-900"
                : "bg-gray-50 border-gray-200 text-gray-700";

    const odooBannerClass =
        odooStatus === "ok"
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : odooStatus === "error"
                ? "bg-red-50 border-red-200 text-red-900"
                : "bg-gray-50 border-gray-200 text-gray-700";

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
                    <p className="text-muted-foreground mt-1">Preferencias y conexiones de la aplicación</p>
                </div>
                <Button onClick={saveSettings} disabled={saving} className="gap-2 rounded-xl">
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar Cambios
                </Button>
            </div>

            <div className={`p-4 rounded-2xl border-2 ${smtpBannerClass}`}>
                <div className="flex items-center gap-3">
                    {smtpStatus === "ok" ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> :
                        smtpStatus === "error" ? <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" /> :
                            <Mail className="w-5 h-5 shrink-0" />}
                    <div>
                        <p className="font-semibold">
                            {smtpStatus === "ok" ? "Email configurado y funcionando" :
                                smtpStatus === "error" ? "Email no configurado o con errores" :
                                    "Verificando configuración de email..."}
                        </p>
                        {smtpStatus === "error" && (
                            <p className="text-sm opacity-80 mt-0.5">Configura SMTP para recibir alertas por email</p>
                        )}
                    </div>
                </div>
            </div>

            <div className={`p-4 rounded-2xl border-2 ${waBannerClass}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        {waStatus === "ok" ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> :
                            waStatus === "warning" ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" /> :
                            waStatus === "error" ? <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" /> :
                                <MessageCircle className="w-5 h-5 shrink-0" />}
                        <div>
                            <p className="font-semibold">
                                {waStatus === "ok" ? "WhatsApp Renace conectado — listo para notificar" :
                                    waStatus === "warning" ? "WhatsApp configurado pero instancia desconectada" :
                                    waStatus === "error" ? "WhatsApp no configurado en el servidor" :
                                        "WhatsApp — guarda credenciales y envía prueba"}
                            </p>
                            <p className="text-sm opacity-80 mt-0.5">
                                {waDetail || "Remitente: +1 809 348 7921 · API en evoapi.renace.tech"}
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={testWhatsApp} disabled={testingWa} className="gap-2 rounded-xl border-2 border-emerald-300 text-emerald-800">
                        {testingWa ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                        Verificar conexión
                    </Button>
                </div>
            </div>

            <div className={`p-4 rounded-2xl border-2 ${odooBannerClass}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        {odooStatus === "ok" ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> :
                            odooStatus === "error" ? <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" /> :
                                <Key className="w-5 h-5 shrink-0" />}
                        <div>
                            <p className="font-semibold">
                                {odooStatus === "ok" ? "Odoo conectado — el asistente puede editar productos" :
                                    odooStatus === "error" ? "Odoo no conectado" :
                                        "Odoo — guarda credenciales y prueba la conexión"}
                            </p>
                            <p className="text-sm opacity-80 mt-0.5">URL, DB, usuario y API key en API Tokens</p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={testOdooConnection} disabled={testingOdoo} className="gap-2 rounded-xl border-2">
                        {testingOdoo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                        Probar Odoo
                    </Button>
                </div>
            </div>

            <div className="grid gap-6">
                <Card className="rounded-2xl border-2 border-violet-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-violet-50 to-transparent border-b border-violet-100">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Key className="w-5 h-5 text-violet-600" />
                            Cursor MCP
                        </CardTitle>
                        <p className="text-sm text-muted-foreground font-normal">
                            Genera un token <code className="text-violet-700">rnv_…</code> y pégalo en el archivo local{" "}
                            <code className="text-violet-700">mcp/rnv-manager/.env</code> (solo superadmin).
                        </p>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                            <div className="flex-1 space-y-1.5">
                                <label className="text-sm font-medium text-gray-700">Nombre</label>
                                <Input
                                    value={newTokenName}
                                    onChange={(e) => setNewTokenName(e.target.value)}
                                    placeholder="cursor-mcp"
                                />
                            </div>
                            <Button
                                onClick={createServiceToken}
                                disabled={creatingToken}
                                className="gap-2 rounded-xl bg-violet-600 hover:bg-violet-700"
                            >
                                {creatingToken ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                                Crear token admin
                            </Button>
                        </div>

                        {freshToken && (
                            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 space-y-2">
                                <p className="text-sm font-semibold text-amber-900">
                                    Cópialo ahora — no se vuelve a mostrar
                                </p>
                                <code className="block text-xs break-all bg-white border rounded-lg p-3 text-gray-800">
                                    {freshToken}
                                </code>
                                <p className="text-xs text-amber-800">
                                    En el repo: abre <strong>mcp/rnv-manager/.env</strong> y deja:
                                    <br />
                                    <code>RNV_API_TOKEN={freshToken.slice(0, 12)}…</code>
                                </p>
                                <Button variant="outline" size="sm" className="gap-2" onClick={copyFreshToken}>
                                    <Copy className="w-4 h-4" />
                                    Copiar token
                                </Button>
                            </div>
                        )}

                        <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-700">Tokens existentes</p>
                            {svcTokens.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Ninguno aún.</p>
                            ) : (
                                <ul className="divide-y rounded-xl border border-gray-100 overflow-hidden">
                                    {svcTokens.map((t) => (
                                        <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white text-sm">
                                            <div>
                                                <span className="font-medium">{t.name}</span>
                                                <span className="text-muted-foreground ml-2">{t.role}</span>
                                                {!t.active && (
                                                    <span className="ml-2 text-red-600 text-xs">revocado</span>
                                                )}
                                            </div>
                                            {t.active && (
                                                <button
                                                    type="button"
                                                    onClick={() => revokeServiceToken(t.id)}
                                                    className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg"
                                                    title="Revocar"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {SETTINGS_SECTIONS.map((section) => (
                    <Card key={section.id} className="rounded-2xl border-2 border-gray-100 shadow-sm overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-violet-50/80 to-transparent border-b border-gray-100">
                            <CardTitle className="text-base flex items-center gap-2">
                                <section.icon className="w-5 h-5 text-violet-600" />
                                {section.title}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground font-normal">{section.description}</p>
                        </CardHeader>
                        <CardContent className="pt-6 grid gap-4 md:grid-cols-2">
                            {section.fields.map((field) => (
                                <div key={field.key} className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">{field.label}</label>
                                    <div className="relative">
                                        <Input
                                            type={field.type === "password" && !showPasswords[field.key] ? "password" : field.type === "password" ? "text" : field.type}
                                            value={settings[field.key] || ""}
                                            onChange={(e) => updateSetting(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            className={field.type === "password" ? "pr-10" : ""}
                                        />
                                        {field.type === "password" && (
                                            <button
                                                type="button"
                                                onClick={() => setShowPasswords((p) => ({ ...p, [field.key]: !p[field.key] }))}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showPasswords[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </div>
                                    {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                                </div>
                            ))}
                            {section.id === "ai" && (
                                <div className="md:col-span-2 p-4 rounded-xl bg-violet-50 border border-violet-100 text-sm text-gray-700 space-y-2">
                                    <p>El asistente (cono violeta) usa <code className="bg-white px-1.5 py-0.5 rounded border text-violet-700">GEMINI_API_KEY</code> en el servidor.</p>
                                    <p>Puede gestionar clientes, VPS, servicios, mapa de infraestructura, calendario y Odoo.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}

                <Card className="rounded-2xl border-2 border-gray-100">
                    <CardHeader className="border-b border-gray-100">
                        <CardTitle className="text-base flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-violet-600" />
                            Copia de Seguridad y Restauración
                        </CardTitle>
                        <p className="text-sm text-muted-foreground font-normal">Restaura clientes, VPS y servicios desde JSON</p>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center border-2 border-dashed border-gray-200 rounded-2xl p-8 bg-gray-50/50">
                            <RefreshCw className={`w-8 h-8 text-violet-500 mb-4 ${restoring ? "animate-spin" : ""}`} />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">Restaurar desde JSON</h3>
                            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                                Backup incluido: 6 clientes, 7 VPS, 55 servicios (marzo 2026).
                            </p>
                            <div className="flex flex-wrap gap-3 justify-center mb-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={restoring}
                                    className="border-violet-300 text-violet-700 rounded-xl"
                                    onClick={async () => {
                                        setRestoring(true);
                                        try {
                                            const res = await fetch("/api/backup/restore/bundled/rnv_manager_backup_2026-03-14.json", { method: "POST" });
                                            const data = await res.json();
                                            if (data.success) {
                                                addToast(`Restaurado: ${data.counts.clients} clientes, ${data.counts.vps} VPS`, "success");
                                            } else {
                                                addToast(data.error || "Error en restauración", "error");
                                            }
                                        } catch {
                                            addToast("Error al restaurar", "error");
                                        } finally {
                                            setRestoring(false);
                                        }
                                    }}
                                >
                                    Restaurar backup incluido
                                </Button>
                            </div>
                            <label className="cursor-pointer">
                                <input
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    disabled={restoring}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = async (event) => {
                                            try {
                                                const json = JSON.parse(event.target?.result as string);
                                                setRestoring(true);
                                                const res = await fetch("/api/backup/restore", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify(json),
                                                });
                                                const data = await res.json();
                                                if (data.success) {
                                                    addToast(`Restaurado: ${data.counts.clients} clientes, ${data.counts.vps} VPS`, "success");
                                                } else {
                                                    addToast(data.error || "Error", "error");
                                                }
                                            } catch {
                                                addToast("JSON inválido", "error");
                                            } finally {
                                                setRestoring(false);
                                            }
                                        };
                                        reader.readAsText(file);
                                    }}
                                />
                                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 bg-white text-sm font-medium hover:bg-gray-50">
                                    <Save className="w-4 h-4" />
                                    {restoring ? "Restaurando..." : "Seleccionar archivo JSON"}
                                </span>
                            </label>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-2xl border-2 border-gray-100 bg-cyan-50/30">
                <CardContent className="pt-5 flex gap-3">
                    <Server className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-gray-900">Configuración en base de datos</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Los cambios se guardan en <code className="bg-white px-1 rounded border">AppSettings</code>.
                            SMTP de producción también puede venir de <code className="bg-white px-1 rounded border">/etc/rnv-manager/secrets.local</code>.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
