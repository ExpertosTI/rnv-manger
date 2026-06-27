"use client";

import dynamic from "next/dynamic";

const AIAssistant = dynamic(() => import("@/components/AIAssistant"), { ssr: false });

export function AIAssistantShell() {
    return <AIAssistant />;
}
