"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import AIAssistant from "@/components/AIAssistant";

export default function WidgetPage() {
    useEffect(() => {
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
        return () => {
            document.documentElement.style.background = "";
            document.body.style.background = "";
        };
    }, []);

    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "transparent" }}>
            <style jsx global>{`
                html, body {
                    background: transparent !important;
                    background-color: transparent !important;
                }
            `}</style>
            <AIAssistant isWidget={true} />
        </div>
    );
}
