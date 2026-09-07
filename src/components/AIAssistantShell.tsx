"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const AIAssistant = dynamic(() => import("@/components/AIAssistant"), { ssr: false });

export function AIAssistantShell() {
    const pathname = usePathname();
    if (pathname === "/widget" || pathname.startsWith("/widget/")) {
        return null;
    }
    return <AIAssistant />;
}
