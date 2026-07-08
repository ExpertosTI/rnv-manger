"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { TopHeader } from "@/components/TopHeader";
import { AIAssistantShell } from "@/components/AIAssistantShell";

const BARE_PATHS = ["/login", "/widget"];

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isBare = BARE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
    const isFullBleed = pathname === "/map" || pathname.startsWith("/map/");

    if (isBare) {
        return (
            <>
                {children}
                <AIAssistantShell />
            </>
        );
    }

    return (
        <div className="flex min-h-screen">
            <AppSidebar />
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <TopHeader />
                <main className={`flex-1 ${isFullBleed ? "overflow-hidden" : "overflow-y-auto"}`}>
                    {isFullBleed ? (
                        <div className="h-full">{children}</div>
                    ) : (
                        <div className="p-6 max-w-7xl mx-auto">{children}</div>
                    )}
                </main>
            </div>
            <AIAssistantShell />
        </div>
    );
}
