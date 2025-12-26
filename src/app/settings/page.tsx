"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Settings, Key, Bell, Shield, Database, Globe, Save, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";

export default function SettingsPage() {
    const [showApiKey, setShowApiKey] = useState(false);
    const [hostingerKey, setHostingerKey] = useState("");
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
    const { addToast } = useToast();

    const testHostingerConnection = async () => {
        setTestingConnection(true);
        setConnectionStatus("idle");

        try {
            const res = await fetch("/api/hostinger/vps?refresh=true");
            const data = await res.json();

            if (data.success) {
                setConnectionStatus("success");
                addToast(`Conexión exitosa! ${data.count} servidores encontrados`, "success");
            } else {
                setConnectionStatus("error");
                addToast(data.error || "Error de conexión", "error");
            }
        } catch (err: any) {
            setConnectionStatus("error");
            addToast("Error de conexión con la API", "error");
        } finally {
            setTestingConnection(false);
        }
    };

    const handleSaveSettings = () => {
        addToast("Configuración guardada correctamente", "success");
    };

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
                <p className="text-gray-500 mt-1">Configura tu RNV Manager</p>
            </div>

            {/* Hostinger API */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-xl bg-violet-100">
                        <Globe className="h-6 w-6 text-violet-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Integración con Hostinger</h2>
                        <p className="text-sm text-gray-500">Conecta tu cuenta para sincronizar tus VPS automáticamente</p>
                    </div>
                    {connectionStatus === "success" && (
                        <div className="ml-auto flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                            <CheckCircle size={16} />
                            <span className="text-sm font-medium">Conectado</span>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Token de API</label>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Input
                                    type={showApiKey ? "text" : "password"}
                                    placeholder="Ingresa tu Hostinger API token..."
                                    value={hostingerKey}
                                    onChange={(e) => setHostingerKey(e.target.value)}
                                    className="pr-10"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                >
                                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </Button>
                            </div>
                            <Button
                                onClick={testHostingerConnection}
                                disabled={testingConnection}
                                className="bg-violet-500 hover:bg-violet-600"
                            >
                                {testingConnection ? (
                                    <>
                                        <Loader2 size={16} className="mr-2 animate-spin" />
                                        Probando...
                                    </>
                                ) : (
                                    "Probar Conexión"
                                )}
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500">
                            Obtén tu token desde el{" "}
                            <a href="https://hpanel.hostinger.com/profile/api" target="_blank" className="text-violet-600 hover:underline">
                                Panel de Hostinger
                            </a>
                        </p>
                    </div>

                    {connectionStatus === "error" && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
                            <AlertCircle size={16} />
                            <span className="text-sm">Error de conexión. Verifica tu token.</span>
                        </div>
                    )}
                </div>
            </div>

            {/* SSH Configuration */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-xl bg-green-100">
                        <Key className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Configuración SSH</h2>
                        <p className="text-sm text-gray-500">Ajustes por defecto para conexiones seguras</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Usuario SSH</label>
                        <Input defaultValue="root" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Puerto SSH</label>
                        <Input type="number" defaultValue="22" />
                    </div>
                    <div className="col-span-2 space-y-2">
                        <label className="text-sm font-medium text-gray-700">Clave Privada (.ssh/id_rsa)</label>
                        <Input placeholder="~/.ssh/id_rsa" />
                        <p className="text-xs text-gray-500">Ruta local a tu clave privada</p>
                    </div>
                </div>
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-xl bg-yellow-100">
                        <Bell className="h-6 w-6 text-yellow-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Notificaciones</h2>
                        <p className="text-sm text-gray-500">Configura alertas de sistema y pagos</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-200">
                        <div>
                            <p className="font-medium text-gray-900">Recordatorios de Pago</p>
                            <p className="text-sm text-gray-500">Avisar antes del vencimiento del servicio</p>
                        </div>
                        <Button variant="outline" size="sm">Configurar</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-200">
                        <div>
                            <p className="font-medium text-gray-900">Alertas de Caída</p>
                            <p className="text-sm text-gray-500">Notificar cuando un servicio deja de responder</p>
                        </div>
                        <Button variant="outline" size="sm">Configurar</Button>
                    </div>
                </div>
            </div>

            {/* Database */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-xl bg-blue-100">
                        <Database className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Base de Datos</h2>
                        <p className="text-sm text-gray-500">Gestión de datos locales</p>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <div>
                        <p className="font-medium text-gray-900">Base de Datos SQLite</p>
                        <p className="text-sm text-gray-500">prisma/dev.db</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm">Respaldo</Button>
                        <Button variant="outline" size="sm">Exportar</Button>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button
                    onClick={handleSaveSettings}
                    className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-purple-200"
                >
                    <Save size={16} />
                    Guardar Todo
                </Button>
            </div>
        </div>
    );
}
