"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    CheckCircle2, CircleDollarSign, PackageSearch, Plus, RefreshCw,
    Sparkles, UserPlus, Wand2, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { clients as clientsApi } from "@/lib/api";

type ClientOpt = { id: string; name: string; monthlyFee?: number };

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
    vpsClientId?: string;
    vpsClientName?: string;
};

type Draft = {
    clientId: string;
    purpose: string;
    monthlyCost: string;
    skip: boolean;
};

const money = (n: number) => `$${n.toFixed(2)}`;

const INFRA_TYPES = new Set([
    "postgres", "postgresql", "mysql", "mariadb", "redis", "mongodb", "mongo",
    "rabbitmq", "elasticsearch", "traefik", "nginx", "caddy", "portainer",
    "watchtower", "prometheus", "grafana", "docker", "unknown",
]);

const DEFAULT_PRICE: Record<string, number> = {
    odoo: 100,
    wordpress: 40,
    nextjs: 50,
    nodejs: 50,
    n8n: 40,
    ghost: 35,
    app: 50,
};

function normalize(s: string) {
    return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "");
}

function subdomainHint(svc: WizardService): string {
    const raw = svc.url || svc.domains?.[0] || svc.name;
    try {
        const host = raw.includes("://") ? new URL(raw).hostname : raw;
        const first = host.split(".")[0] || svc.name;
        return first.replace(/[-_]/g, " ").trim();
    } catch {
        return svc.name;
    }
}

function titleCase(s: string) {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function suggestPurpose(svc: WizardService): string {
    if (svc.purpose?.trim()) return svc.purpose.trim();
    const hint = subdomainHint(svc);
    const t = (svc.type || "").toLowerCase();
    if (t.includes("odoo")) return `Odoo — ${hint}`;
    if (t.includes("wordpress")) return `WordPress — ${hint}`;
    if (t.includes("n8n")) return `Automatización n8n — ${hint}`;
    if (INFRA_TYPES.has(t)) return `Infra interna — ${svc.name}`;
    return hint || svc.name;
}

function suggestPrice(svc: WizardService, defaultOdoo: number): number {
    if (svc.monthlyRevenue > 0) return svc.monthlyRevenue;
    const t = (svc.type || "").toLowerCase();
    if (INFRA_TYPES.has(t)) return 0;
    if (t.includes("odoo")) return defaultOdoo;
    for (const [key, price] of Object.entries(DEFAULT_PRICE)) {
        if (t.includes(key)) return price;
    }
    if (svc.url || (svc.domains && svc.domains.length > 0)) return defaultOdoo > 0 ? Math.min(defaultOdoo, 50) : 50;
    return 0;
}

function suggestClient(svc: WizardService, clients: ClientOpt[]): string {
    if (svc.clientId) return svc.clientId;
    if (svc.vpsClientId) return svc.vpsClientId;
    const hay = normalize([svc.name, subdomainHint(svc), ...(svc.domains || [])].join(" "));
    let best = "";
    let bestScore = 0;
    for (const c of clients) {
        const cn = normalize(c.name);
        if (!cn) continue;
        if (hay.includes(cn) || cn.includes(hay)) {
            const score = Math.min(cn.length, hay.length);
            if (score > bestScore) {
                best = c.id;
                bestScore = score;
            }
            continue;
        }
        // token match: "Luis La Grasa" ↔ lagrasa
        const tokens = cn.split(/\s+/).filter((t) => t.length >= 4);
        for (const token of tokens) {
            if (hay.includes(token) && token.length > bestScore) {
                best = c.id;
                bestScore = token.length;
            }
        }
    }
    return best;
}

function isOnline(status: string) {
    return ["online", "running", "active", "up"].includes((status || "").toLowerCase());
}

function isBillableCandidate(svc: WizardService) {
    const t = (svc.type || "").toLowerCase();
    if (INFRA_TYPES.has(t) && !svc.url && !(svc.domains && svc.domains.length)) return false;
    return true;
}

export default function ServiceWizardPage() {
    const { addToast } = useToast();
    const [services, setServices] = useState<WizardService[]>([]);
    const [clients, setClients] = useState<ClientOpt[]>([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [filter, setFilter] = useState<"ready" | "needs" | "online" | "all">("ready");
    const [defaultPrice, setDefaultPrice] = useState("100");
    const [bulkClientId, setBulkClientId] = useState("");
    const [onlyPublic, setOnlyPublic] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [createForServiceId, setCreateForServiceId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", companyName: "" });

    const buildDrafts = useCallback((rows: WizardService[], clientList: ClientOpt[], priceDefault: number) => {
        const next: Record<string, Draft> = {};
        for (const s of rows) {
            const infra = INFRA_TYPES.has((s.type || "").toLowerCase()) && !s.url;
            next[s.id] = {
                clientId: suggestClient(s, clientList),
                purpose: suggestPurpose(s),
                monthlyCost: String(suggestPrice(s, priceDefault)),
                skip: infra,
            };
        }
        return next;
    }, []);

    const load = useCallback(async () => {
        try {
            const [invRes, clientsRes] = await Promise.all([
                fetch("/api/inventory"),
                fetch("/api/clients"),
            ]);
            const inv = await invRes.json();
            const cl = await clientsRes.json();
            if (!invRes.ok || !inv.success) throw new Error(inv.error || "No se pudo cargar inventario");

            const clientList: ClientOpt[] = cl.success && Array.isArray(cl.data)
                ? cl.data.map((c: { id: string; name: string; monthlyFee?: number }) => ({
                    id: c.id, name: c.name, monthlyFee: c.monthlyFee,
                }))
                : [];

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
                        vpsClientId: server.client?.id,
                        vpsClientName: server.client?.name,
                    });
                }
            }
            setServices(rows);
            setClients(clientList);
            const price = parseFloat(defaultPrice) || 100;
            setDrafts(buildDrafts(rows, clientList, price));
            // preselect all ready public apps
            const sel: Record<string, boolean> = {};
            for (const s of rows) {
                if (isBillableCandidate(s) && isOnline(s.status)) sel[s.id] = true;
            }
            setSelected(sel);
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error cargando wizard", "error");
        } finally {
            setLoading(false);
        }
    }, [addToast, buildDrafts, defaultPrice]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const scanAll = async () => {
        setScanning(true);
        try {
            const res = await fetch("/api/inventory/scan", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Falló el escaneo");
            addToast("Escaneo listo — ya hay sugerencias automáticas", "success");
            await load();
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error escaneando", "error");
        } finally {
            setScanning(false);
        }
    };

    const autoFill = () => {
        const price = parseFloat(defaultPrice) || 100;
        setDrafts(buildDrafts(services, clients, price));
        addToast("Sugerencias aplicadas (cliente, propósito y precio)", "success");
    };

    const draftReady = (id: string) => {
        const d = drafts[id];
        if (!d || d.skip) return false;
        return !!(d.clientId && d.purpose.trim() && parseFloat(d.monthlyCost || "0") > 0);
    };

    const billablePool = useMemo(() => {
        return services.filter((s) => {
            if (drafts[s.id]?.skip) return false;
            if (onlyPublic && !isBillableCandidate(s)) return false;
            return true;
        });
    }, [services, drafts, onlyPublic]);

    const readyList = useMemo(() => billablePool.filter((s) => draftReady(s.id)), [billablePool, drafts]);
    const needsList = useMemo(() => billablePool.filter((s) => !draftReady(s.id)), [billablePool, drafts]);
    const onlineList = useMemo(() => billablePool.filter((s) => isOnline(s.status)), [billablePool]);

    const visible = useMemo(() => {
        if (filter === "ready") return readyList;
        if (filter === "needs") return needsList;
        if (filter === "online") return onlineList;
        return billablePool;
    }, [filter, readyList, needsList, onlineList, billablePool]);

    const selectedIds = useMemo(
        () => visible.filter((s) => selected[s.id]).map((s) => s.id),
        [visible, selected],
    );

    const projectedRevenue = useMemo(() => {
        return billablePool.reduce((sum, s) => {
            const d = drafts[s.id];
            if (!d || d.skip) return sum;
            const n = parseFloat(d.monthlyCost || "0");
            return sum + (Number.isFinite(n) ? n : 0);
        }, 0);
    }, [billablePool, drafts]);

    const toggleAllVisible = (on: boolean) => {
        setSelected((prev) => {
            const next = { ...prev };
            for (const s of visible) next[s.id] = on;
            return next;
        });
    };

    const applyBulkToSelected = () => {
        if (selectedIds.length === 0) {
            addToast("Selecciona al menos un servicio", "warning");
            return;
        }
        const price = parseFloat(defaultPrice);
        setDrafts((prev) => {
            const next = { ...prev };
            for (const id of selectedIds) {
                const cur = next[id] || { clientId: "", purpose: "", monthlyCost: "", skip: false };
                const svc = services.find((s) => s.id === id);
                next[id] = {
                    ...cur,
                    clientId: bulkClientId || cur.clientId,
                    monthlyCost: Number.isFinite(price) && price >= 0 ? String(price) : cur.monthlyCost,
                    purpose: cur.purpose || (svc ? suggestPurpose(svc) : cur.purpose),
                    skip: false,
                };
            }
            return next;
        });
        addToast(`Aplicado a ${selectedIds.length} seleccionados`, "success");
    };

    const openCreateClient = (serviceId?: string) => {
        const svc = serviceId ? services.find((s) => s.id === serviceId) : null;
        setCreateForServiceId(serviceId || null);
        setNewClient({
            name: svc ? titleCase(subdomainHint(svc)) : "",
            email: "",
            phone: "",
            companyName: "",
        });
        setCreateOpen(true);
    };

    const createClientInline = async () => {
        if (!newClient.name.trim()) {
            addToast("El nombre es requerido", "error");
            return;
        }
        setCreating(true);
        try {
            const fee = parseFloat(defaultPrice) || 0;
            const created = await clientsApi.create({
                name: newClient.name.trim(),
                email: newClient.email.trim() || undefined,
                phone: newClient.phone.trim() || undefined,
                companyName: newClient.companyName.trim() || undefined,
                billingCycle: "monthly",
                monthlyFee: fee,
                paymentDay: 1,
            });
            const client = created.data;
            setClients((prev) => [...prev, { id: client.id, name: client.name, monthlyFee: client.monthlyFee }]);

            if (createForServiceId) {
                setDrafts((prev) => ({
                    ...prev,
                    [createForServiceId]: {
                        ...(prev[createForServiceId] || { purpose: "", monthlyCost: String(fee || 100), skip: false }),
                        clientId: client.id,
                        skip: false,
                    },
                }));
                setSelected((prev) => ({ ...prev, [createForServiceId]: true }));
            } else if (selectedIds.length > 0) {
                setDrafts((prev) => {
                    const next = { ...prev };
                    for (const id of selectedIds) {
                        next[id] = {
                            ...(next[id] || { purpose: "", monthlyCost: String(fee || 100), skip: false }),
                            clientId: client.id,
                            skip: false,
                        };
                    }
                    return next;
                });
                setBulkClientId(client.id);
            } else {
                setBulkClientId(client.id);
            }

            setCreateOpen(false);
            setCreateForServiceId(null);
            setNewClient({ name: "", email: "", phone: "", companyName: "" });
            addToast(`Cliente «${client.name}» creado`, "success");
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al crear cliente", "error");
        } finally {
            setCreating(false);
        }
    };

    const saveBulk = async (ids: string[]) => {
        const items = ids.map((id) => {
            const d = drafts[id];
            const cost = parseFloat(d?.monthlyCost || "0");
            return {
                id,
                clientId: d?.clientId || "",
                purpose: (d?.purpose || "").trim(),
                monthlyCost: Number.isFinite(cost) ? cost : 0,
            };
        }).filter((i) => i.clientId && i.purpose && i.monthlyCost > 0);

        if (items.length === 0) {
            addToast("Nada listo para guardar (falta cliente, propósito o precio > 0)", "warning");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/services/bulk-organize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "Falló el guardado masivo");
            addToast(`Guardados ${data.updated} servicios${data.failed ? ` (${data.failed} fallos)` : ""}`, "success");
            await load();
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Error al guardar", "error");
        } finally {
            setSaving(false);
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
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-5">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Sparkles className="w-8 h-8 text-emerald-600" />
                        Wizard rápido
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Auto-detecta cliente y propósito. Tú solo confirmas precio y guardas en lote.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-muted-foreground">Proyección mensual</p>
                    <p className="text-2xl font-bold text-emerald-700">{money(projectedRevenue)}</p>
                </div>
            </div>

            <Card className="rounded-2xl border-2 border-emerald-100 sticky top-2 z-20 bg-white/95 backdrop-blur shadow-sm">
                <CardContent className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-2 items-end">
                        <div>
                            <label className="text-xs text-muted-foreground">Precio Odoo / app (USD)</label>
                            <Input
                                className="w-28 rounded-xl mt-1"
                                type="number"
                                value={defaultPrice}
                                onChange={(e) => setDefaultPrice(e.target.value)}
                            />
                        </div>
                        <div className="min-w-[200px] flex-1">
                            <label className="text-xs text-muted-foreground">Cliente para seleccionados</label>
                            <div className="flex gap-1.5 mt-1">
                                <select
                                    className="w-full border rounded-xl p-2 bg-background"
                                    value={bulkClientId}
                                    onChange={(e) => {
                                        if (e.target.value === "__create__") {
                                            openCreateClient();
                                            return;
                                        }
                                        setBulkClientId(e.target.value);
                                    }}
                                >
                                    <option value="">— (mantener sugerido) —</option>
                                    <option value="__create__">＋ Crear cliente nuevo…</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl shrink-0 px-3"
                                    title="Crear cliente"
                                    onClick={() => openCreateClient()}
                                >
                                    <UserPlus className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <Button variant="outline" className="rounded-xl gap-1" onClick={autoFill}>
                            <Wand2 className="w-4 h-4" /> Autocompletar todo
                        </Button>
                        <Button variant="outline" className="rounded-xl" onClick={applyBulkToSelected}>
                            Aplicar a {selectedIds.length || 0}
                        </Button>
                        <Button
                            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-1"
                            disabled={saving || readyList.length === 0}
                            onClick={() => saveBulk(readyList.map((s) => s.id))}
                        >
                            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            Guardar {readyList.length} listos
                        </Button>
                        <Button variant="ghost" className="rounded-xl gap-1" disabled={scanning} onClick={scanAll}>
                            {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PackageSearch className="w-4 h-4" />}
                            Re-escanear
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={onlyPublic} onChange={(e) => setOnlyPublic(e.target.checked)} />
                            Solo apps cobrables (oculta DB/redis/traefik)
                        </label>
                        <span className="text-muted-foreground">·</span>
                        <button type="button" className="text-emerald-700 hover:underline" onClick={() => toggleAllVisible(true)}>
                            Seleccionar visibles
                        </button>
                        <button type="button" className="text-muted-foreground hover:underline" onClick={() => toggleAllVisible(false)}>
                            Quitar selección
                        </button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl ml-auto gap-1"
                            disabled={saving || selectedIds.length === 0}
                            onClick={() => saveBulk(selectedIds)}
                        >
                            <CircleDollarSign className="w-4 h-4" />
                            Guardar selección ({selectedIds.length})
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
                {([
                    ["ready", `Listos (${readyList.length})`],
                    ["needs", `Faltan datos (${needsList.length})`],
                    ["online", `En línea (${onlineList.length})`],
                    ["all", `Todos (${billablePool.length})`],
                ] as const).map(([key, label]) => (
                    <Button key={key} variant={filter === key ? "default" : "outline"} className="rounded-xl" onClick={() => setFilter(key)}>
                        {label}
                    </Button>
                ))}
                <Button variant="ghost" className="rounded-xl ml-auto" asChild>
                    <Link href="/billing">Facturación</Link>
                </Button>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                <div className="grid grid-cols-[36px_minmax(0,1.4fr)_minmax(160px,1.1fr)_minmax(0,1.2fr)_88px] gap-2 px-3 py-2.5 bg-muted/50 text-[11px] uppercase tracking-wide font-medium text-muted-foreground border-b">
                    <span />
                    <span>Servicio</span>
                    <span>Cliente</span>
                    <span>Propósito</span>
                    <span>USD/mes</span>
                </div>
                <div className="max-h-[62vh] overflow-auto divide-y divide-border/60">
                    {visible.map((svc) => {
                        const d = drafts[svc.id] || { clientId: "", purpose: "", monthlyCost: "", skip: false };
                        const ready = draftReady(svc.id);
                        const online = isOnline(svc.status);
                        return (
                            <div
                                key={svc.id}
                                className={`grid grid-cols-[36px_minmax(0,1.4fr)_minmax(160px,1.1fr)_minmax(0,1.2fr)_88px] gap-2 px-3 py-2.5 items-center text-sm transition-colors ${
                                    ready ? "bg-emerald-50/50" : "hover:bg-muted/20"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    className="accent-emerald-600"
                                    checked={!!selected[svc.id]}
                                    onChange={(e) => setSelected((prev) => ({ ...prev, [svc.id]: e.target.checked }))}
                                />
                                <div className="min-w-0">
                                    <p className="font-medium truncate flex items-center gap-1.5">
                                        <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${
                                                online ? "bg-emerald-500" : "bg-amber-400"
                                            }`}
                                            title={online ? "En línea" : svc.status}
                                        />
                                        {ready && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                        <span className="truncate">{svc.name}</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate pl-3.5">
                                        {svc.type}
                                        {svc.url ? ` · ${svc.url.replace(/^https?:\/\//, "")}` : ""}
                                    </p>
                                </div>
                                <div className="flex gap-1 items-center min-w-0">
                                    <select
                                        className={`w-full border rounded-lg p-1.5 text-xs bg-background ${
                                            !d.clientId ? "border-amber-300 text-muted-foreground" : "border-input"
                                        }`}
                                        value={d.clientId}
                                        onChange={(e) => {
                                            if (e.target.value === "__create__") {
                                                openCreateClient(svc.id);
                                                return;
                                            }
                                            setDrafts((prev) => ({
                                                ...prev,
                                                [svc.id]: { ...d, clientId: e.target.value, skip: false },
                                            }));
                                        }}
                                    >
                                        <option value="">Sin cliente…</option>
                                        <option value="__create__">＋ Crear «{titleCase(subdomainHint(svc))}»…</option>
                                        {clients.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg border border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                        title="Crear cliente aquí"
                                        onClick={() => openCreateClient(svc.id)}
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <Input
                                    className="h-8 rounded-lg text-xs"
                                    value={d.purpose}
                                    onChange={(e) => setDrafts((prev) => ({
                                        ...prev,
                                        [svc.id]: { ...d, purpose: e.target.value, skip: false },
                                    }))}
                                />
                                <Input
                                    className="h-8 rounded-lg text-xs"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={d.monthlyCost}
                                    onChange={(e) => setDrafts((prev) => ({
                                        ...prev,
                                        [svc.id]: { ...d, monthlyCost: e.target.value, skip: false },
                                    }))}
                                />
                            </div>
                        );
                    })}
                    {visible.length === 0 && (
                        <p className="text-center text-muted-foreground py-10 text-sm">
                            Nada en este filtro. Prueba «Autocompletar todo» o cambia el filtro.
                        </p>
                    )}
                </div>
            </div>

            <Card className="rounded-2xl border-dashed">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Flujo rápido</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p>1. Precio Odoo → <b>Autocompletar todo</b></p>
                    <p>2. Si falta cliente: botón <b>+</b> o «Crear…» en el desplegable (nombre sugerido del dominio)</p>
                    <p>3. Pestaña <b>Listos</b> → <b>Guardar N listos</b></p>
                </CardContent>
            </Card>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-emerald-600" />
                            Nuevo cliente
                        </DialogTitle>
                        <DialogDescription>
                            Se crea aquí mismo y queda asignado al servicio
                            {createForServiceId
                                ? ` «${services.find((s) => s.id === createForServiceId)?.name || ""}»`
                                : selectedIds.length > 0
                                    ? ` y a ${selectedIds.length} seleccionados`
                                    : ""}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-1">
                        <div>
                            <label className="text-xs text-muted-foreground">Nombre *</label>
                            <Input
                                className="rounded-xl mt-1"
                                autoFocus
                                placeholder="Ej. MVP Flow Boutique"
                                value={newClient.name}
                                onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !creating) void createClientInline();
                                }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-muted-foreground">Email</label>
                                <Input
                                    className="rounded-xl mt-1"
                                    type="email"
                                    value={newClient.email}
                                    onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground">Teléfono</label>
                                <Input
                                    className="rounded-xl mt-1"
                                    value={newClient.phone}
                                    onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Empresa (opcional)</label>
                            <Input
                                className="rounded-xl mt-1"
                                value={newClient.companyName}
                                onChange={(e) => setNewClient((p) => ({ ...p, companyName: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)} disabled={creating}>
                            Cancelar
                        </Button>
                        <Button
                            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-1"
                            onClick={() => void createClientInline()}
                            disabled={creating || !newClient.name.trim()}
                        >
                            {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Crear y asignar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
