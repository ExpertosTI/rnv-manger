"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Activity, Maximize2, Minimize2, Radio } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import { CurrencyToggle } from "./CurrencyToggle";
import { SidebarToggle } from "./SidebarToggle";
import { pageTitleForPath } from "@/config/nav";

export function TopHeader() {
    const pathname = usePathname();
    const title = pageTitleForPath(pathname);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [latency, setLatency] = useState<number | null>(null);

    useEffect(() => {
        let isMounted = true;
        const checkPing = async () => {
            const start = performance.now();
            try {
                const res = await fetch("/api/health", { cache: "no-store" });
                if (res.ok && isMounted) {
                    setLatency(Math.round(performance.now() - start));
                }
            } catch {
                if (isMounted) setLatency(null);
            }
        };

        checkPing();
        const interval = setInterval(checkPing, 20000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
            setIsFullscreen(true);
        } else {
            document.exitFullscreen().catch(() => {});
            setIsFullscreen(false);
        }
    };

    return (
        <header className="h-12 border-b border-gray-200/80 bg-white/90 backdrop-blur-md flex items-center justify-between px-4 sm:px-5 sticky top-0 z-30 flex-shrink-0 shadow-sm shadow-gray-100/50">
            <div className="flex items-center gap-3 min-w-0">
                <SidebarToggle />
                <h1 className="text-sm sm:text-base font-semibold text-gray-800 truncate">{title}</h1>
            </div>

            <div className="flex items-center gap-2.5 ml-auto shrink-0">
                {/* Global Currency Switcher */}
                <CurrencyToggle className="hidden md:flex" />

                {/* Live Monitor HUD */}
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50/80 border border-violet-200/60 text-xs font-medium text-violet-700">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-semibold tracking-wide">MONITOR</span>
                    {latency !== null && (
                        <span className="text-[10px] text-gray-400 font-mono pl-1 border-l border-violet-200/80">
                            {latency}ms
                        </span>
                    )}
                </div>

                {/* Fullscreen Button for Desktop Mode */}
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa (Modo Monitor)"}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>

                <NotificationBell />
                <UserMenu />
            </div>
        </header>
    );
}
