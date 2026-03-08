"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { ClientLayout } from "@/components/ClientLayout";
import OmniSearch from "@/components/OmniSearch";

/**
 * Wrapper that hides app chrome (sidebar, header, AI overlay, search)
 * when on the standalone /assistant route.
 */
export function LayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isStandalone = pathname === "/assistant";

    if (isStandalone) {
        return (
            <div className="min-h-screen" style={{ background: "transparent" }}>
                {children}
            </div>
        );
    }

    return (
        <>
            <div className="flex min-h-screen">
                <AppSidebar />
                <main className="flex-1 overflow-y-auto">
                    <ClientLayout>{children}</ClientLayout>
                </main>
            </div>
            <OmniSearch />
        </>
    );
}
