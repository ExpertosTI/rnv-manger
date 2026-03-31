"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, ExternalLink, Moon, Sun } from "lucide-react";

export default function WhiteboardPage() {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(true);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    // Build iframe URL with theme parameter
    const iframeSrc = "/whiteboard-app/index.html";

    return (
        <div className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-white" : "h-[calc(100vh-6rem)]"}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-2">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pizarra RNV</h1>
                    <p className="text-gray-500 text-sm">Dibuja diagramas de arquitectura y planifica tus servidores</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(iframeSrc, "_blank")}
                        className="gap-2"
                    >
                        <ExternalLink size={16} />
                        Pantalla Completa
                    </Button>
                    <Button variant="outline" size="icon" onClick={toggleFullscreen}>
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </Button>
                </div>
            </div>

            {/* Embedded Canvas */}
            <div className="flex-1 rounded-2xl border-2 border-gray-200 overflow-hidden bg-white shadow-sm">
                <iframe
                    src={iframeSrc}
                    className="w-full h-full border-0"
                    title="Pizarra RNV"
                    allow="clipboard-write"
                />
            </div>
        </div>
    );
}
