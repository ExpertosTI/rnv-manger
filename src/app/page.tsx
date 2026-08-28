"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
    Activity, Server, Users, DollarSign, TrendingUp, ArrowUpRight, RefreshCw,
    AlertTriangle, CreditCard, Wifi, WifiOff, Filter, ChevronDown, Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, listFetcher } from "@/lib/api";
import { DASHBOARD_SHORTCUTS, isVpsOnline } from "@/config/nav";

interface VPSItem {
    id: string;
    name: string;
    status: string;
    ipAddress: string;
}

interface OverdueClient {
    id: string;
    name: string;
    monthlyFee: number;
    daysOverdue: number;
}

interface BillingData {
    name: string;
    totalMonthlyCost: number;
}

interface StatsData {
    vps: number;
    clients: number;
    services: number;
    monthlyRevenue: number;
}

interface ClientData {
    id: string;
    name: string;
    monthlyFee: number;
    paymentDay: number;
    isActive: boolean;
}

function StatCardSkeleton() {
    return <div className="bg-white rounded-2xl p-5 border border-gray-200 animate-pulse h-[120px]" />;
}

export default function Home() {
    const { addToast } = useToast();
    const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [refreshRate, setRefreshRate] = useState<number>(30000); // 30s default
    const [showRateMenu, setShowRateMenu] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const { data: statsResponse, error: statsError, isLoading: statsLoading, mutate: mutateStats } = useSWR<{
        success: boolean;
        data: { totals: StatsData };
    }>("/api/stats", fetcher, { refreshInterval: refreshRate, revalidateOnFocus: true });

    const { data: vpsResponse, isLoading: vpsLoading, mutate: mutateVps } = useSWR<{
        success?: boolean;
        data?: VPSItem[];
    }>("/api/vps", fetcher, { refreshInterval: refreshRate });

    const { data: offlineServicesResponse, mutate: mutateOffline } = useSWR<{
        success: boolean;
        data: Array<{ id: string; name: string; type: string; status: string; url?: string }>;
        count: number;
    }>("/api/services/offline", fetcher, { refreshInterval: refreshRate });

    const { data: clientsResponse, mutate: mutateClients } = useSWR<ClientData[]>(
        "/api/clients",
        listFetcher,
        { refreshInterval: refreshRate ? Math.max(refreshRate, 30000) : 0 }
    );

    const { data: billingData, isLoading: billingLoading, mutate: mutateBilling } = useSWR<BillingData[]>(
        "/api/billing",
        listFetcher,
        { refreshInterval: refreshRate ? Math.max(refreshRate, 30000) : 0 }
    );

    const statsData = statsResponse?.data?.totals || { vps: 0, clients: 0, services: 0, monthlyRevenue: 0 };
    const vpsData = Array.isArray(vpsResponse?.data) ? vpsResponse.data : [];
    const onlineCount = vpsData.filter((v) => isVpsOnline(v.status)).length;
    const offlineServices = offlineServicesResponse?.data || [];

    const billingChart = Array.isArray(billingData)
        ? billingData
              .filter((c) => c?.totalMonthlyCost > 0)
              .sort((a, b) => b.totalMonthlyCost - a.totalMonthlyCost)
              .slice(0, 6)
        : [];

    const overdueClients: OverdueClient[] = (() => {
        const clients = Array.isArray(clientsResponse) ? clientsResponse : [];
        const today = new Date().getDate();
        return clients
            .filter((c) => c.paymentDay && today > c.paymentDay && c.isActive)
            .map((c) => ({
                id: c.id,
                name: c.name,
                monthlyFee: c.monthlyFee || 0,
                daysOverdue: today - c.paymentDay,
            }))
            .sort((a, b) => b.daysOverdue - a.daysOverdue);
    })();

    const filteredVps = vpsData.filter((vps) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "online") return isVpsOnline(vps.status);
        return !isVpsOnline(vps.status);
    });

    const handleRefresh = useCallback(async () => {
        await Promise.all([mutateStats(), mutateVps(), mutateOffline(), mutateClients(), mutateBilling()]);
        setLastRefresh(new Date());
        addToast("Monitor actualizado", "success");
    }, [mutateStats, mutateVps, mutateOffline, mutateClients, mutateBilling, addToast]);

    useEffect(() => {
        if (statsError) addToast("Error al cargar estadísticas", "error");
    }, [statsError, addToast]);

    const isLoading = statsLoading || vpsLoading;
    const hasError = !!statsError;

    const stats = [
        { title: "VPS", value: statsData.vps, subtitle: `${onlineCount} en línea`, icon: Server, color: "from-violet-500 to-purple-600", href: "/vps" },
        { title: "Clientes", value: statsData.clients, subtitle: "activos", icon: Users, color: "from-blue-500 to-cyan-500", href: "/clients" },
        { title: "Ingresos", value: `$${(statsData.monthlyRevenue || 0).toLocaleString()}`, subtitle: "MRR", icon: DollarSign, color: "from-green-500 to-emerald-500", href: "/billing" },
        { title: "Servicios", value: statsData.services, subtitle: `${offlineServices.length} caídos`, icon: Activity, color: offlineServices.length > 0 ? "from-amber-500 to-rose-500" : "from-orange-500 to-rose-500", href: "/services" },
    ];

    const refreshLabels: Record<number, string> = {
        10000: "10s (En vivo)",
        30000: "30s (Normal)",
        60000: "60s (Ahorro)",
        0: "Pausado",
    };

    return (
        <div className="space-y-6">
            {/* Barra de estado de monitoreo */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                        {refreshRate > 0 && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${hasError ? "bg-red-500" : refreshRate > 0 ? "bg-emerald-500" : "bg-gray-400"}`}></span>
                    </span>
                    <p className="text-sm font-medium text-gray-700">
                        Monitor de Infraestructura {refreshRate > 0 ? `· cada ${refreshRate / 1000}s` : "· Pausado"}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Cadencia selector */}
                    <div className="relative">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowRateMenu(!showRateMenu)}
                            className="h-8 text-xs gap-1 border-gray-200"
                        >
                            <Clock size={12} />
                            {refreshLabels[refreshRate] || `${refreshRate / 1000}s`}
                            <ChevronDown size={12} />
                        </Button>
                        <AnimatePresence>
                            {showRateMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[130px]"
                                >
                                    {[10000, 30000, 60000, 0].map((rate) => (
                                        <button
                                            key={rate}
                                            onClick={() => {
                                                setRefreshRate(rate);
                                                setShowRateMenu(false);
                                                addToast(`Frecuencia: ${refreshLabels[rate]}`, "info");
                                            }}
                                            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${refreshRate === rate ? "text-violet-600 font-semibold" : "text-gray-600"}`}
                                        >
                                            {refreshLabels[rate]}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        hasError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                    }`}>
                        {hasError ? <WifiOff size={12} /> : <Wifi size={12} />}
                        {hasError ? "Desconectado" : "En línea"}
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                        {lastRefresh.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <Button variant="outline" size="icon" onClick={handleRefresh} className="h-8 w-8 border-gray-200" title="Actualizar ahora">
                        <RefreshCw size={14} className={isLoading ? "animate-spin text-violet-600" : ""} />
                    </Button>
                </div>
            </div>

            {/* Alert: Servicios Caídos */}
            {offlineServices.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 shadow-sm"
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-amber-900 text-sm flex items-center gap-2">
                                {offlineServices.length} servicio{offlineServices.length > 1 ? "s" : ""} no responde{offlineServices.length > 1 ? "n" : ""}
                            </h3>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {offlineServices.slice(0, 6).map((s) => (
                                    <Link key={s.id} href={`/services/${s.id}`}>
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 border border-amber-300/60 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                            {s.name}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Alert: Clientes con pago vencido */}
            {overdueClients.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-2xl p-4"
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-red-800 text-sm flex items-center gap-2">
                                <CreditCard size={14} />
                                {overdueClients.length} cliente{overdueClients.length > 1 ? "s" : ""} con pago vencido
                            </h3>
                            <div className="mt-2 space-y-1">
                                {overdueClients.slice(0, 3).map((c) => (
                                    <div key={c.id} className="flex justify-between text-sm text-red-700">
                                        <span>{c.name} <span className="text-red-400">({c.daysOverdue}d)</span></span>
                                        <span className="font-semibold">${c.monthlyFee}</span>
                                    </div>
                                ))}
                            </div>
                            <Link href="/clients">
                                <Button size="sm" className="mt-3 bg-red-500 hover:bg-red-600 text-white h-8 text-xs gap-1">
                                    Ver clientes <ArrowUpRight size={12} />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </motion.div>
            )}

            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                {isLoading
                    ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
                    : stats.map((stat, i) => (
                          <Link key={stat.title} href={stat.href}>
                              <motion.div
                                  initial={{ opacity: 0, y: 12 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  className="bg-white rounded-2xl p-5 border border-gray-200 hover:border-violet-300 hover:shadow-md transition-all cursor-pointer group"
                              >
                                  <div className="flex items-start justify-between">
                                      <div>
                                          <p className="text-xs font-medium text-gray-500">{stat.title}</p>
                                          <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                              <TrendingUp size={12} className="text-emerald-500" />
                                              {stat.subtitle}
                                          </p>
                                      </div>
                                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stat.color} shadow-sm`}>
                                          <stat.icon className="w-5 h-5 text-white" />
                                      </div>
                                  </div>
                              </motion.div>
                          </Link>
                      ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                        <div>
                            <h2 className="font-semibold text-gray-900">Servidores VPS</h2>
                            <p className="text-xs text-gray-500">{filteredVps.length} de {vpsData.length}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Button variant="outline" size="sm" onClick={() => setShowFilterMenu(!showFilterMenu)} className="h-8 text-xs gap-1">
                                    <Filter size={12} />
                                    {statusFilter === "all" ? "Todos" : statusFilter === "online" ? "En línea" : "Offline"}
                                    <ChevronDown size={12} />
                                </Button>
                                <AnimatePresence>
                                    {showFilterMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[110px]"
                                        >
                                            {(["all", "online", "offline"] as const).map((v) => (
                                                <button
                                                    key={v}
                                                    onClick={() => { setStatusFilter(v); setShowFilterMenu(false); }}
                                                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${statusFilter === v ? "text-violet-600 font-medium" : "text-gray-600"}`}
                                                >
                                                    {v === "all" ? "Todos" : v === "online" ? "En línea" : "Offline"}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <Link href="/vps">
                                <Button variant="ghost" size="sm" className="h-8 text-xs text-violet-600 gap-1">
                                    Ver todos <ArrowUpRight size={12} />
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {vpsLoading ? (
                        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}</div>
                    ) : filteredVps.length === 0 ? (
                        <p className="text-center py-8 text-sm text-gray-400">Sin servidores</p>
                    ) : (
                        <div className="space-y-2">
                            {filteredVps.slice(0, 5).map((vps) => (
                                <Link key={vps.id} href={`/vps/${vps.id}`}>
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-violet-50 transition-colors">
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isVpsOnline(vps.status) ? "bg-emerald-100" : "bg-gray-200"}`}>
                                            <Server className={`w-4 h-4 ${isVpsOnline(vps.status) ? "text-emerald-600" : "text-gray-400"}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm text-gray-900 truncate">{vps.name}</p>
                                            <p className="text-xs text-gray-400 font-mono">{vps.ipAddress}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                            isVpsOnline(vps.status) ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
                                        }`}>
                                            {isVpsOnline(vps.status) ? "online" : vps.status || "offline"}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <h2 className="font-semibold text-gray-900 mb-4">Atajos</h2>
                    <div className="space-y-2">
                        {DASHBOARD_SHORTCUTS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link key={item.href} href={item.href}>
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-violet-50 transition-colors">
                                        <Icon size={16} className="text-violet-600 shrink-0" />
                                        <span className="text-sm text-gray-700">{item.label}</span>
                                        <ArrowUpRight size={14} className="ml-auto text-gray-300" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="font-semibold text-gray-900">Ingresos por cliente</h2>
                        <p className="text-xs text-gray-500">Top {billingChart.length} por MRR</p>
                    </div>
                    <Link href="/billing">
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-violet-600 gap-1">
                            Facturación <ArrowUpRight size={12} />
                        </Button>
                    </Link>
                </div>
                {billingLoading ? (
                    <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />)}</div>
                ) : billingChart.length === 0 ? (
                    <p className="text-center py-8 text-sm text-gray-400">Sin datos de facturación</p>
                ) : (
                    <div className="space-y-3">
                        {billingChart.map((item) => {
                            const max = Math.max(...billingChart.map((d) => d.totalMonthlyCost));
                            const pct = (item.totalMonthlyCost / max) * 100;
                            return (
                                <div key={item.name}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-700 truncate pr-2">{item.name}</span>
                                        <span className="font-semibold text-emerald-600 shrink-0">${item.totalMonthlyCost.toFixed(0)}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
