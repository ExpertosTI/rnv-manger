"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ai } from "@/lib/api";
import type { Message, MascotState } from "./ai/types";
import { genId } from "./ai/types";
import { parseRichBlocks, detectMascotAnimation, suggestionsForPath, stripRichBlocks } from "./ai/parse";
import { MessageBlocks } from "./ai/blocks";
import { ConeMascot } from "./ai/mascot";

const HISTORY_KEY = "rnv_ai_history";
const HISTORY_LIMIT = 12;
const HISTORY_TO_API = 8;

const WELCOME: Message = {
    id: "welcome",
    role: "assistant",
    content:
        "¡Hola! Soy tu asistente **RNV**. Puedo gestionar clientes, VPS, servicios, pagos y Odoo.\n\n:::quick-actions\nResumen general\nClientes morosos\nRegistrar un pago\nListar servidores VPS\nBuscar en Odoo\n:::",
    timestamp: new Date(),
};

export default function AIAssistant({ isWidget = false }: { isWidget?: boolean }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [mascotState, setMascotState] = useState<MascotState>("idle");
    const [isHydrated, setIsHydrated] = useState(false);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [lastError, setLastError] = useState<string | null>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);

    const dragOffset = useRef({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 });
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    useEffect(() => {
        if (isWidget) {
            setPos({ x: 20, y: 20 });
            setIsOpen(true);
        } else {
            setPos({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
        }
    }, [isWidget]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
    }, [isOpen]);

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener("rnv-ai-open", handleOpen);
        return () => window.removeEventListener("rnv-ai-open", handleOpen);
    }, []);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(HISTORY_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as Message[];
                const restored = parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
                if (restored.length > 0) setMessages(restored);
            }
        } catch {
            /* ignore corrupt history */
        }
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (isHydrated && messages.length === 0) {
            setMessages([{ ...WELCOME, id: genId(), timestamp: new Date() }]);
        }
    }, [isHydrated, messages.length]);

    useEffect(() => {
        if (isHydrated && messages.length > 0) {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_LIMIT)));
        }
    }, [messages, isHydrated]);

    const wipeMemory = useCallback(() => {
        localStorage.removeItem(HISTORY_KEY);
        setMessages([{
            id: genId(),
            role: "assistant",
            content: "Memoria borrada. ¿En qué te ayudo?",
            timestamp: new Date(),
        }]);
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (isWidget) return;
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [pos, isWidget]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging) return;
        e.preventDefault();
        setPos({
            x: Math.max(0, Math.min(window.innerWidth - 64, e.clientX - dragOffset.current.x)),
            y: Math.max(0, Math.min(window.innerHeight - 64, e.clientY - dragOffset.current.y)),
        });
    }, [dragging]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        setDragging(false);
        try {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { /* already released */ }
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 10) setIsOpen((prev) => !prev);
    }, []);

    const sendMessage = useCallback(async (overrideMessage?: string) => {
        const text = overrideMessage || input.trim();
        if (!text || isLoading) return;

        const userMessage: Message = { id: genId(), role: "user", content: text, timestamp: new Date() };
        setMessages((prev) => [...prev, userMessage]);
        if (!overrideMessage) setInput("");
        setIsLoading(true);
        setMascotState("thinking");
        if (!isOpen) setIsOpen(true);

        try {
            const history = messagesRef.current
                .filter((m, idx) => !(idx === 0 && m.role === "assistant" && !m.executedFunctions))
                .slice(-HISTORY_TO_API)
                .map((m) => ({
                    role: m.role,
                    content: stripRichBlocks(m.content).slice(0, 500),
                }))
                .filter((m) => m.content.length > 0);

            const data = await ai.chat(text, history, window.location.pathname);

            const anim = detectMascotAnimation(data.response);
            setMascotState(anim || "success");

            setMessages((prev) => [...prev, {
                id: genId(),
                role: "assistant",
                content: data.response,
                timestamp: new Date(),
                executedFunctions: data.executedFunctions,
            }]);
        } catch (error: unknown) {
            setMascotState("error");
            setLastError(text);
            const msg = error instanceof Error ? error.message : "Error desconocido";
            let errorMsg = `❌ ${msg}. Intenta de nuevo.`;
            if (msg.includes("429") || msg.includes("Quota")) {
                errorMsg = "⚠️ **Servicio saturado** — Espera un momento e inténtalo de nuevo.";
            }
            if (msg.includes("403") || msg.includes("GEMINI_API_KEY")) {
                errorMsg = "⚠️ **Asistente no configurado** — Configura `GEMINI_API_KEY` en el servidor.";
            }
            errorMsg += "\n\n:::action-buttons\n🔄 Reintentar\n:::";
            setMessages((prev) => [...prev, { id: genId(), role: "assistant", content: errorMsg, timestamp: new Date() }]);
        } finally {
            setIsLoading(false);
            setTimeout(() => setMascotState("idle"), 2500);
        }
    }, [input, isLoading, isOpen]);

    const userMessages = useMemo(
        () => messages.filter((m) => m.role === "user").map((m) => m.content),
        [messages]
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            setHistoryIndex(-1);
            sendMessage();
        }
        if (e.key === "ArrowUp" && userMessages.length > 0) {
            e.preventDefault();
            const newIdx = Math.min(historyIndex + 1, userMessages.length - 1);
            setHistoryIndex(newIdx);
            setInput(userMessages[userMessages.length - 1 - newIdx]);
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const newIdx = Math.max(historyIndex - 1, -1);
            setHistoryIndex(newIdx);
            setInput(newIdx >= 0 ? userMessages[userMessages.length - 1 - newIdx] : "");
        }
    };

    const handleAction = useCallback((cmd: string) => {
        if (cmd === "🔄 Reintentar" && lastError) {
            sendMessage(lastError);
            setLastError(null);
        } else if (cmd !== "Cancelar") {
            sendMessage(cmd);
        }
    }, [sendMessage, lastError]);

    const contextualSuggestions = useMemo(() => {
        if (typeof window === "undefined") return [];
        return suggestionsForPath(window.location.pathname);
    }, [isOpen]);

    const lastExchange = useMemo(() => {
        if (messages.length <= 3) return messages;
        return messages.slice(-3);
    }, [messages]);

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

        return (
            <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 200 }}
                className="mb-3 p-4 rounded-3xl rounded-bl-sm bg-black/60 backdrop-blur-2xl border border-violet-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] max-w-sm"
            >
                <MessageBlocks
                    blocks={parseRichBlocks(msg.content)}
                    executedFunctions={msg.executedFunctions}
                    onAction={handleAction}
                />
            </motion.div>
        );
    };

    const bubbleStyle = useMemo(() => {
        if (typeof window === "undefined") {
            return { position: "fixed" as const, display: "none" };
        }
        const isNearBottom = pos.y > window.innerHeight * 0.5;
        const isNearRight = pos.x > window.innerWidth * 0.5;
        return {
            position: "fixed" as const,
            ...(isNearBottom
                ? { bottom: window.innerHeight - pos.y + 10 }
                : { top: pos.y + 68 }),
            ...(isNearRight
                ? { right: window.innerWidth - pos.x - 32 }
                : { left: pos.x - 10 }),
            zIndex: 59,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: isNearRight ? ("flex-end" as const) : ("flex-start" as const),
        };
    }, [pos]);

    return (
        <>
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
                    ...(isWidget ? { WebkitAppRegion: "drag", cursor: "move" } : {}),
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
                        <div ref={scrollRef} className="max-h-[50vh] overflow-y-auto">
                            {lastExchange.slice(-2).map(renderMessage)}
                        </div>

                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/50 backdrop-blur-xl text-cyan-300 text-xs border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] mb-2"
                            >
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Pensando...
                            </motion.div>
                        )}

                        {messages.length <= 2 && contextualSuggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 w-[320px] mb-1">
                                {contextualSuggestions.map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => sendMessage(s)}
                                        className="px-3 py-1 text-[11px] rounded-full bg-violet-500/20 text-violet-300 hover:bg-violet-500/40 border border-violet-400/20 transition-all"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2 w-[320px] bg-black/60 backdrop-blur-2xl p-1.5 rounded-full border border-violet-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Pregunta o da una orden..."
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
                        <div className="flex items-center gap-2 mt-1">
                            <button
                                onClick={wipeMemory}
                                title="Borrar memoria"
                                className="p-1.5 rounded-full bg-gray-500/20 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all hover:scale-110 text-xs"
                            >
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
