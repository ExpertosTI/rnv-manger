"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard, Server, Users, Settings, Database, FileCode, Zap, Palette,
    Menu, X, DollarSign, Shield, UsersRound, Calendar, Network, ListTodo, ChevronLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { stats } from "@/lib/api";
import { useSidebar } from "@/contexts/SidebarContext";
import { FloatingNavDock } from "@/components/FloatingNavDock";

const sidebarItems = [
    { icon: LayoutDashboard, label: "Panel Principal", href: "/" },
    { icon: ListTodo, label: "Mi Flujo", href: "/workflow" },
    { icon: Server, label: "Servidores VPS", href: "/vps" },
    { icon: Database, label: "Servicios", href: "/services" },
    { icon: Network, label: "Neural Map", href: "/map" },
    { icon: Users, label: "Clientes", href: "/clients" },
    { icon: DollarSign, label: "Facturación", href: "/billing" },
    { icon: Calendar, label: "Calendario", href: "/calendar" },
    { icon: Shield, label: "Auditoría", href: "/audit" },
    { icon: UsersRound, label: "Usuarios", href: "/users" },
    { icon: Palette, label: "Pizarra Blanca", href: "/whiteboard" },
    { icon: FileCode, label: "Editor Config", href: "/config-editor" },
    { icon: Settings, label: "Configuración", href: "/settings" },
];

export function AppSidebar() {
    const pathname = usePathname();
    const { collapsed, toggle, setCollapsed } = useSidebar();
    const [isOpen, setIsOpen] = useState(false);
    const [vpsCount, setVpsCount] = useState<number | string>("...");

    useEffect(() => {
        stats.dashboard()
            .then((data) => {
                if (data.success && data.data?.totals) {
                    setVpsCount(data.data.totals.vps || 0);
                }
            })
            .catch(() => setVpsCount(0));
    }, []);

    const closeMobile = () => setIsOpen(false);

    const ExpandedContent = ({ mobile = false }: { mobile?: boolean }) => (
        <>
            <div className="p-4 border-b border-gray-100/80">
                <div className="flex items-center justify-between gap-2">
                    <Link href="/" className="flex items-center gap-3 group min-w-0" onClick={closeMobile}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200/60 group-hover:shadow-violet-300/80 transition-shadow shrink-0">
                            <Zap className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-base font-bold text-gray-900 truncate">RNV Manager</h1>
                            <p className="text-[11px] text-gray-500">Panel de Control</p>
                        </div>
                    </Link>
                    {!mobile && (
                        <button
                            type="button"
                            onClick={toggle}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0"
                            title="Minimizar a iconos"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Menú</p>
                {sidebarItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={closeMobile}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative ${
                                isActive
                                    ? "bg-violet-50 text-violet-700 font-medium shadow-sm shadow-violet-100/50"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-violet-500 rounded-r-full"
                                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                                />
                            )}
                            <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                            <span className="text-sm truncate">{item.label}</span>
                            {item.label === "Pizarra Blanca" && (
                                <span className="ml-auto text-[9px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                    NUEVO
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-2 border-t border-gray-100/80">
                <div className="rounded-xl bg-gradient-to-br from-violet-50/80 to-purple-50/50 p-3 mb-2">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-medium text-gray-500">VPS Activos</span>
                        <span className="text-base font-bold text-violet-600 tabular-nums">{vpsCount}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200/80 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500"
                            style={{ width: vpsCount === "..." || vpsCount === 0 ? "0%" : "100%" }}
                        />
                    </div>
                </div>
                <Link
                    href="/users"
                    onClick={closeMobile}
                    className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0">
                        A
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">Admin</p>
                        <p className="text-[11px] text-gray-500 truncate">Super Admin</p>
                    </div>
                </Link>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile FAB */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="lg:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-violet-600 text-white shadow-[0_8px_28px_rgba(124,58,237,0.45)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                aria-label="Menú"
            >
                {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            {/* Desktop: floating dock when collapsed — zero layout width */}
            {collapsed && (
                <FloatingNavDock items={sidebarItems} onExpand={() => setCollapsed(false)} />
            )}

            {/* Desktop: expanded panel */}
            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.aside
                        key="expanded-sidebar"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 240, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 38 }}
                        className="hidden lg:flex h-screen flex-col sticky top-0 overflow-hidden shrink-0 bg-white/85 backdrop-blur-xl border-r border-gray-100/90"
                    >
                        <ExpandedContent />
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Mobile drawer */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeMobile}
                            className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-30 lg:hidden"
                        />
                        <motion.aside
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 320 }}
                            className="fixed inset-y-0 left-0 z-40 w-[min(280px,88vw)] bg-white/95 backdrop-blur-xl flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.12)] lg:hidden"
                        >
                            <ExpandedContent mobile />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
