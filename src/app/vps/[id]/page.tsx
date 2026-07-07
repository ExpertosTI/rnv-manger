"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Terminal, Download, Activity, ArrowLeft, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SSHConsole = dynamic(() => import("@/components/SSHConsole"), { ssr: false });
const ServerMonitor = dynamic(() => import("@/components/ServerMonitor"), { ssr: false });
const BackupPanel = dynamic(() => import("@/components/BackupPanel"), { ssr: false });

interface Service {
    id: string;
    name: string;
    type: string;
    port?: number;
    url?: string;
    configFile?: string;
    monthlyCost: number;
    status: string;
    client?: { id: string; name: string } | null;
}

interface VPS {
    id: string;
    name: string;
    ipAddress: string;
    provider: string;
    hostingerId?: string;
    status: string;
    monthlyCost: number;
    sshUser: string;
    sshPort: number;
    client?: { id: string; name: string; email?: string } | null;
    services: Service[];
    totalServiceCost?: number;
    totalMonthlyCost?: number;
}

interface Client {
    id: string;
    name: string;
}

export default function VPSDetailPage() {
    const params = useParams();
    const vpsId = params.id as string;

    const [vps, setVps] = useState<VPS | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [showAddService, setShowAddService] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
    const [showMonitor, setShowMonitor] = useState(false);
    const [showBackup, setShowBackup] = useState(false);
    const [sshPassword, setSshPassword] = useState<string | null>(null);

    // Password prompt for SSH operations
    const requestPassword = async (): Promise<string | null> => {
        if (sshPassword) return sshPassword;
        const pwd = window.prompt("Contraseña SSH:");
        if (pwd) setSshPassword(pwd);
        return pwd;
    };

    // Edit form state
    const [editForm, setEditForm] = useState({
        name: "",
        monthlyCost: 0,
        clientId: "",
    });

    // New service form
    const [newService, setNewService] = useState({
        name: "",
        type: "odoo",
        url: "",
        port: 0,
        monthlyCost: 0,
        configFile: "",
    });

    useEffect(() => {
        fetchVPS();
        fetchClients();
    }, [vpsId]);

    const fetchVPS = async () => {
        try {
            const res = await fetch(`/api/vps/${vpsId}`);
            const data = await res.json();
            if (data.success) {
                setVps(data.data);
                setEditForm({
                    name: data.data.name,
                    monthlyCost: data.data.monthlyCost || 0,
                    clientId: data.data.client?.id || "",
                });
            }
        } catch (err) {
            console.error("Error fetching VPS:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchClients = async () => {
        try {
            const res = await fetch("/api/clients");
            const data = await res.json();
            if (data.success) {
                setClients(data.data);
            }
        } catch (err) {
            console.error("Error fetching clients:", err);
        }
    };

    const handleSaveVPS = async () => {
        try {
            const res = await fetch(`/api/vps/${vpsId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            const data = await res.json();
            if (data.success) {
                setVps(data.data);
                setEditing(false);
                fetchVPS(); // Reload to get updated relations
            }
        } catch (err) {
            console.error("Error saving VPS:", err);
        }
    };

    const handleAddService = async () => {
        try {
            const res = await fetch(`/api/vps/${vpsId}/services`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...newService,
                    url: newService.url || `https://${newService.name}.renace.tech`,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setShowAddService(false);
                setNewService({ name: "", type: "odoo", url: "", port: 0, monthlyCost: 0, configFile: "" });
                fetchVPS();
            }
        } catch (err) {
            console.error("Error adding service:", err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-500 border-t-transparent" />
            </div>
        );
    }

    if (!vps) {
        return (
            <div className="space-y-4">
                <p className="text-gray-700">VPS no encontrado</p>
                <Link href="/vps" className="text-violet-600 hover:underline inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Volver a VPS
                </Link>
            </div>
        );
    }

    const serviceCost = (vps.services ?? []).reduce((sum, s) => sum + (s.monthlyCost || 0), 0);
    const totalMonthly = (vps.monthlyCost || 0) + serviceCost;

    const statusBadge = vps.status === "running"
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : vps.status === "stopped"
            ? "bg-red-100 text-red-800 border-red-200"
            : "bg-amber-100 text-amber-800 border-amber-200";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <Link href="/vps" className="text-muted-foreground hover:text-gray-900 inline-flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> VPS
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <Server className="w-7 h-7 text-violet-600" />
                        {vps.name}
                    </h1>
                    <Badge className={statusBadge}>{vps.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setShowTerminal(!showTerminal)} className="gap-2 rounded-xl border-2">
                        <Terminal className="w-4 h-4" />
                        {showTerminal ? "Cerrar" : "Terminal"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowMonitor(!showMonitor)} className="gap-2 rounded-xl border-2">
                        <Activity className="w-4 h-4" />
                        {showMonitor ? "Cerrar" : "Monitor"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowBackup(!showBackup)} className="gap-2 rounded-xl border-2">
                        <Download className="w-4 h-4" />
                        {showBackup ? "Cerrar" : "Backup"}
                    </Button>
                    <Button onClick={() => setEditing(!editing)} className="rounded-xl">
                        {editing ? "Cancelar" : "Editar VPS"}
                    </Button>
                </div>
            </div>

            {/* SSH Terminal */}
            {showTerminal && (
                <div className="mb-6">
                    <SSHConsole
                        host={vps.ipAddress}
                        port={vps.sshPort || 22}
                        username={vps.sshUser || "root"}
                        onClose={() => setShowTerminal(false)}
                    />
                </div>
            )}

            {/* Server Monitor */}
            {showMonitor && (
                <div className="mb-6">
                    <ServerMonitor
                        host={vps.ipAddress}
                        port={vps.sshPort || 22}
                        username={vps.sshUser || "root"}
                        onPasswordRequest={requestPassword}
                    />
                </div>
            )}

            {/* Backup Panel */}
            {showBackup && (
                <div className="mb-6">
                    <BackupPanel
                        host={vps.ipAddress}
                        port={vps.sshPort || 22}
                        username={vps.sshUser || "root"}
                        onPasswordRequest={requestPassword}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Información del VPS</CardTitle>
                    </CardHeader>
                    <CardContent>
                    {editing ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700">Nombre</label>
                                <Input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">Costo mensual ($)</label>
                                <Input
                                    type="number"
                                    value={editForm.monthlyCost}
                                    onChange={(e) => setEditForm({ ...editForm, monthlyCost: parseFloat(e.target.value) || 0 })}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">Asignar a cliente</label>
                                <select
                                    value={editForm.clientId}
                                    onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                                >
                                    <option value="">— Sin cliente —</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <Button onClick={handleSaveVPS} className="w-full rounded-xl">
                                Guardar cambios
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">IP</span>
                                <span className="font-mono text-violet-700">{vps.ipAddress}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">Proveedor</span>
                                <span>{vps.provider}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">SSH</span>
                                <span className="font-mono text-xs">{vps.sshUser}@{vps.ipAddress}:{vps.sshPort}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">Hostinger ID</span>
                                <span className="font-mono text-xs">{vps.hostingerId || "N/A"}</span>
                            </div>
                            <hr className="border-gray-100 my-4" />
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Costo VPS</span>
                                <span className="text-emerald-700 font-medium">${vps.monthlyCost}/mes</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Costo servicios</span>
                                <span className="text-emerald-700 font-medium">${serviceCost.toFixed(2)}/mes</span>
                            </div>
                            <div className="flex justify-between font-bold">
                                <span>Total</span>
                                <span className="text-violet-700">${totalMonthly.toFixed(2)}/mes</span>
                            </div>
                            <hr className="border-gray-100 my-4" />
                            <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">Cliente</span>
                                {vps.client ? (
                                    <Link href={`/clients/${vps.client.id}`} className="text-violet-600 hover:underline font-medium">
                                        {vps.client.name}
                                    </Link>
                                ) : (
                                    <span className="text-amber-600">Sin asignar</span>
                                )}
                            </div>
                            <Link href="/map" className="inline-block text-xs text-violet-600 hover:underline mt-2">
                                Ver en mapa de infra →
                            </Link>
                        </div>
                    )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2 rounded-2xl border-2 border-gray-100 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">Servicios ({vps.services?.length || 0})</CardTitle>
                        <Button variant="outline" size="sm" onClick={() => setShowAddService(!showAddService)} className="rounded-xl">
                            {showAddService ? "Cancelar" : "+ Añadir servicio"}
                        </Button>
                    </CardHeader>
                    <CardContent>

                    {showAddService && (
                        <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Subdominio</label>
                                    <Input
                                        type="text"
                                        placeholder="ej. miapp"
                                        value={newService.name}
                                        onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                                        className="mt-1"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">→ {newService.name || "subdominio"}.renace.tech</p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Tipo</label>
                                    <select
                                        value={newService.type}
                                        onChange={(e) => setNewService({ ...newService, type: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                                    >
                                        <option value="odoo">Odoo</option>
                                        <option value="web">Web</option>
                                        <option value="api">API</option>
                                        <option value="database">Database</option>
                                        <option value="storage">Storage</option>
                                        <option value="ai">AI</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Puerto (opcional)</label>
                                    <Input
                                        type="number"
                                        value={newService.port || ""}
                                        onChange={(e) => setNewService({ ...newService, port: parseInt(e.target.value) || 0 })}
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Costo mensual ($)</label>
                                    <Input
                                        type="number"
                                        value={newService.monthlyCost || ""}
                                        onChange={(e) => setNewService({ ...newService, monthlyCost: parseFloat(e.target.value) || 0 })}
                                        className="mt-1"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-sm font-medium text-gray-700">Ruta config (opcional)</label>
                                    <Input
                                        type="text"
                                        placeholder="/etc/nginx/sites-available/..."
                                        value={newService.configFile}
                                        onChange={(e) => setNewService({ ...newService, configFile: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                            <Button onClick={handleAddService} className="mt-4 w-full rounded-xl">
                                Crear servicio
                            </Button>
                        </div>
                    )}

                    <div className="grid gap-3">
                        {vps.services?.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">Sin servicios configurados</p>
                        ) : (
                            vps.services?.map((service) => (
                                <div key={service.id} className="rounded-xl p-4 border-2 border-gray-100 hover:border-violet-200 transition bg-white">
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Link
                                                    href={`/services/${service.id}`}
                                                    className="text-base font-semibold text-violet-700 hover:underline"
                                                >
                                                    {service.name}
                                                </Link>
                                                <Badge variant="outline" className="text-xs">{service.type}</Badge>
                                            </div>
                                            {service.url && (
                                                <a
                                                    href={service.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-muted-foreground hover:text-violet-600 mt-1 block"
                                                >
                                                    {service.url}
                                                </a>
                                            )}
                                            {service.configFile && (
                                                <p className="text-xs text-muted-foreground mt-1 font-mono">{service.configFile}</p>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-emerald-700 font-semibold">${service.monthlyCost}/mes</p>
                                            {service.client ? (
                                                <p className="text-xs text-muted-foreground">→ {service.client.name}</p>
                                            ) : (
                                                <p className="text-xs text-amber-600">Sin cliente</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
