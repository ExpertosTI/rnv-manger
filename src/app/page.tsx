"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
    Activity, Server, Users, DollarSign, TrendingUp, Bell,
    ArrowUpRight, RefreshCw, AlertTriangle, Zap, CreditCard,
    Wifi, WifiOff, Filter, ChevronDown, BarChart3, Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";

// Types
interface VPSItem {
    id: string;
    name: string;
    status: string;
    ipAddress: string;
    monthlyCost?: number;
}

interface OverdueClient {
    id: string;
    name: string;
    monthlyFee: number;
    paymentDay: number;
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
    revenue: number;
}

interface ClientData {
    id: string;
    name: string;
    monthlyFee: number;
    paymentDay: number;
    isActive: boolean;
}

// Fetcher for SWR
const fetcher = (url: string) => fetch(url).then(res => res.json());

// Skeleton Components
function StatCardSkeleton() {
    return (
        <div className="bg-gray-100 rounded-2xl p-6 animate-pulse">
            <div className="flex items-start justify-between">
                <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-24" />
                    <div className="h-10 bg-gray-200 rounded w-16" />
                    <div className="h-3 bg-gray-200 rounded w-32" />
                </div>
                <div className="w-12 h-12 bg-gray-200 rounded-xl" />
            </div>
        </div>
    );
}

function VPSListSkeleton() {
    return (
        <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 animate-pulse">
                    <div className="w-10 h-10 rounded-xl bg-gray-200" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-32" />
                        <div className="h-3 bg-gray-200 rounded w-24" />
                    </div>
                    <div className="h-6 bg-gray-200 rounded-full w-16" />
                </div>
            ))}
        </div>
    );
}

function ChartSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-2">
                    <div className="flex justify-between">
                        <div className="h-4 bg-gray-200 rounded w-24" />
                        <div className="h-4 bg-gray-200 rounded w-16" />
                    </div>
                    <div className="h-4 bg-gray-100 rounded-full">
                        <div className="h-full bg-gray-200 rounded-full" style={{ width: `${100 - i * 15}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Tooltip Component
function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
    return (
        <div className="relative group">
            {children}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {content}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900" />
            </div>
        </div>
    );
}

export default function Home() {
    const { toast } = useToast();
    const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped">("all");
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    // SWR hooks with auto-refresh every 30 seconds
    const { data: statsResponse, error: statsError, isLoading: statsLoading, mutate: mutateStats } = useSWR<{ success: boolean; data: StatsData }>(
        "/api/stats",
        fetcher,
        { refreshInterval: 30000, revalidateOnFocus: true }
    );

    const { data: vpsResponse, error: vpsError, isLoading: vpsLoading, mutate: mutateVps } = useSWR<{ data: VPSItem[] }>(
        "/api/hostinger/vps",
        fetcher,
        { refreshInterval: 30000 }
    );

    const { data: clientsResponse, error: clientsError, isLoading: clientsLoading, mutate: mutateClients } = useSWR<{ success: boolean; data: ClientData[] } | ClientData[]>(
        "/api/clients",
        fetcher,
        { refreshInterval: 60000 }
    );

    const { data: billingResponse, error: billingError, isLoading: billingLoading, mutate: mutateBilling } = useSWR<{ success: boolean; data: BillingData[] }>(
        "/api/billing",
        fetcher,
        { refreshInterval: 60000 }
    );

    // Derived data
    const statsData = statsResponse?.data || { vps: 0, clients: 0, services: 0, revenue: 0 };
    const vpsData = vpsResponse?.data || [];

    const billingData = billingResponse?.success && billingResponse.data
        ? billingResponse.data
            .filter((c) => c.totalMonthlyCost > 0)
            .sort((a, b) => b.totalMonthlyCost - a.totalMonthlyCost)
            .slice(0, 6)
            .map((c) => ({
                name: c.name.length > 12 ? c.name.substring(0, 12) + "..." : c.name,
                totalMonthlyCost: c.totalMonthlyCost
            }))
        : [];

    // Calculate overdue clients
    const overdueClients: OverdueClient[] = (() => {
        const clientsArray = Array.isArray(clientsResponse)
            ? clientsResponse
            : clientsResponse?.data || [];

        if (!Array.isArray(clientsArray)) return [];

        const today = new Date().getDate();
        return clientsArray
            .filter((c) => c.paymentDay && today > c.paymentDay && c.isActive)
            .map((c) => ({
                id: c.id,
                name: c.name,
                monthlyFee: c.monthlyFee || 0,
                paymentDay: c.paymentDay,
                daysOverdue: today - c.paymentDay
            }))
            .sort((a, b) => b.daysOverdue - a.daysOverdue);
    })();

    // Filter VPS by status
    const filteredVps = vpsData.filter(vps => {
        if (statusFilter === "all") return true;
        return vps.status === statusFilter;
    });

    // Manual refresh
    const handleRefresh = useCallback(async () => {
        toast({
            title: "Actualizando...",
            description: "Obteniendo datos más recientes",
        });

        await Promise.all([
            mutateStats(),
            mutateVps(),
            mutateClients(),
            mutateBilling()
        ]);

        setLastRefresh(new Date());

        toast({
            title: "✅ Actualizado",
            description: "Todos los datos están al día",
        });
    }, [mutateStats, mutateVps, mutateClients, mutateBilling, toast]);

    // Show errors
    useEffect(() => {
        if (statsError || vpsError || clientsError || billingError) {
            toast({
                title: "Error de conexión",
                description: "No se pudieron cargar algunos datos",
                variant: "destructive",
            });
        }
    }, [statsError, vpsError, clientsError, billingError, toast]);

    const isLoading = statsLoading || vpsLoading;
    const hasError = statsError || vpsError;

    const stats = [
        {
            title: "VPS Managed",
            value: statsData.vps,
            subtitle: `${vpsData.filter((v) => v.status === "running").length} activos ahora`,
            icon: Server,
            color: "from-violet-500 to-purple-600",
            bgColor: "bg-violet-50 dark:bg-violet-950",
            href: "/vps",
            tooltip: "Total de servidores VPS administrados"
        },
        {
            title: "Clientes",
            value: statsData.clients,
            subtitle: "En base de datos",
            icon: Users,
            color: "from-blue-500 to-cyan-500",
            bgColor: "bg-blue-50 dark:bg-blue-950",
            href: "/clients",
            tooltip: "Clientes registrados en el sistema"
        },
        {
            title: "Ingresos",
            value: `$${statsData.revenue.toLocaleString()}`,
            subtitle: "Total mensual",
            icon: DollarSign,
            color: "from-green-500 to-emerald-500",
            bgColor: "bg-green-50 dark:bg-green-950",
            href: "/billing",
            tooltip: "Suma de todos los servicios mensuales"
        },
        {
            title: "Servicios",
            value: statsData.services,
            subtitle: "Instancias activas",
            icon: Activity,
            color: "from-orange-500 to-rose-500",
            bgColor: "bg-orange-50 dark:bg-orange-950",
            href: "/services",
            tooltip: "Servicios desplegados (Odoo, web, etc.)"
        },
    ];

    const quickActions = [
        { label: "Ver Servidores", icon: Server, href: "/vps", primary: true },
        { label: "Facturación", icon: DollarSign, href: "/billing" },
        { label: "Gestionar Clientes", icon: Users, href: "/clients" },
        { label: "Pizarra Blanca", icon: Zap, href: "/whiteboard", badge: "NUEVO" },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Panel Principal</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">¡Bienvenido de vuelta! Aquí está tu resumen.</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Connection Status */}
                    <Tooltip content={hasError ? "Error de conexión" : "Conectado"}>
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${hasError
                                ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            }`}>
                            {hasError ? <WifiOff size={14} /> : <Wifi size={14} />}
                            {hasError ? "Desconectado" : "En línea"}
                        </div>
                    </Tooltip>

                    {/* Last Updated */}
                    <Tooltip content={`Última actualización: ${lastRefresh.toLocaleTimeString()}`}>
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Clock size={14} />
                            {lastRefresh.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                    </Tooltip>

                    {/* Refresh Button */}
                    <Tooltip content="Actualizar datos (auto cada 30s)">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleRefresh}
                            className="border-2 border-gray-200 hover:border-violet-300 dark:border-gray-700"
                        >
                            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                        </Button>
                    </Tooltip>

                    {/* Notifications */}
                    <Tooltip content={overdueClients.length > 0 ? `${overdueClients.length} pagos vencidos` : "Sin alertas"}>
                        <Button variant="outline" size="icon" className="relative border-2 border-gray-200 hover:border-violet-300 dark:border-gray-700">
                            <Bell size={18} />
                            <AnimatePresence>
                                {overdueClients.length > 0 && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold"
                                    >
                                        {overdueClients.length}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </Button>
                    </Tooltip>

                    {/* Date */}
                    <div className="text-right hidden md:block">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{new Date().toLocaleDateString("es-ES", { weekday: "long" })}</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                </div>
            </div>

            {/* Overdue Payment Alert */}
            <AnimatePresence>
                {overdueClients.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950 border-2 border-red-200 dark:border-red-800 rounded-2xl p-4"
                    >
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900">
                                <AlertTriangle className="w-6 h-6 text-red-500" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-red-800 dark:text-red-200 flex items-center gap-2">
                                    <CreditCard size={16} />
                                    {overdueClients.length} Cliente{overdueClients.length > 1 ? "s" : ""} con Pago Vencido
                                </h3>
                                <div className="mt-2 space-y-1">
                                    {overdueClients.slice(0, 3).map(client => (
                                        <div key={client.id} className="flex items-center justify-between text-sm">
                                            <span className="text-red-700 dark:text-red-300">
                                                <span className="font-medium">{client.name}</span>
                                                <span className="text-red-500 dark:text-red-400 ml-2">({client.daysOverdue} días)</span>
                                            </span>
                                            <span className="font-bold text-red-800 dark:text-red-200">${client.monthlyFee}</span>
                                        </div>
                                    ))}
                                    {overdueClients.length > 3 && (
                                        <p className="text-xs text-red-500">+ {overdueClients.length - 3} más...</p>
                                    )}
                                </div>
                                <Link href="/clients">
                                    <Button size="sm" className="mt-3 bg-red-500 hover:bg-red-600 text-white rounded-lg gap-1">
                                        Ver Todos <ArrowUpRight size={14} />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stats Grid */}
            <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4">
                {isLoading ? (
                    <>
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                    </>
                ) : (
                    stats.map((stat, index) => (
                        <Tooltip key={stat.title} content={stat.tooltip}>
                            <Link href={stat.href}>
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    className={`${stat.bgColor} rounded-2xl p-4 sm:p-6 border-2 border-transparent hover:border-violet-200 dark:hover:border-violet-700 transition-all cursor-pointer group relative overflow-hidden`}
                                >
                                    <div className="flex items-start justify-between relative z-10">
                                        <div>
                                            <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{stat.title}</p>
                                            <p className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mt-1 sm:mt-2">
                                                {typeof stat.value === "number" ? stat.value : stat.value}
                                            </p>
                                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 sm:mt-2 flex items-center gap-1">
                                                <TrendingUp size={14} className="text-green-500" />
                                                {stat.subtitle}
                                            </p>
                                        </div>
                                        <div className={`p-2 sm:p-3 rounded-xl bg-gradient-to-br ${stat.color} shadow-lg group-hover:scale-110 transition-transform`}>
                                            <stat.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                        </div>
                                    </div>
                                    <div className="absolute -right-8 -bottom-8 w-24 sm:w-32 h-24 sm:h-32 rounded-full bg-white/30 dark:bg-white/10 group-hover:scale-150 transition-transform duration-500" />
                                </motion.div>
                            </Link>
                        </Tooltip>
                    ))
                )}
            </div>

            {/* Main Content */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* VPS Quick View */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-100 dark:border-gray-800 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Servidores VPS</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{filteredVps.length} de {vpsData.length} servidores</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Filter Dropdown */}
                            <div className="relative">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowFilterMenu(!showFilterMenu)}
                                    className="gap-1 dark:border-gray-700"
                                >
                                    <Filter size={14} />
                                    {statusFilter === "all" ? "Todos" : statusFilter === "running" ? "Activos" : "Detenidos"}
                                    <ChevronDown size={14} />
                                </Button>
                                <AnimatePresence>
                                    {showFilterMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[120px]"
                                        >
                                            {[
                                                { value: "all", label: "Todos" },
                                                { value: "running", label: "Activos" },
                                                { value: "stopped", label: "Detenidos" }
                                            ].map((option) => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => {
                                                        setStatusFilter(option.value as any);
                                                        setShowFilterMenu(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${statusFilter === option.value ? "text-violet-600 font-medium" : "text-gray-700 dark:text-gray-300"
                                                        }`}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <Link href="/vps">
                                <Button variant="ghost" size="sm" className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950 gap-1">
                                    Ver todos <ArrowUpRight size={14} />
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {vpsLoading ? (
                        <VPSListSkeleton />
                    ) : filteredVps.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                            <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No hay servidores {statusFilter !== "all" ? `con estado "${statusFilter}"` : ""}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredVps.slice(0, 5).map((vps, index) => (
                                <motion.div
                                    key={vps.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    whileHover={{ x: 4 }}
                                    className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-violet-50 dark:hover:bg-violet-950/50 transition-colors group cursor-pointer"
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${vps.status === "running"
                                            ? "bg-green-100 dark:bg-green-900"
                                            : "bg-gray-200 dark:bg-gray-700"
                                        }`}>
                                        <Server className={`w-5 h-5 ${vps.status === "running"
                                                ? "text-green-600 dark:text-green-400"
                                                : "text-gray-400"
                                            }`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 dark:text-white truncate">{vps.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{vps.ipAddress}</p>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${vps.status === "running"
                                            ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                                            : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                        }`}>
                                        {vps.status === "running" ? "Activo" : vps.status}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-100 dark:border-gray-800 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Acciones Rápidas</h2>
                    <div className="space-y-3">
                        {quickActions.map((action, index) => (
                            <Link key={action.label} href={action.href}>
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 + index * 0.1 }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <Button
                                        className={`w-full justify-start gap-3 h-12 ${action.primary
                                            ? "bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-lg shadow-purple-200 dark:shadow-purple-900"
                                            : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border-0"
                                            }`}
                                        variant={action.primary ? "default" : "outline"}
                                    >
                                        <action.icon size={18} />
                                        {action.label}
                                        {action.badge && (
                                            <span className="ml-auto text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                                                {action.badge}
                                            </span>
                                        )}
                                    </Button>
                                </motion.div>
                            </Link>
                        ))}
                    </div>

                    {/* Tip Card */}
                    <motion.div
                        className="mt-6 p-4 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950 dark:to-purple-950 border border-violet-100 dark:border-violet-800"
                        whileHover={{ scale: 1.02 }}
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900">
                                <BarChart3 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-refresh activo</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Los datos se actualizan cada 30 segundos</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Revenue Chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-100 dark:border-gray-800 p-6 shadow-sm"
            >
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ingresos por Cliente</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {billingLoading ? "Cargando..." : `Top ${billingData.length} clientes por facturación mensual`}
                        </p>
                    </div>
                    <Link href="/billing">
                        <Button variant="ghost" size="sm" className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950 gap-1">
                            Ver Billing <ArrowUpRight size={14} />
                        </Button>
                    </Link>
                </div>

                {billingLoading ? (
                    <ChartSkeleton />
                ) : billingData.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No hay datos de facturación</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {billingData.map((item, index) => {
                            const maxValue = Math.max(...billingData.map(d => d.totalMonthlyCost));
                            const percentage = (item.totalMonthlyCost / maxValue) * 100;
                            return (
                                <motion.div
                                    key={item.name}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.5 + index * 0.1 }}
                                    className="group"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.name}</span>
                                        <span className="text-sm font-bold text-green-600 dark:text-green-400">${item.totalMonthlyCost.toFixed(2)}</span>
                                    </div>
                                    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${percentage}%` }}
                                            transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full group-hover:from-green-500 group-hover:to-emerald-600 transition-colors"
                                        />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
