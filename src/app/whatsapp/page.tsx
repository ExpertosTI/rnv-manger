"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Link2, MessageCircle, RefreshCw, Search, Send, UserRound,
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

export default function WhatsAppDirectoryPage() {
    const { addToast } = useToast();
    const [dir, setDir] = useState<Directory | null>(null);
    const [services, setServices] = useState<ServiceOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
    const [linkingPhone, setLinkingPhone] = useState<string | null>(null);
    const [selectedService, setSelectedService] = useState("");
    const [notifyPhone, setNotifyPhone] = useState<string | null>(null);
    const [notifyText, setNotifyText] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
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
            addToast(error instanceof Error ? error.message : "Error cargando WhatsApp", "error");
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const contacts = useMemo(() => {
        const list = dir?.contacts || [];
        return list.filter((c) => {
            if (filter === "matched" && c.matchedKind === "none") return false;
            if (filter === "unmatched" && c.matchedKind !== "none") return false;
            if (!query.trim()) return true;
            const q = query.toLowerCase();
            return [c.pushName, c.phone, c.clientName, c.serviceName, c.purpose]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
        });
    }, [dir, filter, query]);

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
            await load();
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
                    phone: notifyPhone,
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

    if (loading) {
        return (
            <div className="min-h-[60vh] grid place-items-center">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <MessageCircle className="w-8 h-8 text-emerald-600" />
                        WhatsApp — Contactos
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Escanea contactos de la línea conectada en Evolution, vincúlalos a servicios y notifica rápido.
                    </p>
                </div>
                <Button onClick={() => load()} className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700">
                    <RefreshCw className="w-4 h-4" />
                    Escanear contactos
                </Button>
            </div>

            <Card className="rounded-2xl border-2 border-emerald-100">
                <CardContent className="p-4 flex flex-wrap gap-4 text-sm">
                    <div>
                        <span className="text-muted-foreground">Instancia</span>
                        <p className="font-semibold">{dir?.instance || "—"}</p>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Estado</span>
                        <p className="font-semibold">{dir?.state || "—"}</p>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Contactos</span>
                        <p className="font-semibold">{dir?.total || 0}</p>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Vinculados a RNV</span>
                        <p className="font-semibold text-emerald-700">{dir?.matched || 0}</p>
                    </div>
                    <p className="w-full text-xs text-muted-foreground">
                        Remitente = número conectado en evoapi (849). Para reconectar: evoapi.renace.tech → instancia <b>renace</b> → QR.
                    </p>
                </CardContent>
            </Card>

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
                    {(["all", "matched", "unmatched"] as const).map((f) => (
                        <Button
                            key={f}
                            variant={filter === f ? "default" : "outline"}
                            className="rounded-xl"
                            onClick={() => setFilter(f)}
                        >
                            {f === "all" ? "Todos" : f === "matched" ? "Vinculados" : "Sin vincular"}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                {contacts.map((c) => (
                    <Card key={c.phone} className="rounded-2xl border">
                        <CardHeader className="pb-2">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <UserRound className="w-4 h-4 text-emerald-600" />
                                        {c.pushName || "Sin nombre"}
                                        <Badge variant="outline">+{c.phone}</Badge>
                                        {c.matchedKind !== "none" && (
                                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                                {c.matchedKind === "both" ? "cliente+servicio" : c.matchedKind}
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {c.serviceName ? (
                                            <>
                                                Servicio:{" "}
                                                <Link className="text-emerald-700 hover:underline" href={`/services/${c.serviceId}`}>
                                                    {c.serviceName}
                                                </Link>
                                                {c.vpsName ? ` · ${c.vpsName}` : ""}
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
                                            "Sin vínculo en RNV — enlázalo a un servicio"
                                        )}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1 rounded-xl"
                                        onClick={() => {
                                            setLinkingPhone(c.phone);
                                            setSelectedService(c.serviceId || "");
                                        }}
                                    >
                                        <Link2 className="w-4 h-4" />
                                        Vincular
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                                        onClick={() => {
                                            setNotifyPhone(c.phone);
                                            setNotifyText(
                                                c.serviceName
                                                    ? `Hola, te escribimos por el servicio *${c.serviceName}*…`
                                                    : "Hola, te escribimos desde Renace Tech…"
                                            );
                                        }}
                                    >
                                        <Send className="w-4 h-4" />
                                        Notificar
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>
                ))}
                {contacts.length === 0 && (
                    <p className="text-center text-muted-foreground py-10">
                        No hay contactos con ese filtro. Escanea de nuevo o revisa la conexión en Evolution.
                    </p>
                )}
            </div>

            {linkingPhone && (
                <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
                    <Card className="w-full max-w-md rounded-2xl">
                        <CardHeader>
                            <CardTitle>Vincular +{linkingPhone} a un servicio</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <select
                                className="w-full border rounded-xl p-2"
                                value={selectedService}
                                onChange={(e) => setSelectedService(e.target.value)}
                            >
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
                            <textarea
                                className="w-full border rounded-xl p-3 min-h-[120px]"
                                value={notifyText}
                                onChange={(e) => setNotifyText(e.target.value)}
                            />
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
