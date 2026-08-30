"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Link2, MessageCircle, QrCode, RefreshCw, Search, Send, Unplug, UserRound,
    Layers, CheckCircle2, AlertTriangle, ShieldCheck, Plus, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { whatsapp as whatsappApi, type EvolutionInstanceInfo } from "@/lib/api";

type WAContact = {
    id?: string;
    remoteJid?: string;
    pushName?: string;
    phone: string;
    matchedKind: "client" | "service" | "both" | "none";
    clientId?: string;
    clientName?: string;
    serviceId?: string;
    serviceName?: string;
    vpsName?: string;
    purpose?: string;
};

type Directory = {
    instance: string;
    state: string;
    total: number;
    matched: number;
    contacts: WAContact[];
};

type ServiceOption = { id: string; name: string };

type QRData = {
    base64?: string;
    state: string;
    instance: string;
    expectedOwner: string;
    ownerNumber?: string;
    ownerOk: boolean;
    connected: boolean;
    message?: string;
};

export default function WhatsAppWizardPage() {
    const { addToast } = useToast();
    const [tab, setTab] = useState<"instances" | "connect" | "directory">("instances");
    const [instances, setInstances] = useState<EvolutionInstanceInfo[]>([]);
    const [instancesLoading, setInstancesLoading] = useState(false);
    const [newInstanceName, setNewInstanceName] = useState("");
    const [qr, setQr] = useState<QRData | null>(null);
    const [qrLoading, setQrLoading] = useState(false);
    const [dir, setDir] = useState<Directory | null>(null);
    const [services, setServices] = useState<ServiceOption[]>([]);
    const [loadingDir, setLoadingDir] = useState(false);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "service" | "client">("all");
    const [linkingPhone, setLinkingPhone] = useState<string | null>(null);
    const [selectedService, setSelectedService] = useState("");
    const [notifyPhone, setNotifyPhone] = useState<string | null>(null);
    const [notifyText, setNotifyText] = useState("");
    const [busy, setBusy] = useState(false);

    const loadInstances = useCallback(async () => {
        setInstancesLoading(true);
        try {
            const res = await whatsappApi.instances();
            if (res.success && Array.isArray(res.data)) {
                setInstances(res.data);
            }
        } catch (error) {
            console.error("Error loading instances:", error);
        } finally {
            setInstancesLoading(false);
        }
    }, []);

    const loadQR = useCallback(async () => {
        setQrLoading(true);
        try {
            const res = await fetch("/api/whatsapp/qr");
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "No se pudo obtener el QR");
            }
            setQr(data.data);
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error QR WhatsApp", "error");
        } finally {
            setQrLoading(false);
        }
    }, [addToast]);

    const loadDirectory = useCallback(async () => {
        setLoadingDir(true);
        try {
            const [contactsRes, servicesRes] = await Promise.all([
                fetch("/api/whatsapp/contacts"),
                fetch("/api/services"),
            ]);
            const contactsData = await contactsRes.json();
            const servicesData = await servicesRes.json();
            if (!contactsRes.ok || !contactsData.success) {
                throw new Error(contactsData.error || "No se pudieron cargar contactos");
            }
            setDir(contactsData.data);
            if (servicesData.success && Array.isArray(servicesData.data)) {
                setServices(servicesData.data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
            }
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error cargando directorio", "error");
        } finally {
            setLoadingDir(false);
        }
    }, [addToast]);

    useEffect(() => {
        void loadInstances();
        void loadQR();
    }, [loadInstances, loadQR]);

    const handleSelectInstance = async (instanceName: string) => {
        if (!instanceName.trim()) return;
        setBusy(true);
        try {
            const res = await whatsappApi.selectInstance(instanceName.trim());
            if (res.success) {
                addToast(`Instancia activa cambiada a '${instanceName}'`, "success");
                setNewInstanceName("");
                await Promise.all([loadInstances(), loadQR()]);
            } else {
                addToast("Error al cambiar instancia", "error");
            }
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error de cambio", "error");
        } finally {
            setBusy(false);
        }
    };

    const contacts = useMemo(() => {
        const list = dir?.contacts || [];
        return list.filter((c) => {
            if (filter === "service" && !c.serviceId) return false;
            if (filter === "client" && !c.clientId) return false;
            if (!query.trim()) return true;
            const q = query.toLowerCase();
            return [c.pushName, c.phone, c.clientName, c.serviceName, c.purpose]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
        });
    }, [dir, filter, query]);

    const logoutSession = async () => {
        setBusy(true);
        try {
            const res = await fetch("/api/whatsapp/logout", { method: "POST" });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "No se pudo desconectar");
            addToast("Sesión de la instancia actual desconectada.", "success");
            await Promise.all([loadInstances(), loadQR()]);
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al desconectar", "error");
        } finally {
            setBusy(false);
        }
    };

    const linkPhone = async () => {
        if (!linkingPhone || !selectedService) {
            addToast("Elige un servicio", "warning");
            return;
        }
        setBusy(true);
        try {
            const res = await fetch("/api/whatsapp/link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serviceId: selectedService, phone: linkingPhone }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "No se pudo vincular");
            addToast("Número vinculado al servicio", "success");
            setLinkingPhone(null);
            setSelectedService("");
            await loadDirectory();
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al vincular", "error");
        } finally {
            setBusy(false);
        }
    };

    const sendNotify = async () => {
        if (!notifyPhone || !notifyText.trim()) {
            addToast("Escribe el mensaje", "warning");
            return;
        }
        setBusy(true);
        try {
            const contact = (dir?.contacts || []).find((c) => c.phone === notifyPhone);
            const res = await fetch("/api/whatsapp/notify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    serviceId: contact?.serviceId,
                    clientId: contact?.clientId,
                    text: notifyText.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "No se pudo enviar");
            addToast(`WhatsApp enviado a ${data.to}`, "success");
            setNotifyPhone(null);
            setNotifyText("");
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al notificar", "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6 pb-16">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black flex items-center gap-3 tracking-tight text-gray-900">
                        <MessageCircle className="w-8 h-8 text-emerald-600" />
                        WhatsApp & Evolution API
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gestiona múltiples instancias aisladas, vincula la línea empresa y envía notificaciones seguras.
                    </p>
                </div>
                <div className="flex bg-gray-100/80 p-1 rounded-2xl border border-gray-200">
                    <button
                        onClick={() => {
                            setTab("instances");
                            void loadInstances();
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            tab === "instances"
                                ? "bg-white text-emerald-700 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                    >
                        <Layers size={14} />
                        Instancias EvoApi ({instances.length})
                    </button>
                    <button
                        onClick={() => {
                            setTab("connect");
                            void loadQR();
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            tab === "connect"
                                ? "bg-white text-emerald-700 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                    >
                        <QrCode size={14} />
                        Código QR & Estado
                    </button>
                    <button
                        onClick={() => {
                            setTab("directory");
                            if (!dir) void loadDirectory();
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            tab === "directory"
                                ? "bg-white text-emerald-700 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                    >
                        <UserRound size={14} />
                        Directorio
                    </button>
                </div>
            </div>

            {/* TAB: INSTANCES MANAGER */}
            {tab === "instances" && (
                <div className="space-y-6">
                    <Card className="rounded-3xl border-2 border-emerald-100 overflow-hidden bg-white/90 backdrop-blur shadow-sm">
                        <CardHeader className="bg-emerald-50/60 border-b pb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                                        <Layers className="text-emerald-600 w-5 h-5" />
                                        Instancias Activas en Evolution API
                                    </CardTitle>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Cada instancia está 100% aislada. RNV solo usa la instancia seleccionada y nunca interfiere con clientes.
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => loadInstances()}
                                    disabled={instancesLoading}
                                    className="rounded-xl gap-1.5 text-xs border-emerald-200 text-emerald-800"
                                >
                                    <RefreshCw size={13} className={instancesLoading ? "animate-spin" : ""} />
                                    Actualizar Lista
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            {/* Instance Selection info */}
                            <div className="space-y-3">
                                {instancesLoading ? (
                                    <div className="flex justify-center py-10">
                                        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                                    </div>
                                ) : instances.length === 0 ? (
                                    <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-200">
                                        <p className="text-sm font-semibold text-gray-700">No se encontraron instancias en Evolution API</p>
                                        <p className="text-xs text-gray-500 mt-1">Crea una instancia nueva a continuación o revisa tu servidor EvoApi.</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3">
                                        {instances.map((inst) => {
                                            const isOpen = inst.state === "open" || inst.state === "connected";
                                            return (
                                                <div
                                                    key={inst.Name}
                                                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                                        inst.IsCurrent
                                                            ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                                                            : "border-gray-100 bg-white hover:border-gray-200"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3.5">
                                                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                                                            inst.IsCurrent
                                                                ? "bg-emerald-600 text-white"
                                                                : "bg-gray-100 text-gray-700"
                                                        }`}>
                                                            {inst.Name.slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-bold text-sm text-gray-900">{inst.Name}</p>
                                                                {inst.IsCurrent && (
                                                                    <Badge className="bg-emerald-600 text-white text-[10px]">
                                                                        Activa en RNV
                                                                    </Badge>
                                                                )}
                                                                {inst.IsCompany && (
                                                                    <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-300 text-[10px] gap-1">
                                                                        <ShieldCheck size={11} /> Línea Empresa
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                                                <span>
                                                                    Número: <span className="font-semibold text-gray-800">
                                                                        {inst.OwnerNumber ? `+${inst.OwnerNumber}` : "Sin vincular"}
                                                                    </span>
                                                                </span>
                                                                <span>·</span>
                                                                <span className={isOpen ? "text-emerald-600 font-semibold" : "text-amber-600 font-medium"}>
                                                                    {isOpen ? "🟢 Conectado" : `🔴 ${inst.State}`}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {inst.IsCurrent ? (
                                                            <Button size="sm" disabled className="bg-emerald-100 text-emerald-800 rounded-xl text-xs gap-1.5 h-8">
                                                                <Check size={13} /> Seleccionada
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={busy}
                                                                onClick={() => handleSelectInstance(inst.Name)}
                                                                className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs h-8"
                                                            >
                                                                Usar esta Instancia
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Manual instance name switcher / creator */}
                            <div className="pt-4 border-t border-gray-100">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                    Conectar a Nombre de Instancia Personalizado
                                </h4>
                                <div className="flex gap-2 max-w-md">
                                    <Input
                                        placeholder="Ej: renace, renace-prod, etc."
                                        value={newInstanceName}
                                        onChange={(e) => setNewInstanceName(e.target.value)}
                                        className="rounded-xl border-gray-300 text-xs h-9"
                                    />
                                    <Button
                                        size="sm"
                                        disabled={!newInstanceName.trim() || busy}
                                        onClick={() => handleSelectInstance(newInstanceName)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-9 shrink-0 gap-1"
                                    >
                                        <Check size={13} /> Guardar
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* TAB: CONNECT & QR */}
            {tab === "connect" && (
                <Card className="rounded-3xl border-2 border-emerald-100 overflow-hidden bg-white/90 backdrop-blur shadow-sm">
                    <CardHeader className="bg-emerald-50/60 border-b">
                        <CardTitle className="text-lg font-bold">Estado de la Instancia Activa: <span className="text-emerald-700 font-mono">{qr?.instance || "renace"}</span></CardTitle>
                        <p className="text-xs text-muted-foreground font-normal">
                            Verifica la conexión o escanea el código QR con el WhatsApp de la empresa.
                        </p>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="flex flex-wrap gap-2.5 text-xs">
                            <Badge variant="outline" className="border-gray-300">Línea empresa requerida: +{qr?.expectedOwner || "18494577463"}</Badge>
                            {qr?.ownerNumber && (
                                <Badge className={qr.ownerOk ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                                    Conectado ahora: +{qr.ownerNumber}
                                </Badge>
                            )}
                            <Badge variant="outline" className="border-gray-300">Estado: {qr?.state || "—"}</Badge>
                        </div>

                        {qr?.message && (
                            <p className={`text-xs rounded-2xl p-3.5 border leading-relaxed ${
                                qr.ownerOk && qr.connected
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-medium"
                                    : "bg-amber-50 border-amber-200 text-amber-950 font-medium"
                            }`}>
                                {qr.message}
                            </p>
                        )}

                        <div className="grid md:grid-cols-2 gap-6 items-start">
                            <div className="rounded-3xl border-2 border-dashed border-emerald-200 bg-white min-h-[280px] grid place-items-center p-6 shadow-inner">
                                {qrLoading ? (
                                    <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                                ) : qr?.connected && qr.ownerOk ? (
                                    <div className="text-center space-y-2">
                                        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                                        <p className="text-xl font-bold text-emerald-800">Línea Vinculada Correctamente</p>
                                        <p className="text-xs text-gray-500 max-w-xs">
                                            La instancia <span className="font-mono font-bold text-gray-800">{qr.instance}</span> está conectada a la línea empresa (+{qr.ownerNumber}).
                                        </p>
                                    </div>
                                ) : qr?.base64 ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={qr.base64} alt="QR WhatsApp Renace" className="w-64 h-64 object-contain rounded-2xl" />
                                ) : (
                                    <p className="text-xs text-muted-foreground text-center px-4">
                                        Pulsa «Generar / Actualizar QR» para vincular el WhatsApp de Renace en esta instancia.
                                    </p>
                                )}
                            </div>

                            <div className="space-y-3">
                                <Button onClick={() => loadQR()} disabled={qrLoading || busy} className="w-full gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-xs h-10">
                                    {qrLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                                    Generar / Actualizar QR
                                </Button>
                                <Button variant="outline" onClick={logoutSession} disabled={busy} className="w-full gap-2 rounded-2xl border-red-200 text-red-700 hover:bg-red-50 text-xs h-10">
                                    <Unplug className="w-4 h-4" />
                                    Desconectar Sesión de esta Instancia
                                </Button>
                                <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 p-3 rounded-2xl border border-gray-200">
                                    📱 En tu móvil: WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo.
                                    Usa la línea de Renace (+{qr?.expectedOwner || "18494577463"}).
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* TAB: DIRECTORY */}
            {tab === "directory" && (
                <div className="space-y-4">
                    {loadingDir ? (
                        <div className="min-h-[40vh] grid place-items-center">
                            <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="pl-9 rounded-2xl text-xs h-10"
                                        placeholder="Buscar por nombre, número, cliente o servicio…"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant={filter === "all" ? "default" : "outline"}
                                        className="rounded-xl text-xs h-10"
                                        onClick={() => setFilter("all")}
                                    >
                                        Todos ({dir?.total || 0})
                                    </Button>
                                    <Button
                                        variant={filter === "client" ? "default" : "outline"}
                                        className="rounded-xl text-xs h-10"
                                        onClick={() => setFilter("client")}
                                    >
                                        Clientes
                                    </Button>
                                    <Button
                                        variant={filter === "service" ? "default" : "outline"}
                                        className="rounded-xl text-xs h-10"
                                        onClick={() => setFilter("service")}
                                    >
                                        Servicios
                                    </Button>
                                </div>
                            </div>

                            <div className="grid gap-3">
                                {contacts.map((c) => (
                                    <Card key={c.phone} className="rounded-2xl border-2 border-gray-100 hover:border-emerald-200 transition-colors shadow-sm">
                                        <CardHeader className="p-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-gray-900">{c.pushName || "Contacto RNV"}</span>
                                                        <Badge variant="outline" className="text-[10px] text-gray-600 bg-gray-50 font-mono">
                                                            +{c.phone}
                                                        </Badge>
                                                        {c.clientName && (
                                                            <Badge className="bg-violet-100 text-violet-800 text-[10px]">
                                                                Cliente: {c.clientName}
                                                            </Badge>
                                                        )}
                                                        {c.serviceName && (
                                                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                                                                Servicio: {c.serviceName}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {c.purpose && (
                                                        <p className="text-xs text-gray-500 mt-1">{c.purpose}</p>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setLinkingPhone(c.phone)}
                                                        className="rounded-xl text-xs h-8 gap-1"
                                                    >
                                                        <Link2 size={13} /> Vincular
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => {
                                                            setNotifyPhone(c.phone);
                                                            setNotifyText(c.clientName
                                                                ? `Hola ${c.clientName}, te escribimos de Renace Tech…`
                                                                : "Hola, te escribimos de Renace Tech…");
                                                        }}
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-8 gap-1"
                                                    >
                                                        <Send size={13} /> Notificar
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardHeader>
                                    </Card>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Modal Link Phone */}
            {linkingPhone && (
                <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
                    <Card className="w-full max-w-md rounded-3xl p-6">
                        <CardHeader className="p-0 pb-3">
                            <CardTitle className="text-base font-bold text-gray-900">Vincular +{linkingPhone} a un Servicio</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 space-y-4">
                            <select
                                className="w-full border rounded-xl p-2.5 text-xs bg-white"
                                value={selectedService}
                                onChange={(e) => setSelectedService(e.target.value)}
                            >
                                <option value="">— Elige un servicio —</option>
                                {services.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setLinkingPhone(null)} className="rounded-xl text-xs">Cancelar</Button>
                                <Button disabled={busy} onClick={linkPhone} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs">Guardar Vínculo</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Modal Notify Phone */}
            {notifyPhone && (
                <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
                    <Card className="w-full max-w-md rounded-3xl p-6">
                        <CardHeader className="p-0 pb-3">
                            <CardTitle className="text-base font-bold text-gray-900">Notificar a +{notifyPhone}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 space-y-4">
                            <textarea
                                className="w-full border rounded-2xl p-3.5 text-xs min-h-[120px] resize-none focus:outline-none focus:border-emerald-500"
                                value={notifyText}
                                onChange={(e) => setNotifyText(e.target.value)}
                                placeholder="Escribe tu mensaje aquí..."
                            />
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setNotifyPhone(null)} className="rounded-xl text-xs">Cancelar</Button>
                                <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs gap-1.5" onClick={sendNotify}>
                                    <Send size={13} /> Enviar WhatsApp
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
