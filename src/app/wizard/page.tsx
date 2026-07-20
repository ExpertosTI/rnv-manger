"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    CheckCircle2, CircleDollarSign, PackageSearch, Plus, RefreshCw,
    Sparkles, UserPlus, Wand2, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { clients as clientsApi } from "@/lib/api";

type BillingCycle = "monthly" | "annual";

type ClientOpt = {
    id: string;
    name: string;
    monthlyFee?: number;
    annualFee?: number;
    billingCycle?: BillingCycle;
};

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
    billingCycle?: BillingCycle;
    monthlyCost?: number;
    annualCost?: number;
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
    billingCycle: BillingCycle;
    amount: string;
    skip: boolean;
};

const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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

function suggestCycle(svc: WizardService, clients: ClientOpt[], clientId: string): BillingCycle {
    if (svc.billingCycle === "annual" || (svc.annualCost && svc.annualCost > 0)) return "annual";
    const cl = clients.find((c) => c.id === clientId);
    if (cl?.billingCycle === "annual") return "annual";
    return "monthly";
}

function suggestAmount(svc: WizardService, clients: ClientOpt[], clientId: string, cycle: BillingCycle, defaultOdoo: number): number {
    if (cycle === "annual") {
        if (svc.annualCost && svc.annualCost > 0) return svc.annualCost;
        const cl = clients.find((c) => c.id === clientId);
        if (cl?.annualFee && cl.annualFee > 0) return cl.annualFee;
        // convertir sugerencia mensual → anual
        const monthly = suggestMonthly(svc, defaultOdoo);
        return monthly > 0 ? monthly * 12 : 0;
    }
    if (svc.monthlyCost && svc.monthlyCost > 0) return svc.monthlyCost;
    if (svc.monthlyRevenue > 0 && svc.billingCycle !== "annual") return svc.monthlyRevenue;
    const cl = clients.find((c) => c.id === clientId);
    if (cl?.monthlyFee && cl.monthlyFee > 0) return cl.monthlyFee;
    return suggestMonthly(svc, defaultOdoo);
}

function suggestMonthly(svc: WizardService, defaultOdoo: number): number {
    if (svc.monthlyRevenue > 0 && svc.billingCycle !== "annual") return svc.monthlyRevenue;
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

function CycleToggle({
    value,
    onChange,
    compact,
}: {
    value: BillingCycle;
    onChange: (v: BillingCycle) => void;
    compact?: boolean;
}) {
    return (
        <div
            className={`inline-flex bg-stone-100/80 p-0.5 ${compact ? "text-[10px]" : "text-xs"}`}
            role="group"
            aria-label="Ciclo de cobro"
        >
            {([
                ["monthly", "Mes"],
                ["annual", "Año"],
            ] as const).map(([key, label]) => (
                <button
                    key={key}
                    type="button"
                    className={`px-2 py-1 font-medium transition-colors ${
                        value === key
                            ? "bg-white text-stone-900 shadow-sm"
                            : "text-stone-500 hover:text-stone-800"
                    }`}
                    onClick={() => onChange(key)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
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
    const [defaultCycle, setDefaultCycle] = useState<BillingCycle>("monthly");
    const [bulkClientId, setBulkClientId] = useState("");
    const [onlyPublic, setOnlyPublic] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [createForServiceId, setCreateForServiceId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newClient, setNewClient] = useState({
        name: "", email: "", phone: "", companyName: "", billingCycle: "monthly" as BillingCycle,
    });
    const [editingId, setEditingId] = useState<string | null>(null);

    const buildDrafts = useCallback((rows: WizardService[], clientList: ClientOpt[], priceDefault: number, cycleDefault: BillingCycle) => {
        const next: Record<string, Draft> = {};
        for (const s of rows) {
            const infra = INFRA_TYPES.has((s.type || "").toLowerCase()) && !s.url;
            const clientId = suggestClient(s, clientList);
            const cycle = s.billingCycle === "annual" || s.billingCycle === "monthly"
                ? s.billingCycle
                : (clientId ? suggestCycle(s, clientList, clientId) : cycleDefault);
            next[s.id] = {
                clientId,
                purpose: suggestPurpose(s),
                billingCycle: cycle,
                amount: String(suggestAmount(s, clientList, clientId, cycle, priceDefault)),
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
                ? cl.data.map((c: ClientOpt & { billingCycle?: string }) => ({
                    id: c.id,
                    name: c.name,
                    monthlyFee: c.monthlyFee,
                    annualFee: c.annualFee,
                    billingCycle: c.billingCycle === "annual" ? "annual" : "monthly",
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
                        billingCycle: svc.billingCycle === "annual" ? "annual" : "monthly",
                        monthlyCost: svc.monthlyCost || 0,
                        annualCost: svc.annualCost || 0,
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
            setDrafts(buildDrafts(rows, clientList, price, defaultCycle));
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
    }, [addToast, buildDrafts, defaultPrice, defaultCycle]);

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
        setDrafts(buildDrafts(services, clients, price, defaultCycle));
        addToast("Sugerencias aplicadas (cliente, propósito y cobro)", "success");
    };

    const draftReady = (id: string) => {
        const d = drafts[id];
        if (!d || d.skip) return false;
        return !!(d.clientId && d.purpose.trim() && parseFloat(d.amount || "0") > 0);
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
        let base =
            filter === "ready" ? readyList
            : filter === "needs" ? needsList
            : filter === "online" ? onlineList
            : billablePool;
        if (editingId && !base.some((s) => s.id === editingId)) {
            const row = billablePool.find((s) => s.id === editingId);
            if (row) base = [...base, row];
        }
        return base;
    }, [filter, readyList, needsList, onlineList, billablePool, editingId]);

    const selectedIds = useMemo(
        () => visible.filter((s) => selected[s.id]).map((s) => s.id),
        [visible, selected],
    );

    const projectedMonthly = useMemo(() => {
        return billablePool.reduce((sum, s) => {
            const d = drafts[s.id];
            if (!d || d.skip) return sum;
            const n = parseFloat(d.amount || "0");
            if (!Number.isFinite(n) || n <= 0) return sum;
            return sum + (d.billingCycle === "annual" ? n / 12 : n);
        }, 0);
    }, [billablePool, drafts]);

    const projectedAnnual = useMemo(() => projectedMonthly * 12, [projectedMonthly]);

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
                const cur = next[id] || {
                    clientId: "", purpose: "", billingCycle: defaultCycle, amount: "", skip: false,
                };
                const svc = services.find((s) => s.id === id);
                const cycle = defaultCycle;
                next[id] = {
                    ...cur,
                    clientId: bulkClientId || cur.clientId,
                    billingCycle: cycle,
                    amount: Number.isFinite(price) && price >= 0
                        ? String(cycle === "annual" && price < 500 ? price * 12 : price)
                        : cur.amount,
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
        const draft = serviceId ? drafts[serviceId] : null;
        setCreateForServiceId(serviceId || null);
        setNewClient({
            name: svc ? titleCase(subdomainHint(svc)) : "",
            email: "",
            phone: "",
            companyName: "",
            billingCycle: draft?.billingCycle || defaultCycle,
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
            const annual = newClient.billingCycle === "annual";
            const created = await clientsApi.create({
                name: newClient.name.trim(),
                email: newClient.email.trim() || undefined,
                phone: newClient.phone.trim() || undefined,
                companyName: newClient.companyName.trim() || undefined,
                billingCycle: newClient.billingCycle,
                monthlyFee: annual ? 0 : fee,
                annualFee: annual ? (fee < 500 && fee > 0 ? fee * 12 : fee || 0) : 0,
                paymentDay: 1,
                paymentMonth: annual ? 1 : undefined,
            });
            const client = created.data;
            setClients((prev) => [
                ...prev,
                {
                    id: client.id,
                    name: client.name,
                    monthlyFee: client.monthlyFee,
                    annualFee: client.annualFee,
                    billingCycle: client.billingCycle === "annual" ? "annual" : "monthly",
                },
            ]);

            const assignCycle: BillingCycle = client.billingCycle === "annual" ? "annual" : "monthly";
            const assignAmount = assignCycle === "annual"
                ? String(client.annualFee || fee * 12 || 1200)
                : String(client.monthlyFee || fee || 100);

            if (createForServiceId) {
                setDrafts((prev) => ({
                    ...prev,
                    [createForServiceId]: {
                        ...(prev[createForServiceId] || { purpose: "", skip: false }),
                        clientId: client.id,
                        billingCycle: assignCycle,
                        amount: assignAmount,
                        purpose: prev[createForServiceId]?.purpose || "",
                        skip: false,
                    },
                }));
                setSelected((prev) => ({ ...prev, [createForServiceId]: true }));
            } else if (selectedIds.length > 0) {
                setDrafts((prev) => {
                    const next = { ...prev };
                    for (const id of selectedIds) {
                        next[id] = {
                            ...(next[id] || { purpose: "", skip: false }),
                            clientId: client.id,
                            billingCycle: assignCycle,
                            amount: assignAmount,
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
            setNewClient({ name: "", email: "", phone: "", companyName: "", billingCycle: "monthly" });
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
            const amount = parseFloat(d?.amount || "0");
            return {
                id,
                clientId: d?.clientId || "",
                purpose: (d?.purpose || "").trim(),
                billingCycle: d?.billingCycle || "monthly",
                amount: Number.isFinite(amount) ? amount : 0,
            };
        }).filter((i) => i.clientId && i.purpose && i.amount > 0);

        if (items.length === 0) {
            addToast("Nada listo para guardar (falta cliente, propósito o monto > 0)", "warning");
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

    const setDraftCycle = (id: string, cycle: BillingCycle, cur: Draft) => {
        setEditingId(id);
        const n = parseFloat(cur.amount || "0");
        let amount = cur.amount;
        if (Number.isFinite(n) && n > 0) {
            if (cycle === "annual" && cur.billingCycle === "monthly") amount = String(Math.round(n * 12));
            if (cycle === "monthly" && cur.billingCycle === "annual") amount = String(Math.round(n / 12));
        }
        setDrafts((prev) => ({
            ...prev,
            [id]: { ...cur, billingCycle: cycle, amount, skip: false },
        }));
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] grid place-items-center">
                <RefreshCw className="w-7 h-7 animate-spin text-teal-700" />
            </div>
        );
    }

    return (
        <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
            <div
                className="pointer-events-none absolute inset-x-0 -top-8 h-56 -z-10 opacity-90"
                style={{
                    background:
                        "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(15,118,110,0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 10%, rgba(68,64,60,0.06), transparent 50%)",
                }}
            />

            <header className="flex flex-col md:flex-row md:items-end justify-between gap-5">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500 mb-2">Organización</p>
                    <h1
                        className="text-3xl md:text-4xl font-semibold tracking-tight text-stone-900 flex items-center gap-3"
                        style={{ fontFamily: "var(--font-outfit), sans-serif" }}
                    >
                        <Sparkles className="w-7 h-7 text-teal-700" />
                        Wizard de cobro
                    </h1>
                    <p className="text-stone-500 mt-2 max-w-xl text-[15px] leading-relaxed">
                        Asigna cliente, propósito y cobro mensual o anual. Guarda en lote cuando esté listo.
                    </p>
                </div>
                <div className="flex gap-6 md:text-right">
                    <div>
                        <p className="text-[11px] uppercase tracking-wider text-stone-400">Equiv. / mes</p>
                        <p className="text-2xl font-semibold text-teal-800 tabular-nums" style={{ fontFamily: "var(--font-outfit), sans-serif" }}>
                            {money(projectedMonthly)}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-wider text-stone-400">Equiv. / año</p>
                        <p className="text-2xl font-semibold text-stone-800 tabular-nums" style={{ fontFamily: "var(--font-outfit), sans-serif" }}>
                            {money(projectedAnnual)}
                        </p>
                    </div>
                </div>
            </header>

            <section className="sticky top-2 z-20 border border-stone-200/80 bg-white/90 backdrop-blur-md shadow-[0_8px_30px_rgba(28,25,23,0.04)]">
                <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-stone-400">Precio base</label>
                            <div className="flex items-center gap-2 mt-1">
                                <Input
                                    className="w-24 border-stone-200 bg-white"
                                    type="number"
                                    value={defaultPrice}
                                    onChange={(e) => setDefaultPrice(e.target.value)}
                                />
                                <CycleToggle value={defaultCycle} onChange={setDefaultCycle} />
                            </div>
                        </div>
                        <div className="min-w-[200px] flex-1">
                            <label className="text-[11px] uppercase tracking-wider text-stone-400">Cliente (selección)</label>
                            <div className="flex gap-1.5 mt-1">
                                <select
                                    className="w-full border border-stone-200 bg-white px-2.5 py-2 text-sm"
                                    value={bulkClientId}
                                    onChange={(e) => {
                                        if (e.target.value === "__create__") {
                                            openCreateClient();
                                            return;
                                        }
                                        setBulkClientId(e.target.value);
                                    }}
                                >
                                    <option value="">— mantener sugerido —</option>
                                    <option value="__create__">＋ Crear cliente nuevo…</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}{c.billingCycle === "annual" ? " · anual" : ""}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0 border-stone-200 px-3"
                                    title="Crear cliente"
                                    onClick={() => openCreateClient()}
                                >
                                    <UserPlus className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <Button variant="outline" className="border-stone-200 gap-1.5" onClick={autoFill}>
                            <Wand2 className="w-4 h-4" /> Autocompletar
                        </Button>
                        <Button variant="outline" className="border-stone-200" onClick={applyBulkToSelected}>
                            Aplicar a {selectedIds.length || 0}
                        </Button>
                        <Button
                            className="bg-teal-800 hover:bg-teal-900 text-white gap-1.5"
                            disabled={saving || readyList.length === 0}
                            onClick={() => saveBulk(readyList.map((s) => s.id))}
                        >
                            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            Guardar {readyList.length} listos
                        </Button>
                        <Button variant="ghost" className="text-stone-500 gap-1.5" disabled={scanning} onClick={scanAll}>
                            {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PackageSearch className="w-4 h-4" />}
                            Re-escanear
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center text-sm text-stone-600">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="accent-teal-800" checked={onlyPublic} onChange={(e) => setOnlyPublic(e.target.checked)} />
                            Solo apps cobrables
                        </label>
                        <button type="button" className="text-teal-800 hover:underline" onClick={() => toggleAllVisible(true)}>
                            Seleccionar visibles
                        </button>
                        <button type="button" className="text-stone-400 hover:underline" onClick={() => toggleAllVisible(false)}>
                            Quitar selección
                        </button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto border-stone-200 gap-1"
                            disabled={saving || selectedIds.length === 0}
                            onClick={() => saveBulk(selectedIds)}
                        >
                            <CircleDollarSign className="w-4 h-4" />
                            Guardar selección ({selectedIds.length})
                        </Button>
                    </div>
                </div>
            </section>

            <div className="flex flex-wrap items-center gap-1 border-b border-stone-200">
                {([
                    ["ready", `Listos`, readyList.length],
                    ["needs", `Faltan datos`, needsList.length],
                    ["online", `En línea`, onlineList.length],
                    ["all", `Todos`, billablePool.length],
                ] as const).map(([key, label, count]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            filter === key
                                ? "border-teal-800 text-stone-900"
                                : "border-transparent text-stone-400 hover:text-stone-700"
                        }`}
                    >
                        {label}
                        <span className={`ml-1.5 tabular-nums ${filter === key ? "text-teal-800" : "text-stone-300"}`}>
                            {count}
                        </span>
                    </button>
                ))}
                <Link href="/billing" className="ml-auto text-sm text-stone-400 hover:text-teal-800 px-2 py-2">
                    Facturación →
                </Link>
            </div>

            <div className="border border-stone-200 bg-white overflow-hidden">
                <div className="grid grid-cols-[32px_minmax(0,1.35fr)_minmax(150px,1fr)_minmax(0,1.1fr)_minmax(140px,0.85fr)] gap-2 px-3 py-2.5 bg-stone-50 text-[10px] uppercase tracking-[0.14em] font-medium text-stone-400 border-b border-stone-200">
                    <span />
                    <span>Servicio</span>
                    <span>Cliente</span>
                    <span>Propósito</span>
                    <span>Cobro</span>
                </div>
                <div className="max-h-[62vh] overflow-auto">
                    {visible.map((svc) => {
                        const d = drafts[svc.id] || {
                            clientId: "", purpose: "", billingCycle: "monthly" as BillingCycle, amount: "", skip: false,
                        };
                        const ready = draftReady(svc.id);
                        const online = isOnline(svc.status);
                        return (
                            <div
                                key={svc.id}
                                className={`grid grid-cols-[32px_minmax(0,1.35fr)_minmax(150px,1fr)_minmax(0,1.1fr)_minmax(140px,0.85fr)] gap-2 px-3 py-2.5 items-center text-sm border-b border-stone-100 last:border-0 ${
                                    ready ? "bg-teal-50/40" : "hover:bg-stone-50/80"
                                }`}
                                onFocus={() => setEditingId(svc.id)}
                                onBlur={(e) => {
                                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                        setEditingId(null);
                                    }
                                }}
                            >
                                <input
                                    type="checkbox"
                                    className="accent-teal-800"
                                    checked={!!selected[svc.id]}
                                    onChange={(e) => setSelected((prev) => ({ ...prev, [svc.id]: e.target.checked }))}
                                />
                                <div className="min-w-0">
                                    <p className="font-medium text-stone-900 truncate flex items-center gap-1.5">
                                        <span
                                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                online ? "bg-teal-600" : "bg-amber-500"
                                            }`}
                                            title={online ? "En línea" : svc.status}
                                        />
                                        {ready && <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />}
                                        <span className="truncate">{svc.name}</span>
                                    </p>
                                    <p className="text-xs text-stone-400 truncate pl-3">
                                        {svc.type}
                                        {svc.url ? ` · ${svc.url.replace(/^https?:\/\//, "")}` : ""}
                                    </p>
                                </div>
                                <div className="flex gap-1 items-center min-w-0">
                                    <select
                                        className={`w-full border bg-white px-2 py-1.5 text-xs ${
                                            !d.clientId ? "border-amber-300 text-stone-400" : "border-stone-200 text-stone-800"
                                        }`}
                                        value={d.clientId}
                                        onChange={(e) => {
                                            if (e.target.value === "__create__") {
                                                openCreateClient(svc.id);
                                                return;
                                            }
                                            const clientId = e.target.value;
                                            const cl = clients.find((c) => c.id === clientId);
                                            const cycle = cl?.billingCycle === "annual" ? "annual" as const : d.billingCycle;
                                            let amount = d.amount;
                                            if (cl) {
                                                if (cycle === "annual" && cl.annualFee) amount = String(cl.annualFee);
                                                else if (cycle === "monthly" && cl.monthlyFee) amount = String(cl.monthlyFee);
                                            }
                                            setDrafts((prev) => ({
                                                ...prev,
                                                [svc.id]: { ...d, clientId, billingCycle: cycle, amount, skip: false },
                                            }));
                                        }}
                                    >
                                        <option value="">Sin cliente…</option>
                                        <option value="__create__">＋ Crear «{titleCase(subdomainHint(svc))}»…</option>
                                        {clients.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}{c.billingCycle === "annual" ? " · año" : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="shrink-0 h-8 w-8 inline-flex items-center justify-center border border-dashed border-teal-600/40 text-teal-800 hover:bg-teal-50"
                                        title="Crear cliente aquí"
                                        onClick={() => openCreateClient(svc.id)}
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <Input
                                    className="h-8 border-stone-200 text-xs"
                                    value={d.purpose}
                                    onChange={(e) => setDrafts((prev) => ({
                                        ...prev,
                                        [svc.id]: { ...d, purpose: e.target.value, skip: false },
                                    }))}
                                />
                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className="flex items-center gap-1">
                                        <CycleToggle
                                            compact
                                            value={d.billingCycle}
                                            onChange={(cycle) => setDraftCycle(svc.id, cycle, d)}
                                        />
                                        <Input
                                            className="h-7 border-stone-200 text-xs tabular-nums"
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={d.amount}
                                            onChange={(e) => {
                                                setEditingId(svc.id);
                                                setDrafts((prev) => ({
                                                    ...prev,
                                                    [svc.id]: { ...d, amount: e.target.value, skip: false },
                                                }));
                                            }}
                                        />
                                    </div>
                                    {d.billingCycle === "annual" && parseFloat(d.amount || "0") > 0 && (
                                        <p className="text-[10px] text-stone-400 tabular-nums">
                                            ≈ {money(parseFloat(d.amount) / 12)}/mes
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {visible.length === 0 && (
                        <p className="text-center text-stone-400 py-12 text-sm">
                            Nada en este filtro. Prueba Autocompletar o cambia de pestaña.
                        </p>
                    )}
                </div>
            </div>

            <p className="text-xs text-stone-400 leading-relaxed max-w-2xl">
                Usa <b className="font-medium text-stone-600">Mes / Año</b> en cada fila. Al crear un cliente puedes
                marcarlo como anual. El total de arriba muestra el equivalente mensual de todo lo proyectado.
            </p>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md border-stone-200">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "var(--font-outfit), sans-serif" }}>
                            <UserPlus className="w-5 h-5 text-teal-700" />
                            Nuevo cliente
                        </DialogTitle>
                        <DialogDescription>
                            Se crea aquí y queda asignado
                            {createForServiceId
                                ? ` a «${services.find((s) => s.id === createForServiceId)?.name || ""}»`
                                : selectedIds.length > 0
                                    ? ` a ${selectedIds.length} seleccionados`
                                    : ""}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-1">
                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-stone-400">Nombre *</label>
                            <Input
                                className="mt-1 border-stone-200"
                                autoFocus
                                placeholder="Ej. MVP Flow Boutique"
                                value={newClient.name}
                                onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !creating) void createClientInline();
                                }}
                            />
                        </div>
                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-stone-400">Ciclo de cobro</label>
                            <div className="mt-1.5">
                                <CycleToggle
                                    value={newClient.billingCycle}
                                    onChange={(billingCycle) => setNewClient((p) => ({ ...p, billingCycle }))}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[11px] uppercase tracking-wider text-stone-400">Email</label>
                                <Input
                                    className="mt-1 border-stone-200"
                                    type="email"
                                    value={newClient.email}
                                    onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] uppercase tracking-wider text-stone-400">Teléfono</label>
                                <Input
                                    className="mt-1 border-stone-200"
                                    value={newClient.phone}
                                    onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[11px] uppercase tracking-wider text-stone-400">Empresa</label>
                            <Input
                                className="mt-1 border-stone-200"
                                value={newClient.companyName}
                                onChange={(e) => setNewClient((p) => ({ ...p, companyName: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="border-stone-200" onClick={() => setCreateOpen(false)} disabled={creating}>
                            Cancelar
                        </Button>
                        <Button
                            className="bg-teal-800 hover:bg-teal-900 text-white gap-1"
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
