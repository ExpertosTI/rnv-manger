"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, ExternalLink, Sparkles } from "lucide-react";

export default function WhiteboardPage() {
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    const iframeSrc = "/whiteboard-app/index.html";

    const handleOpenInNewWindow = (e: React.MouseEvent<HTMLAnchorElement>) => {
        const fullUrl = typeof window !== "undefined"
            ? `${window.location.origin}/whiteboard-app/index.html`
            : "https://rnv.renace.tech/whiteboard-app/index.html";

        // Try Tauri invoke if available
        if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
            try {
                (window as any).__TAURI_INTERNALS__.invoke("open_whiteboard");
                e.preventDefault();
                return;
            } catch {}
        }

        // Try standard window.open
        try {
            const w = window.open(fullUrl, "_blank");
            if (w) {
                e.preventDefault();
                return;
            }
        } catch {}
    };

    return (
        <div className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-[#121212]" : "h-[calc(100vh-6rem)]"}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-500">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pizarra RNV & Arquitectura</h1>
                        <p className="text-xs text-gray-500">Pizarra profesional (Excalidraw) para arquitectura de servidores y diagramas</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="/whiteboard-app/index.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleOpenInNewWindow}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium text-xs shadow-md shadow-violet-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer no-underline"
                    >
                        <ExternalLink size={15} />
                        Abrir en Ventana Aparte
                    </a>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={toggleFullscreen}
                        className="h-9 w-9"
                        title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </Button>
                </div>
            </div>

            {/* Embedded Canvas / Excalidraw */}
            <div className="flex-1 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-[#121212] shadow-xl relative">
                <iframe
                    src={iframeSrc}
                    className="w-full h-full border-0"
                    title="Pizarra RNV"
                    allow="clipboard-write; clipboard-read"
                />
            </div>
        </div>
    );
}
