"use client";

import { useEffect } from "react";
import {
    CheckCircle2, XCircle, Users, DollarSign, Server, FileText,
    Search, Trash2, Plus, CreditCard, BarChart3, ArrowRight,
    AlertTriangle, Check, Zap, RefreshCw, Eye, Download,
    Settings, Calendar, Mail, Shield, Database, Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { RichBlock } from "./types";

const ICON_MAP: Record<string, React.ElementType> = {
    crear: Plus, create: Plus, agregar: Plus, add: Plus,
    pago: DollarSign, payment: DollarSign, registrar: CreditCard,
    buscar: Search, search: Search, consultar: Search,
    cliente: Users, client: Users, listar: Users, list: Users,
    eliminar: Trash2, delete: Trash2, borrar: Trash2,
    factura: FileText, invoice: FileText,
    servidor: Server, vps: Server, server: Server,
    resumen: BarChart3, summary: BarChart3, reporte: BarChart3,
    asignar: ArrowRight, assign: ArrowRight,
    confirmar: Check, confirm: Check,
    ver: Eye, view: Eye,
    descargar: Download, download: Download,
    configurar: Settings, settings: Settings, config: Settings,
    calendario: Calendar, calendar: Calendar,
    correo: Mail, email: Mail, mail: Mail,
    seguridad: Shield, security: Shield,
    "base de datos": Database, database: Database, db: Database,
    refrescar: RefreshCw, refresh: RefreshCw, actualizar: RefreshCw,
    default: Zap,
};

function getActionIcon(text: string): React.ElementType {
    const lower = text.toLowerCase();
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (key !== "default" && lower.includes(key)) return icon;
    }
    return ICON_MAP.default;
}

function NavigateBlock({ path }: { path: string }) {
    const router = useRouter();
    useEffect(() => {
        const cleanPath = path.replace(/:::[\s\S]*?:::/g, "").trim();
        if (cleanPath.startsWith("/")) router.push(cleanPath);
    }, [path, router]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="my-2 p-3 bg-violet-600/20 border border-violet-500/30 rounded-xl text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-violet-400 mb-2" />
            <p className="text-sm font-medium text-violet-200">Navegando a {path}...</p>
        </motion.div>
    );
}

function MetricsChartBlock({ content }: { content: string }) {
    const lines = content.trim().split("\n");
    if (lines.length < 2) return null;
    const headers = lines[0].split(",").map((s) => s.trim());
    const data = lines.slice(1).map((line) => {
        const parts = line.split(",").map((p) => p.trim());
        const row: Record<string, string | number> = {};
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
        <div className="my-3 h-52 w-full bg-black/40 rounded-xl px-2 py-4 border border-violet-500/20">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey={xKey} stroke="#a78bfa" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#a78bfa" fontSize={10} tickLine={false} axisLine={false} width={36} />
                    <Tooltip
                        contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(139,92,246,0.4)", borderRadius: "12px" }}
                        itemStyle={{ fontSize: "12px" }}
                        labelStyle={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "4px" }}
                    />
                    {series.map((s, i) => (
                        <Line key={s} type="monotone" dataKey={s} stroke={colors[i % colors.length]} strokeWidth={3}
                            dot={{ r: 4, fill: colors[i % colors.length], stroke: "#000", strokeWidth: 2 }}
                            activeDot={{ r: 6 }} />
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
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
                                   bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-400/30
                                   hover:border-violet-400/60 transition-all"
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {item}
                    </motion.button>
                );
            })}
        </div>
    );
}

function ConfirmBlock({ content, onConfirm, onCancel }: {
    content: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
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
            <div className="flex gap-2">
                <button
                    onClick={onConfirm}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                               bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-400/40"
                >
                    <CheckCircle2 className="w-4 h-4" /> Confirmar
                </button>
                <button
                    onClick={onCancel}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                               bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-400/30"
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

function MarkdownBlock({ content, onAction }: { content: string; onAction: (cmd: string) => void }) {
    return (
        <div className="prose prose-invert max-w-none prose-sm prose-p:leading-relaxed
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
                                        onAction(`Asigna el servicio con ID "${serviceId}" a "${clientName}" por el monto de ${amount}`);
                                    }}
                                    className="inline-flex items-center gap-2 bg-violet-500/15 hover:bg-violet-500/25
                                               text-violet-200 font-semibold py-2 px-4 rounded-xl text-xs
                                               border border-violet-400/40 transition-all my-1"
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
                {content}
            </ReactMarkdown>
        </div>
    );
}

export function MessageBlocks({
    blocks,
    executedFunctions,
    onAction,
}: {
    blocks: RichBlock[];
    executedFunctions?: { name: string; result?: { success?: boolean } }[];
    onAction: (cmd: string) => void;
}) {
    return (
        <>
            {blocks.map((block, bi) => {
                switch (block.type) {
                    case "action-buttons":
                        return <ActionButtonsBlock key={bi} items={block.items || []} onAction={onAction} />;
                    case "confirm":
                        return (
                            <ConfirmBlock
                                key={bi}
                                content={block.content}
                                onConfirm={() => onAction(`Sí, confirmo: ${block.content}`)}
                                onCancel={() => onAction("Cancelar")}
                            />
                        );
                    case "summary-card":
                        return <SummaryCardBlock key={bi} items={block.items || []} />;
                    case "quick-actions":
                        return <QuickActionsBlock key={bi} items={block.items || []} onAction={onAction} />;
                    case "navigate":
                        return <NavigateBlock key={bi} path={block.content} />;
                    case "metrics-chart":
                        return <MetricsChartBlock key={bi} content={block.content} />;
                    default:
                        return <MarkdownBlock key={bi} content={block.content} onAction={onAction} />;
                }
            })}

            {executedFunctions && executedFunctions.some((fn) => fn?.result?.success !== false) && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {executedFunctions
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
        </>
    );
}
