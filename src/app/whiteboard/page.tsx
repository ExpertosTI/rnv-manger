"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Maximize2, Minimize2, Download, Trash2, Undo, Redo,
    Pen, Square, Circle, ArrowRight, Type, StickyNote,
    Server, Database, Cloud, Globe, Cpu, Eraser, Move,
    Layers, Sparkles, Check
} from "lucide-react";

type ToolType = "select" | "pen" | "eraser" | "rect" | "circle" | "arrow" | "text" | "vps" | "db" | "cloud";

interface DrawElement {
    id: string;
    type: ToolType;
    points?: { x: number; y: number }[];
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    strokeWidth: number;
    text?: string;
    label?: string;
}

const COLORS = [
    { name: "Violeta", hex: "#8b5cf6" },
    { name: "Esmeralda", hex: "#10b981" },
    { name: "Cian", hex: "#06b6d4" },
    { name: "Ámbar", hex: "#f59e0b" },
    { name: "Rosa", hex: "#f43f5e" },
    { name: "Blanco", hex: "#ffffff" },
    { name: "Oscuro", hex: "#334155" },
];

export default function WhiteboardPage() {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [elements, setElements] = useState<DrawElement[]>([]);
    const [history, setHistory] = useState<DrawElement[][]>([]);
    const [currentTool, setCurrentTool] = useState<ToolType>("pen");
    const [currentColor, setCurrentColor] = useState("#8b5cf6");
    const [strokeWidth, setStrokeWidth] = useState(3);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentElement, setCurrentElement] = useState<DrawElement | null>(null);
    const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    // Redraw canvas
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Clear canvas
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw grid
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 1;
        const gridSize = 32;
        for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw elements
        const allElements = currentElement ? [...elements, currentElement] : elements;

        allElements.forEach((el) => {
            ctx.strokeStyle = el.color;
            ctx.fillStyle = el.color;
            ctx.lineWidth = el.strokeWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            if (el.type === "pen" && el.points && el.points.length > 0) {
                ctx.beginPath();
                ctx.moveTo(el.points[0].x, el.points[0].y);
                for (let i = 1; i < el.points.length; i++) {
                    ctx.lineTo(el.points[i].x, el.points[i].y);
                }
                ctx.stroke();
            } else if (el.type === "rect") {
                ctx.strokeRect(el.x, el.y, el.width, el.height);
            } else if (el.type === "circle") {
                ctx.beginPath();
                const radius = Math.sqrt(el.width * el.width + el.height * el.height) / 2;
                ctx.arc(el.x + el.width / 2, el.y + el.height / 2, Math.max(radius, 5), 0, Math.PI * 2);
                ctx.stroke();
            } else if (el.type === "arrow") {
                const tox = el.x + el.width;
                const toy = el.y + el.height;
                ctx.beginPath();
                ctx.moveTo(el.x, el.y);
                ctx.lineTo(tox, toy);
                ctx.stroke();

                // Arrow head
                const headlen = 12;
                const angle = Math.atan2(toy - el.y, tox - el.x);
                ctx.beginPath();
                ctx.moveTo(tox, toy);
                ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(tox, toy);
                ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            } else if (el.type === "vps") {
                // VPS Node Box
                ctx.fillStyle = "rgba(139, 92, 246, 0.15)";
                ctx.strokeStyle = el.color;
                ctx.lineWidth = 2;
                ctx.roundRect ? ctx.roundRect(el.x, el.y, Math.max(el.width, 140), Math.max(el.height, 80), 12) : ctx.strokeRect(el.x, el.y, Math.max(el.width, 140), Math.max(el.height, 80));
                ctx.fill();
                ctx.stroke();

                // Header
                ctx.fillStyle = el.color;
                ctx.font = "bold 13px sans-serif";
                ctx.fillText("🖥️ VPS Server", el.x + 14, el.y + 26);
                ctx.fillStyle = "#94a3b8";
                ctx.font = "11px monospace";
                ctx.fillText(el.label || "45.9.191.18 · Ubuntu", el.x + 14, el.y + 48);
            } else if (el.type === "db") {
                // Database Cylinder
                const w = Math.max(el.width, 120);
                const h = Math.max(el.height, 70);
                ctx.fillStyle = "rgba(6, 182, 212, 0.15)";
                ctx.strokeStyle = el.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(el.x, el.y, w, h, 12) : ctx.strokeRect(el.x, el.y, w, h);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = el.color;
                ctx.font = "bold 13px sans-serif";
                ctx.fillText("🗄️ PostgreSQL / DB", el.x + 12, el.y + 28);
                ctx.fillStyle = "#94a3b8";
                ctx.font = "11px monospace";
                ctx.fillText("Port 5432 · db:5432", el.x + 12, el.y + 48);
            } else if (el.type === "cloud") {
                // Cloud / Network Node
                const w = Math.max(el.width, 130);
                const h = Math.max(el.height, 65);
                ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
                ctx.strokeStyle = el.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(el.x, el.y, w, h, 16) : ctx.strokeRect(el.x, el.y, w, h);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = el.color;
                ctx.font = "bold 13px sans-serif";
                ctx.fillText("☁️ Cloudflare / DNS", el.x + 12, el.y + 28);
                ctx.fillStyle = "#94a3b8";
                ctx.font = "11px monospace";
                ctx.fillText("renace.tech · Traefik", el.x + 12, el.y + 46);
            } else if (el.type === "text" && el.text) {
                ctx.fillStyle = el.color;
                ctx.font = "14px sans-serif";
                ctx.fillText(el.text, el.x, el.y);
            }
        });
    }, [elements, currentElement]);

    // Resize canvas to match container
    useEffect(() => {
        const updateSize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
            canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
            drawCanvas();
        };

        updateSize();
        window.addEventListener("resize", updateSize);
        return () => window.removeEventListener("resize", updateSize);
    }, [drawCanvas, isFullscreen]);

    useEffect(() => {
        drawCanvas();
    }, [drawCanvas]);

    // Mouse handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === "text") {
            setTextInput({ x, y, value: "" });
            return;
        }

        setIsDrawing(true);
        const newEl: DrawElement = {
            id: Date.now().toString(),
            type: currentTool,
            x,
            y,
            width: 0,
            height: 0,
            color: currentColor,
            strokeWidth,
            points: currentTool === "pen" ? [{ x, y }] : undefined,
        };
        setCurrentElement(newEl);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !currentElement) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentElement.type === "pen") {
            const updatedPoints = [...(currentElement.points || []), { x, y }];
            setCurrentElement({ ...currentElement, points: updatedPoints });
        } else {
            setCurrentElement({
                ...currentElement,
                width: x - currentElement.x,
                height: y - currentElement.y,
            });
        }
    };

    const handleMouseUp = () => {
        if (!isDrawing || !currentElement) return;
        setIsDrawing(false);

        // Commit element to history & state
        setHistory((prev) => [...prev, elements]);
        setElements((prev) => [...prev, currentElement]);
        setCurrentElement(null);
    };

    const handleUndo = () => {
        if (elements.length === 0) return;
        const prevElements = elements.slice(0, -1);
        setElements(prevElements);
    };

    const handleClear = () => {
        if (elements.length === 0) return;
        if (confirm("¿Limpiar toda la pizarra?")) {
            setHistory((prev) => [...prev, elements]);
            setElements([]);
        }
    };

    const handleExport = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement("a");
        link.download = `pizarra-rnv-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    };

    const addStamp = (type: "vps" | "db" | "cloud", label: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const x = canvas.width / 2 - 70 + (Math.random() * 60 - 30);
        const y = canvas.height / 2 - 40 + (Math.random() * 60 - 30);
        const newEl: DrawElement = {
            id: Date.now().toString(),
            type,
            x,
            y,
            width: type === "cloud" ? 140 : 150,
            height: 85,
            color: currentColor,
            strokeWidth: 2,
            label,
        };
        setHistory((prev) => [...prev, elements]);
        setElements((prev) => [...prev, newEl]);
    };

    return (
        <div className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-[#0f172a]" : "h-[calc(100vh-6rem)]"}`}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 px-2">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
                        <span className="p-1.5 rounded-xl bg-violet-600 text-white"><Sparkles size={18} /></span>
                        Pizarra RNV & Arquitectura
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Dibuja diagramas de infraestructura, servidores VPS, bases de datos y conexiones en tiempo real.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={handleUndo} className="rounded-xl gap-1 text-xs h-8">
                        <Undo size={14} /> Deshacer
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClear} className="rounded-xl gap-1 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50">
                        <Trash2 size={14} /> Limpiar
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport} className="rounded-xl gap-1 text-xs h-8 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        <Download size={14} /> Exportar PNG
                    </Button>
                    <Button variant="outline" size="icon" onClick={toggleFullscreen} className="rounded-xl h-8 w-8">
                        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </Button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-[#1e293b] border border-slate-700 rounded-2xl mb-3 shadow-lg">
                {/* Tools */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setCurrentTool("pen")}
                        className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            currentTool === "pen" ? "bg-violet-600 text-white shadow" : "text-slate-300 hover:bg-slate-800"
                        }`}
                    >
                        <Pen size={14} /> Lápiz
                    </button>
                    <button
                        onClick={() => setCurrentTool("rect")}
                        className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            currentTool === "rect" ? "bg-violet-600 text-white shadow" : "text-slate-300 hover:bg-slate-800"
                        }`}
                    >
                        <Square size={14} /> Rectángulo
                    </button>
                    <button
                        onClick={() => setCurrentTool("circle")}
                        className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            currentTool === "circle" ? "bg-violet-600 text-white shadow" : "text-slate-300 hover:bg-slate-800"
                        }`}
                    >
                        <Circle size={14} /> Círculo
                    </button>
                    <button
                        onClick={() => setCurrentTool("arrow")}
                        className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            currentTool === "arrow" ? "bg-violet-600 text-white shadow" : "text-slate-300 hover:bg-slate-800"
                        }`}
                    >
                        <ArrowRight size={14} /> Flecha
                    </button>
                    <button
                        onClick={() => setCurrentTool("text")}
                        className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            currentTool === "text" ? "bg-violet-600 text-white shadow" : "text-slate-300 hover:bg-slate-800"
                        }`}
                    >
                        <Type size={14} /> Texto
                    </button>
                </div>

                {/* Architecture Stamping Shortcuts */}
                <div className="flex items-center gap-1 border-l border-slate-700 pl-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Nodos:</span>
                    <button
                        onClick={() => addStamp("vps", "45.9.191.18 · VPS")}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-violet-900/50 text-violet-300 border border-violet-800/40 text-xs font-semibold flex items-center gap-1"
                    >
                        <Server size={13} /> +VPS
                    </button>
                    <button
                        onClick={() => addStamp("db", "PostgreSQL 5432")}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-cyan-900/50 text-cyan-300 border border-cyan-800/40 text-xs font-semibold flex items-center gap-1"
                    >
                        <Database size={13} /> +DB
                    </button>
                    <button
                        onClick={() => addStamp("cloud", "renace.tech DNS")}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-900/50 text-amber-300 border border-amber-800/40 text-xs font-semibold flex items-center gap-1"
                    >
                        <Cloud size={13} /> +Cloud
                    </button>
                </div>

                {/* Color Palette */}
                <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2">
                    {COLORS.map((c) => (
                        <button
                            key={c.hex}
                            onClick={() => setCurrentColor(c.hex)}
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                                currentColor === c.hex ? "scale-125 border-white shadow-md" : "border-transparent opacity-80 hover:opacity-100"
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                        />
                    ))}
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 relative rounded-3xl border-2 border-slate-700/60 overflow-hidden bg-[#0f172a] shadow-2xl">
                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    className="w-full h-full cursor-crosshair block"
                />

                {/* Inline text input popup */}
                {textInput && (
                    <div
                        className="absolute z-20"
                        style={{ left: textInput.x, top: textInput.y }}
                    >
                        <input
                            type="text"
                            placeholder="Escribe texto y pulsa Enter..."
                            value={textInput.value}
                            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && textInput.value.trim()) {
                                    const newEl: DrawElement = {
                                        id: Date.now().toString(),
                                        type: "text",
                                        x: textInput.x,
                                        y: textInput.y + 14,
                                        width: 100,
                                        height: 20,
                                        color: currentColor,
                                        strokeWidth: 2,
                                        text: textInput.value.trim(),
                                    };
                                    setHistory((prev) => [...prev, elements]);
                                    setElements((prev) => [...prev, newEl]);
                                    setTextInput(null);
                                } else if (e.key === "Escape") {
                                    setTextInput(null);
                                }
                            }}
                            autoFocus
                            className="bg-slate-900/90 text-white border border-violet-500 rounded-xl px-3 py-1 text-xs shadow-xl outline-none"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
