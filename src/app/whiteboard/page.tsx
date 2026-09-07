"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, ExternalLink, Sparkles } from "lucide-react";

export default function WhiteboardPage() {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [iframeKey, setIframeKey] = useState(0);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    const handleReload = () => {
        setIframeKey((prev) => prev + 1);
    };

    const handleOpenInNewWindow = async (e: React.MouseEvent) => {
        e.preventDefault();

        // 1. Intentar invocar comando nativo en Tauri
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("open_whiteboard");
            return;
        } catch {
            // 2. Fallback estándar para navegador web
            const fullUrl = typeof window !== "undefined"
                ? `${window.location.origin}/whiteboard-app/index.html`
                : "https://rnv.renace.tech/whiteboard-app/index.html";
            window.open(fullUrl, "_blank", "noopener,noreferrer");
        }
    };

    return (
        <div className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-[#121212] p-2" : "h-full p-4 bg-[#0d0c13]"}`}>
            {/* Header / Toolbar */}
            <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400">
                        <Sparkles size={18} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base font-bold text-white tracking-tight">Pizarra RNV & Arquitectura</h1>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                Excalidraw Canvas
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-400">Diseño colaborativo de topologías, servidores, bases de datos y flujos</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleReload}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-medium text-xs border border-white/10 transition-all active:scale-95 cursor-pointer"
                        title="Recargar lienzo"
                    >
                        Recargar
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenInNewWindow}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium text-xs shadow-md shadow-violet-500/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer border border-violet-400/30"
                    >
                        <ExternalLink size={13} />
                        Ventana Aparte
                    </button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={toggleFullscreen}
                        className="h-8 w-8 rounded-xl bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
                        title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                    >
                        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </Button>
                </div>
            </div>

            {/* Embedded Canvas / Excalidraw */}
            <div className="flex-1 rounded-2xl border border-white/10 overflow-hidden bg-[#121212] shadow-2xl relative min-h-0">
                <iframe
                    key={iframeKey}
                    src="/whiteboard-app/index.html"
                    className="w-full h-full border-0 absolute inset-0"
                    title="Pizarra RNV"
                    allow="clipboard-write; clipboard-read"
                />
            </div>
        </div>
    );
}
