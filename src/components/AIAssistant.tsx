/**
 * AI Assistant — Floating Clippy Companion
 * Draggable mascot with floating speech bubbles that materialize in the air.
 * No chat box — responses appear as animated floating panels near the mascot.
 */

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
    X, Send, Loader2, ChevronDown, ChevronUp,
    CheckCircle2, XCircle, Users, DollarSign, Server, FileText,
    Search, Trash2, Plus, CreditCard, BarChart3, ArrowRight,
    AlertTriangle, Check, Zap, RefreshCw, Eye, Download,
    Settings, Calendar, Mail, Shield, Database,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

/* ──────────────────────────── Types ──────────────────────────── */

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    executedFunctions?: any[];
}

type MascotState = "idle" | "thinking" | "success" | "error" | "barrel-roll" | "shivering" | "celebrate";

/* ───────────────────── Icon map for actions ──────────────────── */

const ICON_MAP: Record<string, React.ElementType> = {
    "crear": Plus, "create": Plus, "agregar": Plus, "add": Plus,
    "pago": DollarSign, "payment": DollarSign, "registrar": CreditCard,
    "buscar": Search, "search": Search, "consultar": Search,
    "cliente": Users, "client": Users, "listar": Users, "list": Users,
    "eliminar": Trash2, "delete": Trash2, "borrar": Trash2,
    "factura": FileText, "invoice": FileText,
    "servidor": Server, "vps": Server, "server": Server,
    "resumen": BarChart3, "summary": BarChart3, "reporte": BarChart3,
    "asignar": ArrowRight, "assign": ArrowRight,
    "confirmar": Check, "confirm": Check,
    "ver": Eye, "view": Eye,
    "descargar": Download, "download": Download,
    "configurar": Settings, "settings": Settings, "config": Settings,
    "calendario": Calendar, "calendar": Calendar,
    "correo": Mail, "email": Mail, "mail": Mail,
    "seguridad": Shield, "security": Shield,
    "base de datos": Database, "database": Database, "db": Database,
    "refrescar": RefreshCw, "refresh": RefreshCw, "actualizar": RefreshCw,
    "default": Zap,
};

function getActionIcon(text: string): React.ElementType {
    const lower = text.toLowerCase();
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (key !== "default" && lower.includes(key)) return icon;
    }
    return ICON_MAP["default"];
}

/* ─────────────────── Rich block parsers ──────────────────────── */

interface RichBlock {
    type: "text" | "action-buttons" | "confirm" | "summary-card" | "quick-actions" | "navigate" | "metrics-chart";
    content: string;
    items?: string[];
}

function parseRichBlocks(content: string): RichBlock[] {
    const blocks: RichBlock[] = [];
    const regex = /:::([\w][\w-]*)\n([\s\S]*?):::/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            const text = content.slice(lastIndex, match.index).trim();
            if (text) blocks.push({ type: "text", content: text });
        }

        const blockType = match[1];
        const blockContent = match[2].trim();

        if (blockType === "theme") {
            const themeMode = blockContent.toLowerCase();
            if (typeof document !== "undefined") {
                if (themeMode === "light" || themeMode === "claro") {
                    document.documentElement.classList.remove("dark");
                    document.documentElement.style.colorScheme = "light";
                } else {
                    document.documentElement.classList.add("dark");
                    document.documentElement.style.colorScheme = "dark";
                }
            }
            // Do not add theme block to visual blocks
        } else {
            const items = blockContent.split("\n").map(l => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
            blocks.push({ type: blockType as RichBlock["type"], content: blockContent, items });
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        const text = content.slice(lastIndex).trim();
        if (text) blocks.push({ type: "text", content: text });
    }

    return blocks.length > 0 ? blocks : [{ type: "text", content }];
}

/* ──────────────────────── Sub-components ─────────────────────── */

function NavigateBlock({ path }: { path: string }) {
    const router = useRouter();
    useEffect(() => {
        if (path && typeof window !== "undefined") {
            const cleanPath = path.replace(/:::[\s\S]*?:::/g, "").trim();
            if (cleanPath.startsWith("/")) {
                router.push(cleanPath);
            }
        }
    }, [path, router]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="my-2 p-3 bg-violet-600/20 border border-violet-500/30 rounded-xl text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-violet-400 mb-2" />
            <p className="text-sm font-medium text-violet-200">Navegando mágicamente a {path}...</p>
        </motion.div>
    );
}

function MetricsChartBlock({ content }: { content: string }) {
    const lines = content.trim().split("\n");
    if (lines.length < 2) return null;
    const headers = lines[0].split(",").map(s => s.trim());
    const data = lines.slice(1).map(line => {
        const parts = line.split(",").map(p => p.trim());
        const row: any = {};
        headers.forEach((h, i) => {
            const val = parts[i];
            row[h] = isNaN(Number(val)) ? val : Number(val);
        });
        return row;
    });

    const xKey = headers[0];
    const series = headers.slice(1);
    const colors = ["#8b5cf6", "#06b6d4", "#f59e0b", "#ec4899", "#10b981"];

    return (
        <div className="my-3 h-52 w-full bg-black/40 rounded-xl px-2 py-4 border border-violet-500/20 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey={xKey} stroke="#a78bfa" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#a78bfa" fontSize={10} tickLine={false} axisLine={false} width={36} />
                    <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.85)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '12px', backdropFilter: 'blur(8px)' }}
                        itemStyle={{ fontSize: '12px' }}
                        labelStyle={{ color: '#e2e8f0', fontWeight: 'bold', marginBottom: '4px' }}
                    />
                    {series.map((s, i) => (
                        <Line key={s} type="monotone" dataKey={s} stroke={colors[i % colors.length]} strokeWidth={3} dot={{ r: 4, fill: colors[i % colors.length], stroke: '#000', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

function ActionButtonsBlock({ items, onAction }: { items: string[]; onAction: (cmd: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2 my-2">
            {items.map((item, i) => {
                const Icon = getActionIcon(item);
                return (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.08 }}
                        onClick={() => onAction(item)}
                        className="action-btn-materialize inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
                                   bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-400/30
                                   hover:border-violet-400/60 transition-all hover:shadow-[0_0_16px_rgba(139,92,246,0.3)]"
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {item}
                    </motion.button>
                );
            })}
        </div>
    );
}

function ConfirmBlock({ content, onConfirm, onCancel }: { content: string; onConfirm: (pin?: string) => void; onCancel: () => void }) {
    const requiresPin = content.toLowerCase().includes("pin") || content.toLowerCase().includes("contraseña");
    const [pin, setPin] = useState("");

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30"
        >
            <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-100">{content}</p>
            </div>
            {requiresPin && (
                <div className="mb-4">
                    <input
                        type="password"
                        placeholder="Ingresa tu Maestro PIN..."
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-amber-500/30 rounded-lg text-amber-100 placeholder-amber-700/50 outline-none focus:border-amber-400/80 text-center tracking-widest font-mono"
                    />
                </div>
            )}
            <div className="flex gap-2">
                <button
                    onClick={() => onConfirm(requiresPin ? pin : undefined)}
                    disabled={requiresPin && pin.length < 4}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                               bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-400/40
                               hover:border-green-400/70 transition-all hover:shadow-[0_0_14px_rgba(34,197,94,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <CheckCircle2 className="w-4 h-4" /> Confirmar
                </button>
                <button
                    onClick={onCancel}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                               bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-400/30
                               hover:border-red-400/60 transition-all"
                >
                    <XCircle className="w-4 h-4" /> Cancelar
                </button>
            </div>
        </motion.div>
    );
}

function SummaryCardBlock({ items }: { items: string[] }) {
    return (
        <div className="grid grid-cols-2 gap-2 my-2">
            {items.map((item, i) => {
                const [label, ...rest] = item.split(":");
                const value = rest.join(":").trim();
                const Icon = getActionIcon(label);
                return (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="p-3 rounded-xl bg-white/5 border border-cyan-500/20"
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Icon className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-[10px] uppercase tracking-wider text-cyan-300/70 font-semibold">{label}</span>
                        </div>
                        <span className="text-sm font-bold text-cyan-50">{value || label}</span>
                    </motion.div>
                );
            })}
        </div>
    );
}

function QuickActionsBlock({ items, onAction }: { items: string[]; onAction: (cmd: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5 my-2">
            {items.map((item, i) => (
                <motion.button
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => onAction(item)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-medium
                               bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-400/25
                               hover:border-cyan-400/50 transition-all cursor-pointer"
                >
                    ⚡ {item}
                </motion.button>
            ))}
        </div>
    );
}

/* ──────────────────── Mascot SVG Inline ──────────────────────── */

function ConeMascot({ state, size = 56 }: { state: MascotState; size?: number }) {
    const stateClass =
        state === "thinking" ? "cone-pulse" :
            state === "success" ? "cone-success" :
                state === "error" ? "cone-shake" :
                    "cone-bounce";

    return (
        <div className={`relative ${stateClass}`} style={{ width: size, height: size }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img
                src="/renace-cone.png"
                alt="Asistente RNV"
                width={size}
                height={size}
                className="drop-shadow-[0_8px_16px_rgba(0,0,0,0.2)]"
                draggable={false}
                animate={
                    state === "barrel-roll" ? { rotate: [0, 360, 360], scale: [1, 1.2, 1] } :
                        state === "shivering" ? { x: [-3, 3, -3, 3, 0], y: [-2, 2, -1, 1, 0] } :
                            state === "celebrate" ? { y: [0, -20, 0], scale: [1, 1.1, 1] } :
                                {}
                }
                transition={
                    state === "barrel-roll" ? { duration: 1, ease: "easeInOut" } :
                        state === "shivering" ? { duration: 0.3, repeat: 3 } :
                            state === "celebrate" ? { duration: 0.5, repeat: 2 } :
                                {}
                }
            />
            {state === "thinking" && (
                <div className="absolute -top-1 -right-1 w-4 h-4">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500" />
                </div>
            )}
            {state === "success" && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                >
                    <Check className="w-3 h-3 text-white" />
                </motion.div>
            )}
        </div>
    );
}

/* ═══════════════════════ MAIN COMPONENT ═══════════════════════ */

export default function AIAssistant({ isWidget = false }: { isWidget?: boolean }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [mascotState, setMascotState] = useState<MascotState>("idle");
    const [showHistory, setShowHistory] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState<{ text: string; command: string } | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isToolbarMode, setIsToolbarMode] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);

    // Drag state — pointer-based for cross-platform reliability
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 });

    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const genId = () => Math.random().toString(36).substring(2, 10);

    // Initialize position to bottom-right
    useEffect(() => {
        if (isWidget) {
            // Widget mode is fixed relative to its own window
            setPos({ x: 20, y: 20 });
            // Let the widget open natively if we are a widget
            setIsOpen(true);
        } else {
            setPos({
                x: window.innerWidth - 80,
                y: window.innerHeight - 80,
            });
        }
    }, [isWidget]);

    // Auto-scroll floating messages
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
    }, [isOpen]);

    // External open event
    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener("rnv-ai-open", handleOpen);
        return () => window.removeEventListener("rnv-ai-open", handleOpen);
    }, []);

    // Hydrate from localStorage
    useEffect(() => {
        const saved = localStorage.getItem("rnv_ai_history");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const restored = parsed.map((m: any) => ({
                    ...m,
                    timestamp: new Date(m.timestamp)
                }));
                if (restored.length > 0) {
                    setMessages(restored);
                }
            } catch (e) {
                console.error("Failed to parse AI history", e);
            }
        }
        setIsHydrated(true);
    }, []);

    // Welcome message if no history
    useEffect(() => {
        if (isHydrated && messages.length === 0) {
            setMessages([{
                id: genId(),
                role: "assistant",
                content: "¡Hola! 🎉 Soy tu asistente **RNV**. Dime qué necesitas y lo materializo al instante.\n\n:::quick-actions\nVer clientes activos\nResumen financiero\nRegistrar un pago\nListar servidores VPS\nVer calendario\nConfigurar correo\n:::",
                timestamp: new Date()
            }]);
        }
    }, [isHydrated, messages.length]);

    // Save to localStorage when messages change
    useEffect(() => {
        if (isHydrated && messages.length > 0) {
            // Keep the last 15 messages so it doesn't get too heavy
            const toSave = messages.slice(-15);
            localStorage.setItem("rnv_ai_history", JSON.stringify(toSave));
        }
    }, [messages, isHydrated]);

    // Wipe memory
    const wipeMemory = useCallback(() => {
        localStorage.removeItem("rnv_ai_history");
        setMessages([{
            id: genId(),
            role: "assistant",
            content: "🧹 Memoria borrada. ¡Comencemos de nuevo!",
            timestamp: new Date()
        }]);
    }, []);

    // Toolbar mode detection: if dragged to top edge
    useEffect(() => {
        setIsToolbarMode(pos.y < 60);
    }, [pos.y]);

    /* ═══════════════ DRAG HANDLERS (pointer events) ═══════════════ */

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (isWidget) return; // Let Electron handle dragging natively via -webkit-app-region
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        dragOffset.current = {
            x: e.clientX - pos.x,
            y: e.clientY - pos.y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [pos, isWidget]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging) return;
        e.preventDefault();
        const newX = Math.max(0, Math.min(window.innerWidth - 64, e.clientX - dragOffset.current.x));
        const newY = Math.max(0, Math.min(window.innerHeight - 64, e.clientY - dragOffset.current.y));
        setPos({ x: newX, y: newY });
    }, [dragging]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        setDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        // Calculate distance moved to differentiate tap from drag
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If moved less than 10 pixels, consider it a tap/click
        if (distance < 10) {
            setIsOpen(prev => !prev);
        }
    }, []);

    /* ─────────────── Conversation handler ─────────────── */

    const sendMessage = useCallback(async (overrideMessage?: string) => {
        const text = overrideMessage || input.trim();
        if (!text || isLoading) return;

        const userMessage: Message = { id: genId(), role: "user", content: text, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        if (!overrideMessage) setInput("");
        setIsLoading(true);
        setMascotState("thinking");
        // Auto-open to show response
        if (!isOpen) setIsOpen(true);

        try {
            const conversationHistory = messages.filter((m, idx) => {
                if (idx === 0 && m.role === "assistant" && !m.executedFunctions) return false;
                return true;
            });

            const response = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    history: conversationHistory.map(m => ({ role: m.role, content: m.content })),
                    url: window.location.pathname
                })
            });

            const data = await response.json();

            if (data.success) {
                if (data.response.includes(":::animate\nbarrel-roll")) setMascotState("barrel-roll");
                else if (data.response.includes(":::animate\nshivering")) setMascotState("shivering");
                else if (data.response.includes(":::animate\ncelebrate")) setMascotState("celebrate");
                else setMascotState("success");

                setMessages(prev => [...prev, {
                    id: genId(),
                    role: "assistant",
                    content: data.response,
                    timestamp: new Date(),
                    executedFunctions: data.executedFunctions,
                }]);
            } else {
                throw new Error(data.error || "Error desconocido");
            }
        } catch (error: any) {
            console.error("AI Error:", error);
            setMascotState("error");
            setLastError(text); // Store for auto-fix retry
            let errorMsg = `❌ ${error.message}. Intenta de nuevo.`;
            if (error.message?.includes("429") || error.message?.includes("Quota")) {
                errorMsg = "⚠️ **Servicio saturado** — Espera un momento e inténtalo de nuevo.";
            }
            if (error.message?.includes("403") || error.message?.includes("GEMINI_API_KEY")) {
                errorMsg = "⚠️ **Asistente no configurado** — Configura GEMINI_API_KEY.";
            }
            errorMsg += "\n\n:::action-buttons\n🔄 Reintentar\n:::\n";
            setMessages(prev => [...prev, { id: genId(), role: "assistant", content: errorMsg, timestamp: new Date() }]);
        } finally {
            setIsLoading(false);
            setTimeout(() => setMascotState("idle"), 2500);
        }
    }, [input, isLoading, messages, isOpen]);

    // User message history for up/down recall
    const userMessages = useMemo(() => messages.filter(m => m.role === "user").map(m => m.content), [messages]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            setHistoryIndex(-1);
            sendMessage();
        }
        // Up arrow: recall previous user message
        if (e.key === "ArrowUp" && userMessages.length > 0) {
            e.preventDefault();
            const newIdx = Math.min(historyIndex + 1, userMessages.length - 1);
            setHistoryIndex(newIdx);
            setInput(userMessages[userMessages.length - 1 - newIdx]);
        }
        // Down arrow: recall more recent message
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const newIdx = Math.max(historyIndex - 1, -1);
            setHistoryIndex(newIdx);
            setInput(newIdx >= 0 ? userMessages[userMessages.length - 1 - newIdx] : "");
        }
    };

    const handleAction = useCallback((cmd: string) => {
        // Handle auto-fix retry
        if (cmd === "🔄 Reintentar" && lastError) {
            sendMessage(lastError);
            setLastError(null);
        } else {
            sendMessage(cmd);
        }
    }, [sendMessage, lastError]);

    // Contextual suggestions based on current URL
    const contextualSuggestions = useMemo(() => {
        if (typeof window === "undefined") return [];
        const path = window.location.pathname;
        if (path.includes("/clients")) return ["Resumen de este cliente", "Registrar pago", "Ver servicios"];
        if (path.includes("/vps")) return ["Estado de este VPS", "Listar servicios", "Ver gastos"];
        if (path.includes("/services")) return ["Detalle del servicio", "Asignar cliente", "Ver costos"];
        if (path.includes("/payments")) return ["Pagos pendientes", "Resumen financiero", "Exportar reporte"];
        if (path === "/") return ["Resumen general", "Clientes activos", "Estado servidores"];
        return ["¿Qué puedo hacer?", "Resumen financiero"];
    }, []);

    /* ────────────── Message partitioning ──────────────── */

    const lastExchange = useMemo(() => {
        if (messages.length <= 3) return messages;
        return messages.slice(-3);
    }, [messages]);

    const olderMessages = useMemo(() => {
        if (messages.length <= 3) return [];
        return messages.slice(0, -3);
    }, [messages]);

    /* ──────────────── Render message ──────────────────── */

    const renderMessage = (msg: Message) => {
        if (msg.role === "user") {
            return (
                <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: 10, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    className="flex justify-end mb-2"
                >
                    <div className="max-w-[85%] bg-gradient-to-br from-violet-500/80 to-fuchsia-600/70 text-white
                                    rounded-2xl rounded-br-sm px-3 py-2 text-sm shadow-lg">
                        {msg.content}
                    </div>
                </motion.div>
            );
        }

        const blocks = parseRichBlocks(msg.content);

        return (
            <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 200 }}
                className="mb-3 p-4 rounded-3xl rounded-bl-sm bg-black/60 backdrop-blur-2xl border border-violet-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] max-w-sm"
            >
                {blocks.map((block, bi) => {
                    switch (block.type) {
                        case "action-buttons":
                            return <ActionButtonsBlock key={bi} items={block.items || []} onAction={handleAction} />;
                        case "confirm":
                            return (
                                <ConfirmBlock
                                    key={bi}
                                    content={block.content}
                                    onConfirm={(pin) => {
                                        setPendingConfirm(null);
                                        const responseMsg = pin
                                            ? `Sí, confirmo: ${block.content}. El Maestro PIN ingresado es: ${pin}`
                                            : `Sí, confirmo: ${block.content}`;
                                        handleAction(responseMsg);
                                    }}
                                    onCancel={() => setPendingConfirm(null)}
                                />
                            );
                        case "summary-card":
                            return <SummaryCardBlock key={bi} items={block.items || []} />;
                        case "quick-actions":
                            return <QuickActionsBlock key={bi} items={block.items || []} onAction={handleAction} />;
                        case "navigate":
                            return <NavigateBlock key={bi} path={block.content} />;
                        case "metrics-chart":
                            return <MetricsChartBlock key={bi} content={block.content} />;
                        default:
                            return (
                                <div key={bi} className="prose prose-invert max-w-none prose-sm prose-p:leading-relaxed
                                    prose-pre:bg-black/60 prose-pre:text-cyan-100 prose-a:text-cyan-300
                                    prose-a:font-semibold hover:prose-a:no-underline
                                    prose-th:text-cyan-200 prose-th:bg-white/5 prose-td:border-cyan-500/10
                                    prose-table:border prose-table:border-cyan-500/20 prose-table:rounded-xl
                                    prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-th:text-left text-violet-50">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        urlTransform={(value: string) => value}
                                        components={{
                                            a: ({ ...props }) => {
                                                const href = props.href || "";
                                                if (href.startsWith("action:assign-service:")) {
                                                    const parts = href.split(":");
                                                    const serviceId = parts[2];
                                                    const clientName = decodeURIComponent(parts[3] || "");
                                                    const amount = parts[4] || "0";
                                                    return (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                handleAction(`Asigna el servicio con ID "${serviceId}" a "${clientName}" por el monto de ${amount}`);
                                                            }}
                                                            className="action-btn-materialize inline-flex items-center gap-2 bg-violet-500/15
                                                                       hover:bg-violet-500/25 text-violet-200 font-semibold py-2 px-4
                                                                       rounded-xl text-xs border border-violet-400/40
                                                                       shadow-[0_0_14px_rgba(139,92,246,0.35)]
                                                                       hover:shadow-[0_0_24px_rgba(139,92,246,0.6)] transition-all my-1"
                                                        >
                                                            <ArrowRight className="w-3 h-3" />
                                                            {props.children}
                                                        </button>
                                                    );
                                                }
                                                return <a {...props} target="_blank" rel="noopener noreferrer" />;
                                            },
                                            table: ({ children }) => (
                                                <div className="overflow-x-auto my-2 rounded-xl border border-cyan-500/20">
                                                    <table className="w-full text-sm">{children}</table>
                                                </div>
                                            ),
                                        }}
                                    >
                                        {block.content}
                                    </ReactMarkdown>
                                </div>
                            );
                    }
                })}

                {/* Function execution badges */}
                {msg.executedFunctions && msg.executedFunctions.some(fn => fn?.result?.success !== false) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {msg.executedFunctions
                            .filter((fn) => fn?.result?.success !== false)
                            .map((fn, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 text-[10px] bg-green-500/15 text-green-300
                                               px-2 py-0.5 rounded-full border border-green-400/25"
                                >
                                    <CheckCircle2 className="w-2.5 h-2.5" /> {fn.name}
                                </span>
                            ))}
                    </div>
                )}
            </motion.div>
        );
    };

    /* ════════════════ Compute bubble position ═════════════════ */

    const bubbleStyle = useMemo(() => {
        if (typeof window === "undefined") {
            return { position: "fixed" as const, display: "none" };
        }
        const isNearBottom = pos.y > window.innerHeight * 0.5;
        const isNearRight = pos.x > window.innerWidth * 0.5;
        return {
            position: "fixed" as const,
            // If mascot is near bottom, bubble appears above; otherwise below
            ...(isNearBottom
                ? { bottom: window.innerHeight - pos.y + 10 }
                : { top: pos.y + 68 }),
            // If mascot is near right edge, anchor to right; otherwise left
            ...(isNearRight
                ? { right: window.innerWidth - pos.x - 32 }
                : { left: pos.x - 10 }),
            zIndex: 59,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: isNearRight ? "flex-end" : "flex-start",
        };
    }, [pos]);

    /* ════════════════════ RENDER ════════════════════════ */

    return (
        <>
            {/* ─── Draggable Cone Mascot ─── */}
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={handlePointerUp}
                onClick={handleClick}
                style={{
                    position: "fixed",
                    left: pos.x,
                    top: pos.y,
                    zIndex: 61,
                    touchAction: "none",
                    userSelect: "none",
                    cursor: dragging ? "grabbing" : "grab",
                    ...(isWidget ? { WebkitAppRegion: "drag", cursor: "move" } : {})
                } as React.CSSProperties}
                className={`p-1 rounded-full
                           bg-gradient-to-br from-violet-600/80 to-purple-800/80
                           shadow-[0_0_30px_rgba(139,92,246,0.5)] border border-violet-400/30
                           backdrop-blur-sm transition-transform hover:shadow-[0_0_40px_rgba(139,92,246,0.7)]
                           ${dragging ? "scale-110" : ""}`}
                title="Arrastra para mover • Toca para abrir"
            >
                <ConeMascot state={mascotState} size={52} />
            </div>

            {/* ─── Floating Response Bubbles (materialize in the air) ─── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.85, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: 30 }}
                        transition={{ type: "spring", damping: 18, stiffness: 200 }}
                        style={bubbleStyle}
                        className="gap-2"
                    >
                        {/* Only show recent messages floating in the air instead of a chat history box */}
                        {lastExchange.slice(-2).map(renderMessage)}

                        {/* Thinking indicator floating */}
                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/50 backdrop-blur-xl text-cyan-300 text-xs border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] mb-2"
                            >
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Materializando...
                            </motion.div>
                        )}

                        {/* Contextual Suggestions */}
                        {messages.length <= 2 && contextualSuggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 w-[320px] mb-1">
                                {contextualSuggestions.map(s => (
                                    <button key={s} onClick={() => sendMessage(s)}
                                        className="px-3 py-1 text-[11px] rounded-full bg-violet-500/20 text-violet-300 hover:bg-violet-500/40 border border-violet-400/20 transition-all">
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Floating input pill + controls */}
                        <div className="flex gap-2 w-[320px] bg-black/60 backdrop-blur-2xl p-1.5 rounded-full border border-violet-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Escribe qué necesitas..."
                                disabled={isLoading}
                                className="flex-1 px-4 py-2 bg-transparent text-violet-100 rounded-full
                                           focus:outline-none placeholder:text-violet-300/60 text-sm font-medium"
                            />
                            <button
                                onClick={() => sendMessage()}
                                disabled={!input.trim() || isLoading}
                                className="bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white p-2.5
                                           rounded-full hover:from-violet-400 hover:to-fuchsia-500
                                           disabled:opacity-30 disabled:cursor-not-allowed transition-all
                                           shadow-[0_0_12px_rgba(139,92,246,0.4)]"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                        {/* Mini controls: Wipe Memory */}
                        <div className="flex items-center gap-2 mt-1">
                            <button onClick={wipeMemory} title="Borrar memoria"
                                className="p-1.5 rounded-full bg-gray-500/20 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all hover:scale-110 text-xs">
                                🧹
                            </button>
                            <span className="text-[10px] text-violet-400/50 ml-auto">↑↓ historial</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
