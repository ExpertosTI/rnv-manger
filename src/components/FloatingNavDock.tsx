"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = {
    icon: LucideIcon;
    label: string;
    href: string;
};

type Props = {
    items: NavItem[];
    onExpand: () => void;
};

function DockIcon({ item, active }: { item: NavItem; active: boolean }) {
    const Icon = item.icon;
    return (
        <Link href={item.href} title={item.label} className="group relative flex justify-center">
            <motion.div
                whileHover={{ scale: 1.08, y: -1 }}
                whileTap={{ scale: 0.94 }}
                className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors duration-200",
                    active
                        ? "border-violet-200/80 bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_8px_28px_rgba(124,58,237,0.45),0_2px_8px_rgba(124,58,237,0.25)]"
                        : "border-white/90 bg-white/90 text-gray-600 shadow-[0_4px_18px_rgba(15,23,42,0.08),0_1px_4px_rgba(15,23,42,0.04)] backdrop-blur-xl hover:border-violet-100 hover:text-violet-600 hover:shadow-[0_10px_32px_rgba(124,58,237,0.18)]"
                )}
            >
                {active && (
                    <span className="absolute inset-0 rounded-2xl bg-violet-400/20 blur-md -z-10" />
                )}
                <Icon size={19} strokeWidth={active ? 2.5 : 2} />
            </motion.div>
            <span
                className={cn(
                    "pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium",
                    "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150",
                    "bg-gray-900/90 text-white shadow-lg backdrop-blur-sm z-50"
                )}
            >
                {item.label}
            </span>
        </Link>
    );
}

export function FloatingNavDock({ items, onExpand }: Props) {
    const pathname = usePathname();

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="hidden lg:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-2 max-h-[min(88vh,720px)]"
            >
                {/* Logo */}
                <Link href="/" title="RNV Manager">
                    <motion.div
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_10px_32px_rgba(124,58,237,0.4)] border border-violet-400/30"
                    >
                        <Zap className="h-5 w-5" />
                    </motion.div>
                </Link>

                <button
                    type="button"
                    onClick={onExpand}
                    title="Expandir menú"
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 backdrop-blur-md border border-white/90 text-gray-500 shadow-[0_2px_12px_rgba(15,23,42,0.06)] hover:text-violet-600 hover:shadow-[0_4px_16px_rgba(124,58,237,0.15)] transition-all"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>

                <div className="h-px w-6 bg-gradient-to-r from-transparent via-gray-300/80 to-transparent" />

                {/* Scrollable icons */}
                <div className="flex flex-col items-center gap-1.5 overflow-y-auto py-1 px-0.5 scrollbar-none flex-1 min-h-0">
                    {items.map((item) => (
                        <DockIcon key={item.href} item={item} active={pathname === item.href} />
                    ))}
                </div>

                <div className="h-px w-6 bg-gradient-to-r from-transparent via-gray-300/80 to-transparent" />

                <Link href="/users" title="Admin">
                    <motion.div
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-purple-500 text-white text-sm font-bold shadow-[0_6px_20px_rgba(124,58,237,0.35)] border-2 border-white"
                    >
                        A
                    </motion.div>
                </Link>
            </motion.div>
        </AnimatePresence>
    );
}
