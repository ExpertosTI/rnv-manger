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

    const openInNewWindow = () => {
        window.open(iframeSrc, "_blank", "noopener,noreferrer,width=1400,height=900");
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
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={openInNewWindow}
                        className="gap-2 bg-violet-600 text-white hover:bg-violet-700 border-violet-600 shadow-sm"
                    >
                        <ExternalLink size={15} />
                        Abrir en Ventana Aparte
                    </Button>
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
