"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Sparkles, Trash2, X, Minus, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ai } from "@/lib/api";
import type { Message, MascotState } from "./ai/types";
import { genId } from "./ai/types";
import { parseRichBlocks, detectMascotAnimation, stripRichBlocks } from "./ai/parse";
import { MessageBlocks } from "./ai/blocks";
import { ConeMascot } from "./ai/mascot";

const HISTORY_KEY = "rnv_ai_standalone_history";
const HISTORY_LIMIT = 15;
const HISTORY_TO_API = 8;

const WELCOME: Message = {
    id: "welcome",
    role: "assistant",
    content:
        "¡Hola! Soy tu asistente **RNV** flotante con **control total** de tu infraestructura: clientes, VPS, servicios, facturación y tareas.\n\n:::quick-actions\n¿Qué servidores tienen alertas?\n¿Qué tengo pendiente hoy?\nClientes morosos\nEscanear VPS\n:::",
    timestamp: new Date(),
};

const SUGGESTIONS = [
    "¿Qué servidores tienen alertas?",
    "¿Qué tengo pendiente hoy?",
    "Clientes morosos",
    "Escanear VPS",
    "Estado de servicios",
];

export default function FloatingChatWidget() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [mascotState, setMascotState] = useState<MascotState>("idle");
    const [isHydrated, setIsHydrated] = useState(false);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    // Cargar historial persistente
    useEffect(() => {
        try {
            const saved = localStorage.getItem(HISTORY_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as Message[];
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setMessages(parsed);
                }
            }
        } catch {
            /* ignore */
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

    // Auto-scroll al fondo
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }
    }, [messages, isLoading]);

    // Focus permanente en input al abrir
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Esc para ocultar ventana
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                window.close();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const wipeMemory = useCallback(() => {
        localStorage.removeItem(HISTORY_KEY);
        setMessages([{
            id: genId(),
            role: "assistant",
            content: "🧹 Memoria borrada. ¿En qué te ayudo ahora?",
            timestamp: new Date(),
        }]);
    }, []);

    const handleClose = () => {
        window.close();
    };

    const sendMessage = useCallback(async (overrideMessage?: string) => {
        const text = overrideMessage || input.trim();
        if (!text || isLoading) return;

        const userMsg: Message = { id: genId(), role: "user", content: text, timestamp: new Date() };
        setMessages((prev) => [...prev, userMsg]);
        if (!overrideMessage) setInput("");
        setIsLoading(true);
        setMascotState("thinking");

        try {
            const history = messagesRef.current
                .filter((m, idx) => !(idx === 0 && m.role === "assistant" && !m.executedFunctions))
                .slice(-HISTORY_TO_API)
                .map((m) => ({
                    role: m.role,
                    content: stripRichBlocks(m.content).slice(0, 500),
                }))
                .filter((m) => m.content.length > 0);

            const data = await ai.chat(text, history, "/");
            const anim = detectMascotAnimation(data.response);
            setMascotState(anim || "success");

            setMessages((prev) => [
                ...prev,
                {
                    id: genId(),
                    role: "assistant",
                    content: data.response,
                    timestamp: new Date(),
                    executedFunctions: data.executedFunctions,
                },
            ]);
        } catch (error: unknown) {
            setMascotState("error");
            const msg = error instanceof Error ? error.message : "Error de conexión";
            setMessages((prev) => [
                ...prev,
                {
                    id: genId(),
                    role: "assistant",
                    content: `❌ ${msg}. Intenta de nuevo.`,
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setIsLoading(false);
            setHistoryIndex(-1);
            setTimeout(() => {
                setMascotState("idle");
                inputRef.current?.focus();
            }, 300);
        }
    }, [input, isLoading]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const userHistory = messages.filter((m) => m.role === "user").map((m) => m.content);
            if (userHistory.length === 0) return;
            const nextIdx = historyIndex + 1;
            if (nextIdx < userHistory.length) {
                setHistoryIndex(nextIdx);
                setInput(userHistory[userHistory.length - 1 - nextIdx]);
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            const userHistory = messages.filter((m) => m.role === "user").map((m) => m.content);
            const nextIdx = historyIndex - 1;
            if (nextIdx >= 0) {
                setHistoryIndex(nextIdx);
                setInput(userHistory[userHistory.length - 1 - nextIdx]);
            } else {
                setHistoryIndex(-1);
                setInput("");
            }
        }
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-[#0d0f17]/95 backdrop-blur-3xl text-gray-100 select-none overflow-hidden border border-white/10 rounded-2xl shadow-2xl">
            {/* Header / Barra de Arrastre macOS */}
            <div
                data-tauri-drag-region
                className="flex items-center justify-between px-4 py-3 bg-neutral-900/60 border-b border-white/5 cursor-grab active:cursor-grabbing select-none"
            >
                {/* Traffic dots */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleClose}
                        title="Cerrar / Ocultar (Esc)"
                        className="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-600 transition-colors flex items-center justify-center group"
                    >
                        <X size={8} className="text-rose-950 opacity-0 group-hover:opacity-100" />
                    </button>
                    <button
                        type="button"
                        onClick={handleClose}
                        title="Minimizar"
                        className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-600 transition-colors flex items-center justify-center group"
                    >
                        <Minus size={8} className="text-amber-950 opacity-0 group-hover:opacity-100" />
                    </button>
                </div>

                {/* Título y estado */}
                <div data-tauri-drag-region className="flex items-center gap-2">
                    <ConeMascot state={mascotState} size={24} />
                    <span className="font-semibold text-xs tracking-wide text-white">RNV Assistant</span>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Online
                    </span>
                </div>

                {/* Botones de acción del header */}
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={wipeMemory}
                        title="Borrar memoria del chat"
                        className="p-1 rounded-lg text-gray-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-xs"
                    >
                        <Trash2 size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={handleClose}
                        title="Ocultar ventana"
                        className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xs"
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>

            {/* Mensajes */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        {msg.role === "user" ? (
                            <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs leading-relaxed shadow-lg shadow-violet-600/20">
                                {msg.content}
                            </div>
                        ) : (
                            <div className="max-w-[95%] p-3 rounded-2xl rounded-bl-sm bg-white/5 border border-white/10 text-gray-200 text-xs shadow-md">
                                <MessageBlocks
                                    blocks={parseRichBlocks(msg.content)}
                                    executedFunctions={msg.executedFunctions}
                                    onAction={(actionText) => sendMessage(actionText)}
                                />
                            </div>
                        )}
                    </motion.div>
                ))}

                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-600/20 text-violet-300 text-xs w-fit border border-violet-500/30"
                    >
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                        <span>Ejecutando acción...</span>
                    </motion.div>
                )}
            </div>

            {/* Chips de sugerencias rápidas */}
            {messages.length <= 2 && (
                <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => sendMessage(s)}
                            className="px-2.5 py-1 text-[11px] rounded-lg bg-white/5 hover:bg-violet-600/20 text-gray-300 hover:text-violet-200 border border-white/10 hover:border-violet-500/30 transition-all cursor-pointer"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {/* Input Footer */}
            <div className="p-3 bg-neutral-900/80 border-t border-white/5">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        sendMessage();
                    }}
                    className="flex items-center gap-2 bg-white/5 border border-white/10 focus-within:border-violet-500/50 rounded-xl px-3 py-1.5 transition-all shadow-inner"
                >
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Escribe una orden o pregunta..."
                        disabled={isLoading}
                        className="flex-1 bg-transparent text-xs text-white placeholder:text-gray-500 focus:outline-none"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="p-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white shadow-md transition-all cursor-pointer"
                    >
                        {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    </button>
                </form>
                <div className="flex items-center justify-between px-1 pt-1.5 text-[10px] text-gray-500">
                    <span>↵ Enter para enviar</span>
                    <span>Esc para ocultar</span>
                </div>
            </div>
        </div>
    );
}
