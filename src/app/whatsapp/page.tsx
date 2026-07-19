"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Link2, MessageCircle, QrCode, RefreshCw, Search, Send, Unplug, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

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
    const [tab, setTab] = useState<"connect" | "directory">("connect");
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
        void loadQR();
    }, [loadQR]);

    useEffect(() => {
        if (!qr?.connected || qr.ownerOk) return;
        const t = setInterval(() => void loadQR(), 4000);
        return () => clearInterval(t);
    }, [qr?.connected, qr?.ownerOk, qr?.base64, loadQR]);

    useEffect(() => {
        if (qr?.base64 && !qr.connected) {
            const t = setInterval(() => void loadQR(), 3500);
            return () => clearInterval(t);
        }
    }, [qr?.base64, qr?.connected, loadQR]);

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
            addToast("Sesión desconectada. Genera un QR nuevo con la línea de Renace.", "success");
            await loadQR();
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
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <MessageCircle className="w-8 h-8 text-emerald-600" />
                        WhatsApp Renace
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Conecta con un QR. Sin formularios: las credenciales viven en el servidor.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={tab === "connect" ? "default" : "outline"}
                        className="rounded-xl gap-2"
                        onClick={() => setTab("connect")}
                    >
                        <QrCode className="w-4 h-4" />
                        Conectar
                    </Button>
                    <Button
                        variant={tab === "directory" ? "default" : "outline"}
                        className="rounded-xl gap-2"
                        onClick={() => {
                            setTab("directory");
                            if (!dir) void loadDirectory();
                        }}
                    >
                        <UserRound className="w-4 h-4" />
                        Directorio
                    </Button>
                </div>
            </div>

            {tab === "connect" && (
                <Card className="rounded-2xl border-2 border-emerald-100 overflow-hidden">
                    <CardHeader className="bg-emerald-50/60 border-b">
                        <CardTitle className="text-lg">Wizard de conexión</CardTitle>
                        <p className="text-sm text-muted-foreground font-normal">
                            1) Si hay un número de cliente conectado, desconéctalo. 2) Genera QR. 3) Escanea con el WhatsApp de Renace.
                        </p>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="flex flex-wrap gap-3 text-sm">
                            <Badge variant="outline">Línea empresa: +{qr?.expectedOwner || "18494577463"}</Badge>
                            {qr?.ownerNumber && (
                                <Badge className={qr.ownerOk ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                                    Conectado ahora: +{qr.ownerNumber}
                                </Badge>
                            )}
                            <Badge variant="outline">Estado: {qr?.state || "—"}</Badge>
                        </div>

                        {qr?.message && (
                            <p className={`text-sm rounded-xl p-3 border ${qr.ownerOk && qr.connected ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-amber-50 border-amber-200 text-amber-950"}`}>
                                {qr.message}
                            </p>
                        )}

                        <div className="grid md:grid-cols-2 gap-6 items-start">
                            <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-white min-h-[280px] grid place-items-center p-4">
                                {qrLoading ? (
                                    <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                                ) : qr?.connected && qr.ownerOk ? (
                                    <div className="text-center space-y-2">
                                        <p className="text-2xl font-semibold text-emerald-700">Listo</p>
                                        <p className="text-sm text-muted-foreground">Línea empresa vinculada. Ya puedes notificar y cobrar por WhatsApp.</p>
                                    </div>
                                ) : qr?.base64 ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={qr.base64} alt="QR WhatsApp Renace" className="w-64 h-64 object-contain" />
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center px-4">
                                        Pulsa «Generar QR» para vincular el WhatsApp de Renace.
                                    </p>
                                )}
                            </div>

                            <div className="space-y-3">
                                <Button onClick={() => loadQR()} disabled={qrLoading || busy} className="w-full gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700">
                                    {qrLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                                    Generar / actualizar QR
                                </Button>
                                <Button variant="outline" onClick={logoutSession} disabled={busy} className="w-full gap-2 rounded-xl border-red-200 text-red-700">
                                    <Unplug className="w-4 h-4" />
                                    Desconectar sesión actual
                                </Button>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    En el móvil: WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo.
                                    Usa <b>solo</b> el teléfono de Renace (+{qr?.expectedOwner || "18494577463"}), nunca el de un cliente.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    ¿Servicios en línea sin cobrar?{" "}
                                    <Link href="/wizard" className="text-emerald-700 hover:underline font-medium">
                                        Abre el wizard de organización
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

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
                                        className="pl-9 rounded-xl"
                                        placeholder="Buscar por nombre, número, cliente o servicio…"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    {(["all", "service", "client"] as const).map((f) => (
                                        <Button key={f} variant={filter === f ? "default" : "outline"} className="rounded-xl" onClick={() => setFilter(f)}>
                                            {f === "all" ? "Todos" : f === "service" ? "Servicios" : "Clientes"}
                                        </Button>
                                    ))}
                                    <Button variant="outline" className="rounded-xl" onClick={() => loadDirectory()}>
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {contacts.map((c) => (
                                    <Card key={c.phone} className="rounded-2xl border">
                                        <CardHeader className="pb-2">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                <div>
                                                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                                                        <UserRound className="w-4 h-4 text-emerald-600" />
                                                        {c.pushName || "Sin nombre"}
                                                        <Badge variant="outline">+{c.phone}</Badge>
                                                    </CardTitle>
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        {c.serviceName ? (
                                                            <>
                                                                Servicio:{" "}
                                                                <Link className="text-emerald-700 hover:underline" href={`/services/${c.serviceId}`}>
                                                                    {c.serviceName}
                                                                </Link>
                                                                {c.purpose ? ` · ${c.purpose}` : ""}
                                                            </>
                                                        ) : c.clientName ? (
                                                            <>
                                                                Cliente:{" "}
                                                                <Link className="text-emerald-700 hover:underline" href={`/clients/${c.clientId}`}>
                                                                    {c.clientName}
                                                                </Link>
                                                            </>
                                                        ) : (
                                                            "Número registrado en RNV"
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button variant="outline" size="sm" className="gap-1 rounded-xl" onClick={() => {
                                                        setLinkingPhone(c.phone);
                                                        setSelectedService(c.serviceId || "");
                                                    }}>
                                                        <Link2 className="w-4 h-4" /> Vincular
                                                    </Button>
                                                    <Button size="sm" className="gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => {
                                                        setNotifyPhone(c.phone);
                                                        setNotifyText(c.serviceName
                                                            ? `Hola, te escribimos por el servicio *${c.serviceName}*…`
                                                            : "Hola, te escribimos desde Renace Tech…");
                                                    }}>
                                                        <Send className="w-4 h-4" /> Notificar
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardHeader>
                                    </Card>
                                ))}
                                {contacts.length === 0 && (
                                    <p className="text-center text-muted-foreground py-10">
                                        No hay números registrados en RNV. Asigna teléfonos en clientes/servicios primero.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {linkingPhone && (
                <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
                    <Card className="w-full max-w-md rounded-2xl">
                        <CardHeader>
                            <CardTitle>Vincular +{linkingPhone} a un servicio</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <select className="w-full border rounded-xl p-2" value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
                                <option value="">— Elige servicio —</option>
                                {services.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setLinkingPhone(null)}>Cancelar</Button>
                                <Button disabled={busy} onClick={linkPhone}>Guardar vínculo</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {notifyPhone && (
                <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
                    <Card className="w-full max-w-md rounded-2xl">
                        <CardHeader>
                            <CardTitle>Notificar +{notifyPhone}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <textarea className="w-full border rounded-xl p-3 min-h-[120px]" value={notifyText} onChange={(e) => setNotifyText(e.target.value)} />
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setNotifyPhone(null)}>Cancelar</Button>
                                <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" onClick={sendNotify}>
                                    Enviar WhatsApp
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
