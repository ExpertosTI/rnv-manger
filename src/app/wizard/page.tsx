"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    CheckCircle2, CircleDollarSign, PackageSearch, RefreshCw, Server, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

type ClientOpt = { id: string; name: string };

type WizardService = {
    id: string;
    name: string;
    type: string;
    status: string;
    url?: string;
    domains?: string[];
    purpose?: string;
    clientId?: string;
    clientName?: string;
    monthlyRevenue: number;
    generatesRevenue: boolean;
    vpsId: string;
    vpsName: string;
    vpsIp: string;
};

type Draft = {
    clientId: string;
    purpose: string;
    monthlyCost: string;
};

const money = (n: number) => `$${n.toFixed(2)}`;

export default function ServiceWizardPage() {
    const { addToast } = useToast();
    const [services, setServices] = useState<WizardService[]>([]);
    const [clients, setClients] = useState<ClientOpt[]>([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [step, setStep] = useState(0);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [filter, setFilter] = useState<"needs" | "online" | "all">("needs");

    const load = useCallback(async () => {
        try {
            const [invRes, clientsRes] = await Promise.all([
                fetch("/api/inventory"),
                fetch("/api/clients"),
            ]);
            const inv = await invRes.json();
            const cl = await clientsRes.json();
            if (!invRes.ok || !inv.success) throw new Error(inv.error || "No se pudo cargar inventario");

            const rows: WizardService[] = [];
            for (const server of inv.data || []) {
                for (const svc of server.services || []) {
                    rows.push({
                        id: svc.id,
                        name: svc.name,
                        type: svc.type,
                        status: svc.status,
                        url: svc.url,
                        domains: svc.domains,
                        purpose: svc.purpose,
                        clientId: svc.clientId,
                        clientName: svc.clientName,
                        monthlyRevenue: svc.monthlyRevenue || 0,
                        generatesRevenue: !!svc.generatesRevenue,
                        vpsId: server.vpsId,
                        vpsName: server.vpsName,
                        vpsIp: server.ip,
                    });
                }
            }
            setServices(rows);

            const nextDrafts: Record<string, Draft> = {};
            for (const s of rows) {
                nextDrafts[s.id] = {
                    clientId: s.clientId || "",
                    purpose: s.purpose || "",
                    monthlyCost: s.monthlyRevenue > 0 ? String(s.monthlyRevenue) : "",
                };
            }
            setDrafts(nextDrafts);

            if (cl.success && Array.isArray(cl.data)) {
                setClients(cl.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
            }
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error cargando wizard", "error");
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const scanAll = async () => {
        setScanning(true);
        try {
            const res = await fetch("/api/inventory/scan", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Falló el escaneo");
            addToast("Escaneo completado — revisa los servicios abajo", "success");
            setStep(1);
            await load();
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error escaneando", "error");
        } finally {
            setScanning(false);
        }
    };

    const needsWork = useMemo(
        () => services.filter((s) => !s.clientId || !s.purpose || !s.generatesRevenue),
        [services],
    );
    const online = useMemo(
        () => services.filter((s) => s.status === "online" || s.status === "running" || s.status === "active"),
        [services],
    );

    const visible = useMemo(() => {
        if (filter === "needs") return needsWork;
        if (filter === "online") return online;
        return services;
    }, [filter, needsWork, online, services]);

    const totalBillable = useMemo(
        () => services.reduce((sum, s) => sum + (s.monthlyRevenue || 0), 0),
        [services],
    );

    const saveOne = async (svc: WizardService) => {
        const d = drafts[svc.id];
        if (!d) return;
        const cost = parseFloat(d.monthlyCost || "0");
        if (!d.clientId) {
            addToast("Elige un cliente para poder cobrar", "warning");
            return;
        }
        if (!d.purpose.trim()) {
            addToast("Describe para qué sirve (purpose)", "warning");
            return;
        }
        setSavingId(svc.id);
        try {
            const currentRes = await fetch(`/api/services/${svc.id}`);
            const currentData = await currentRes.json();
            if (!currentRes.ok || !currentData.success) {
                throw new Error(currentData.error || "No se pudo leer el servicio");
            }
            const current = currentData.data || {};
            const res = await fetch(`/api/services/${svc.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...current,
                    clientId: d.clientId,
                    purpose: d.purpose.trim(),
                    monthlyCost: Number.isFinite(cost) ? cost : 0,
                    billingCycle: "monthly",
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar");
            addToast(`Organizado: ${svc.name}`, "success");
            await load();
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al guardar", "error");
        } finally {
            setSavingId(null);
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
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Sparkles className="w-8 h-8 text-emerald-600" />
                    Wizard — Organizar y cobrar
                </h1>
                <p className="text-muted-foreground mt-1">
                    Escanea lo que está en línea, identifícalo y asígnalo a un cliente con precio mensual.
                </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
                {[
                    { n: 0, label: "Escanear" },
                    { n: 1, label: "Identificar" },
                    { n: 2, label: "Cobrar" },
                ].map((s) => (
                    <button
                        key={s.n}
                        type="button"
                        onClick={() => setStep(s.n)}
                        className={`rounded-2xl border-2 p-4 text-left transition ${
                            step === s.n ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-emerald-200"
                        }`}
                    >
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Paso {s.n + 1}</p>
                        <p className="font-semibold">{s.label}</p>
                    </button>
                ))}
            </div>

            {step === 0 && (
                <Card className="rounded-2xl border-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PackageSearch className="w-5 h-5 text-emerald-600" />
                            Descubrir servicios en tus VPS
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            RNV entra por SSH a tus servidores y lista contenedores, proyectos, puertos y dominios.
                            No tienes que pegar IPs a mano.
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm">
                            <div>
                                <span className="text-muted-foreground">Servicios conocidos</span>
                                <p className="text-2xl font-bold">{services.length}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Sin organizar</span>
                                <p className="text-2xl font-bold text-amber-700">{needsWork.length}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Ingreso mensual marcado</span>
                                <p className="text-2xl font-bold text-emerald-700">{money(totalBillable)}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={scanAll} disabled={scanning} className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700">
                                {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                                Escanear todos los VPS
                            </Button>
                            <Button variant="outline" className="rounded-xl" onClick={() => setStep(1)} disabled={services.length === 0}>
                                Continuar con lo ya descubierto
                            </Button>
                            <Button variant="ghost" className="rounded-xl" asChild>
                                <Link href="/inventory">Ver inventario completo</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {step >= 1 && (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {([
                            ["needs", `Por organizar (${needsWork.length})`],
                            ["online", `En línea (${online.length})`],
                            ["all", `Todos (${services.length})`],
                        ] as const).map(([key, label]) => (
                            <Button
                                key={key}
                                variant={filter === key ? "default" : "outline"}
                                className="rounded-xl"
                                onClick={() => setFilter(key)}
                            >
                                {label}
                            </Button>
                        ))}
                        <Button variant="outline" className="rounded-xl ml-auto" onClick={() => setStep(2)}>
                            Resumen de cobro
                        </Button>
                    </div>

                    {visible.map((svc) => {
                        const d = drafts[svc.id] || { clientId: "", purpose: "", monthlyCost: "" };
                        const ready = !!(d.clientId && d.purpose.trim() && parseFloat(d.monthlyCost || "0") > 0);
                        return (
                            <Card key={svc.id} className="rounded-2xl border">
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-lg flex items-center gap-2 flex-wrap">
                                                {svc.name}
                                                <Badge variant="outline">{svc.type}</Badge>
                                                <Badge className={svc.status === "online" || svc.status === "running" ? "bg-emerald-100 text-emerald-800" : ""}>
                                                    {svc.status}
                                                </Badge>
                                                {ready && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {svc.vpsName} · {svc.vpsIp}
                                                {svc.domains?.length ? ` · ${svc.domains.slice(0, 2).join(", ")}` : ""}
                                                {svc.url ? ` · ${svc.url}` : ""}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-1"
                                            disabled={savingId === svc.id}
                                            onClick={() => saveOne(svc)}
                                        >
                                            {savingId === svc.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CircleDollarSign className="w-4 h-4" />}
                                            Guardar cobro
                                        </Button>
                                    </div>
                                    <div className="grid md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-xs text-muted-foreground">Cliente</label>
                                            <select
                                                className="w-full border rounded-xl p-2 mt-1"
                                                value={d.clientId}
                                                onChange={(e) => setDrafts((prev) => ({
                                                    ...prev,
                                                    [svc.id]: { ...d, clientId: e.target.value },
                                                }))}
                                            >
                                                <option value="">— ¿De quién es? —</option>
                                                {clients.map((c) => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-muted-foreground">¿Para qué sirve?</label>
                                            <Input
                                                className="mt-1 rounded-xl"
                                                placeholder="Ej. tienda, CRM, landing…"
                                                value={d.purpose}
                                                onChange={(e) => setDrafts((prev) => ({
                                                    ...prev,
                                                    [svc.id]: { ...d, purpose: e.target.value },
                                                }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-muted-foreground">Cobro mensual (USD)</label>
                                            <Input
                                                className="mt-1 rounded-xl"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={d.monthlyCost}
                                                onChange={(e) => setDrafts((prev) => ({
                                                    ...prev,
                                                    [svc.id]: { ...d, monthlyCost: e.target.value },
                                                }))}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}

                    {visible.length === 0 && (
                        <p className="text-center text-muted-foreground py-12">
                            Nada en este filtro. Escanea VPS o cambia el filtro.
                        </p>
                    )}
                </div>
            )}

            {step === 2 && (
                <Card className="rounded-2xl border-2 border-emerald-100">
                    <CardHeader>
                        <CardTitle>Resumen para cobrar</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-3xl font-bold text-emerald-700">{money(totalBillable)} <span className="text-base font-normal text-muted-foreground">/ mes</span></p>
                        <p className="text-sm text-muted-foreground">
                            {services.filter((s) => s.generatesRevenue).length} servicios con precio · {needsWork.length} aún sin organizar
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button className="rounded-xl" asChild>
                                <Link href="/billing">Ir a facturación</Link>
                            </Button>
                            <Button variant="outline" className="rounded-xl" onClick={() => { setFilter("needs"); setStep(1); }}>
                                Seguir organizando
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
