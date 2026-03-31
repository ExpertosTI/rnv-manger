"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Server, Users, Settings, Database, FileCode, Zap, Palette, Menu, X, DollarSign, Shield, UsersRound } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const sidebarItems = [
    { icon: LayoutDashboard, label: "Panel Principal", href: "/" },
    { icon: Server, label: "Servidores VPS", href: "/vps" },
    { icon: Database, label: "Servicios", href: "/services" },
    { icon: Users, label: "Clientes", href: "/clients" },
    { icon: DollarSign, label: "Facturación", href: "/billing" },
    { icon: Shield, label: "Auditoría", href: "/audit" },
    { icon: UsersRound, label: "Usuarios", href: "/users" },
    { icon: Palette, label: "Pizarra Blanca", href: "/whiteboard" },
    { icon: FileCode, label: "Editor Config", href: "/config-editor" },
    { icon: Settings, label: "Configuración", href: "/settings" },
];

export function AppSidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const [vpsCount, setVpsCount] = useState<number | string>("...");

    useEffect(() => {
        fetch("/api/stats")
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setVpsCount(data.data.vps);
                }
            })
            .catch(() => setVpsCount(0));
    }, []);

    if (pathname === "/login") return null;

    const toggleSidebar = () => setIsOpen(!isOpen);

    const SidebarContent = () => (
        <>
            {/* Logo */}
            <div className="p-5 border-b border-gray-100">
                <Link href="/" className="flex items-center gap-3 group" onClick={() => setIsOpen(false)}>
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-200 group-hover:shadow-purple-300 transition-shadow">
                        <Zap className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900">RNV Manager</h1>
                        <p className="text-xs text-gray-500">Panel de Control</p>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Menú</p>
                {sidebarItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative ${isActive
                                ? "bg-violet-100 text-violet-700 font-medium"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                }`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-violet-500 rounded-r-full"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-sm">{item.label}</span>
                            {item.label === "Pizarra Blanca" && (
                                <span className="ml-auto text-[10px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                                    NUEVO
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Quick Stats */}
            <div className="p-3 border-t border-gray-100">
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500">VPS Activos</span>
                        <span className="text-lg font-bold text-violet-600">{vpsCount}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full" style={{ width: vpsCount === "..." || vpsCount === 0 ? "0%" : "100%" }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{vpsCount === 0 ? "Sin servidores" : "Todos funcionales"}</p>
                </div>
            </div>

            {/* User */}
            <div className="p-3 border-t border-gray-100">
                <Link
                    href="/users"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                        A
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">Admin</p>
                        <p className="text-xs text-gray-500 truncate">Super Admin</p>
                    </div>
                </Link>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile Toggle */}
            <button
                onClick={toggleSidebar}
                className="lg:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-violet-600 text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex w-64 h-screen bg-white border-r-2 border-gray-200 flex-col shadow-sm sticky top-0">
                <SidebarContent />
            </aside>

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.aside
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed inset-y-0 left-0 z-40 w-72 bg-white flex flex-col shadow-2xl lg:hidden"
                    >
                        <SidebarContent />
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
                    />
                )}
            </AnimatePresence>
        </>
    );
}
