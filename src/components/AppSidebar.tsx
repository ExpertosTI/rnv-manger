"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Zap, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSidebar } from "@/contexts/SidebarContext";
import { FloatingNavDock } from "@/components/FloatingNavDock";
import { MAIN_NAV, ADMIN_NAV } from "@/config/nav";
import { auth, type User } from "@/lib/api";

function NavSection({
    items,
    pathname,
    onNavigate,
}: {
    items: typeof MAIN_NAV;
    pathname: string;
    onNavigate?: () => void;
}) {
    return (
        <>
            {items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
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
                        <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                        <span className="text-sm truncate">{item.label}</span>
                    </Link>
                );
            })}
        </>
    );
}

export function AppSidebar() {
    const pathname = usePathname();
    const { collapsed, toggle, setCollapsed } = useSidebar();
    const [isOpen, setIsOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    useEffect(() => {
        auth.me().then(res => {
            if (res.success && res.user) setCurrentUser(res.user);
        }).catch(() => {});
    }, []);

    const isAffiliate = currentUser?.role === "affiliate" || currentUser?.role === "collaborator";

    // Filter navigation for affiliates
    const visibleMainNav = isAffiliate
        ? MAIN_NAV.filter(item => ["/", "/clients", "/afiliados", "/billing", "/calendar", "/workflow"].includes(item.href))
        : MAIN_NAV;

    const visibleAdminNav = isAffiliate ? [] : ADMIN_NAV;

    const closeMobile = () => setIsOpen(false);

    const ExpandedContent = ({ mobile = false }: { mobile?: boolean }) => (
        <>
            <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between gap-2">
                    <Link href="/" className="flex items-center gap-3 group min-w-0" onClick={closeMobile}>
                        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md shadow-violet-500/20 shrink-0 bg-[#0f0e17] flex items-center justify-center p-0.5 border border-violet-500/30 group-hover:border-violet-500/60 transition-colors">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/logo.png" alt="RENACE" className="w-full h-full object-contain rounded-lg" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-gray-900 truncate tracking-tight">RNV Manager</h2>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <p className="text-[11px] font-medium text-violet-600">
                                    {isAffiliate ? "Colaborador" : "RENACE.tech"}
                                </p>
                            </div>
                        </div>
                    </Link>
                    {!mobile && (
                        <button
                            type="button"
                            onClick={toggle}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0"
                            title="Minimizar menú"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            <nav className="flex-1 p-2 space-y-4 overflow-y-auto">
                <div className="space-y-0.5">
                    <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {isAffiliate ? "Mi Espacio" : "Operaciones"}
                    </p>
                    <NavSection items={visibleMainNav} pathname={pathname} onNavigate={closeMobile} />
                </div>
                {visibleAdminNav.length > 0 && (
                    <div className="space-y-0.5">
                        <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Admin</p>
                        <NavSection items={visibleAdminNav} pathname={pathname} onNavigate={closeMobile} />
                    </div>
                )}
            </nav>
        </>
    );

    return (
        <>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="lg:hidden fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-violet-600 text-white shadow-[0_8px_28px_rgba(124,58,237,0.45)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                aria-label="Menú"
            >
                {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            {collapsed && (
                <FloatingNavDock items={[...MAIN_NAV, ...ADMIN_NAV]} onExpand={() => setCollapsed(false)} />
            )}

            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.aside
                        key="expanded-sidebar"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 240, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 38 }}
                        className="hidden lg:flex h-screen flex-col sticky top-0 overflow-hidden shrink-0 bg-white border-r border-gray-200"
                    >
                        <ExpandedContent />
                    </motion.aside>
                )}
            </AnimatePresence>

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
                            className="fixed inset-y-0 left-0 z-40 w-[min(280px,88vw)] bg-white flex flex-col shadow-xl lg:hidden"
                        >
                            <ExpandedContent mobile />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
