"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
    Network, RefreshCw, Users, Server, Database, DollarSign,
    ExternalLink, Sparkles, Maximize2, ZoomIn,
} from "lucide-react";
import {
    topology as topologyApi,
    type TopologyCluster,
    type TopologyNode,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { mapNodeTypes } from "@/components/map/nodes";
import { buildFlowGraph } from "@/components/map/layout";

type Detail =
    | { kind: "client"; id: string; label: string; meta: Record<string, unknown> }
    | { kind: "vps"; id: string; label: string; cluster?: TopologyCluster; meta: Record<string, unknown> }
    | { kind: "service"; id: string; label: string; meta: Record<string, unknown> }
    | null;

function isOnline(status?: string) {
    return ["running", "online", "active"].includes((status || "").toLowerCase());
}

export default function MapPage() {
    const [loading, setLoading] = useState(true);
    const [totals, setTotals] = useState({ clients: 0, vps: 0, services: 0, monthlyRevenue: 0 });
    const [clusters, setClusters] = useState<TopologyCluster[]>([]);
    const [topoNodes, setTopoNodes] = useState<TopologyNode[]>([]);
    const [detail, setDetail] = useState<Detail>(null);
    const { addToast } = useToast();

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await topologyApi.map();
            const tNodes = res.nodes || [];
            const tEdges = res.edges || [];
            const tClusters = res.clusters || [];
            setTopoNodes(tNodes);
            setClusters(tClusters);
            setTotals(res.totals || { clients: 0, vps: 0, services: 0, monthlyRevenue: 0 });
            const graph = buildFlowGraph(tNodes, tEdges, tClusters);
            setNodes(graph.nodes);
            setEdges(graph.edges);
            setDetail(null);
        } catch {
            addToast("Error al cargar mapa", "error");
        } finally {
            setLoading(false);
        }
    }, [addToast, setNodes, setEdges]);

    useEffect(() => {
        load();
    }, [load]);

    const onNodeClick: NodeMouseHandler = useCallback(
        (_evt, node) => {
            if (node.type === "client") {
                const raw = topoNodes.find((n) => n.id === node.id);
                setDetail({
                    kind: "client",
                    id: node.id,
                    label: String(node.data.label || ""),
                    meta: (raw?.meta as Record<string, unknown>) || {},
                });
            } else if (node.type === "vps") {
                const cluster = clusters.find((c) => c.vpsId === node.id);
                const raw = topoNodes.find((n) => n.id === node.id);
                setDetail({
                    kind: "vps",
                    id: node.id,
                    label: String(node.data.label || ""),
                    cluster,
                    meta: (raw?.meta as Record<string, unknown>) || {},
                });
            } else if (node.type === "service") {
                const raw = topoNodes.find((n) => n.id === node.id);
                setDetail({
                    kind: "service",
                    id: node.id,
                    label: String(node.data.label || ""),
                    meta: {
                        ...((raw?.meta as Record<string, unknown>) || {}),
                        status: raw?.status,
                        ...node.data,
                    },
                });
            }
        },
        [topoNodes, clusters]
    );

    const nodeTypes = useMemo(() => mapNodeTypes, []);

    return (
        <div className="h-full min-h-0 flex flex-col bg-[#07070c] text-white overflow-hidden">
            {/* Top chrome */}
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/5 bg-[#0c0c14]/90 backdrop-blur-xl">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-[0_0_24px_rgba(139,92,246,0.45)]">
                            <Network className="w-5 h-5 text-white" />
                        </div>
                        <Sparkles className="absolute -top-1 -right-1 w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2">
                            Infra Neural Map
                            <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-400/30">
                                AI · n8n style
                            </span>
                        </h1>
                        <p className="text-xs text-zinc-500 truncate">
                            Cliente → VPS → Servicios · arrastra · zoom · click en nodos
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <StatChip icon={<Users className="w-3.5 h-3.5 text-cyan-400" />} label="Clientes" value={totals.clients} />
                    <StatChip icon={<Server className="w-3.5 h-3.5 text-violet-400" />} label="VPS" value={totals.vps} />
                    <StatChip icon={<Database className="w-3.5 h-3.5 text-fuchsia-400" />} label="Svcs" value={totals.services} />
                    <StatChip
                        icon={<DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
                        label="/mes"
                        value={`$${totals.monthlyRevenue.toFixed(0)}`}
                        accent
                    />
                    <Button
                        size="sm"
                        onClick={load}
                        disabled={loading}
                        className="gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white border-0 shadow-[0_0_16px_rgba(139,92,246,0.35)]"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        Sync
                    </Button>
                </div>
            </div>

            {/* Canvas + panel */}
            <div className="relative flex-1 min-h-0 flex">
                <div className="relative flex-1 min-w-0">
                    {/* Ambient glow */}
                    <div className="pointer-events-none absolute inset-0 z-0">
                        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px]" />
                        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-cyan-500/8 rounded-full blur-[90px]" />
                        <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-fuchsia-500/8 rounded-full blur-[80px]" />
                    </div>

                    {loading && nodes.length === 0 ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#07070c]">
                            <div className="w-12 h-12 rounded-2xl border border-violet-500/40 bg-violet-500/10 flex items-center justify-center">
                                <RefreshCw className="w-6 h-6 text-violet-400 animate-spin" />
                            </div>
                            <p className="text-sm text-zinc-400">Construyendo grafo neural…</p>
                        </div>
                    ) : nodes.length === 0 ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
                            <Network className="w-10 h-10 text-zinc-600" />
                            <p className="text-zinc-400">Sin nodos. Restaura backup o escanea VPS en Servicios.</p>
                            <Link href="/services" className="text-sm text-violet-400 hover:underline">
                                Ir a Servicios →
                            </Link>
                        </div>
                    ) : (
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onNodeClick={onNodeClick}
                            nodeTypes={nodeTypes}
                            fitView
                            fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
                            minZoom={0.2}
                            maxZoom={1.8}
                            proOptions={{ hideAttribution: true }}
                            className="!bg-transparent"
                            defaultEdgeOptions={{ type: "smoothstep" }}
                        >
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={22}
                                size={1.2}
                                color="#2a2a3a"
                            />
                            <Controls
                                className="!bg-[#12121a] !border-white/10 !shadow-xl [&>button]:!bg-[#1a1a28] [&>button]:!border-white/10 [&>button]:!text-zinc-300 [&>button:hover]:!bg-violet-600/30"
                                showInteractive={false}
                            />
                            <MiniMap
                                className="!bg-[#0c0c14]/90 !border !border-white/10 !rounded-xl overflow-hidden"
                                nodeColor={(n) => {
                                    if (n.type === "client") return "#22d3ee";
                                    if (n.type === "vps") return "#a78bfa";
                                    return "#e879f9";
                                }}
                                maskColor="rgba(7,7,12,0.75)"
                                pannable
                                zoomable
                            />
                        </ReactFlow>
                    )}

                    {/* Floating hint */}
                    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 border border-white/10 text-[11px] text-zinc-400 backdrop-blur">
                        <ZoomIn className="w-3.5 h-3.5" />
                        Scroll = zoom · Arrastra nodos · Click = detalle
                        <Maximize2 className="w-3.5 h-3.5 ml-1" />
                    </div>

                    {/* Legend */}
                    <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md text-[11px]">
                        <LegendDot color="bg-cyan-400 shadow-[0_0_8px_#22d3ee]" label="Cliente" />
                        <LegendDot color="bg-violet-400 shadow-[0_0_8px_#a78bfa]" label="VPS" />
                        <LegendDot color="bg-fuchsia-400 shadow-[0_0_8px_#e879f9]" label="Servicio" />
                        <LegendDot color="bg-emerald-400 animate-pulse" label="En línea" />
                    </div>
                </div>

                {/* Side detail panel */}
                <aside
                    className={`relative z-20 w-full sm:w-[320px] shrink-0 border-l border-white/5 bg-[#0c0c14]/95 backdrop-blur-xl transition-transform ${
                        detail ? "translate-x-0" : "sm:translate-x-0"
                    } overflow-y-auto`}
                >
                    <div className="p-4 border-b border-white/5">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Inspector</p>
                        <p className="text-sm font-bold text-white mt-1">
                            {detail ? detail.label : "Selecciona un nodo"}
                        </p>
                    </div>
                    <div className="p-4 space-y-4 text-sm">
                        {!detail && (
                            <div className="rounded-xl border border-dashed border-white/10 p-4 text-zinc-500 text-xs leading-relaxed">
                                Haz click en un cliente, VPS o servicio del canvas para ver costos, estado y enlaces.
                                El asistente IA también lee este grafo con{" "}
                                <code className="text-violet-300">rnv_topology</code>.
                            </div>
                        )}

                        {detail?.kind === "client" && (
                            <>
                                <Tag color="cyan">CLIENTE</Tag>
                                <MetaRow label="Email" value={String(detail.meta.email || "—")} />
                                <MetaRow
                                    label="Cargo"
                                    value={`$${Number(detail.meta.chargeAmount || 0).toFixed(2)} / ${detail.meta.billingCycle === "annual" ? "año" : "mes"}`}
                                />
                                <MetaRow label="Vencimiento" value={String(detail.meta.dueDesc || "—")} />
                                <Link
                                    href={`/clients/${detail.id}`}
                                    className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 text-xs font-medium"
                                >
                                    Abrir cliente <ExternalLink size={12} />
                                </Link>
                            </>
                        )}

                        {detail?.kind === "vps" && (
                            <>
                                <Tag color="violet">VPS NODE</Tag>
                                <MetaRow label="IP" value={String(detail.meta.ip || detail.cluster?.ip || "—")} mono />
                                <MetaRow label="Estado" value={String(detail.meta.status || detail.cluster?.status || "—")} />
                                <MetaRow label="Servicios" value={String(detail.cluster?.serviceCount ?? detail.meta.serviceCount ?? "—")} />
                                <MetaRow
                                    label="Costo cluster"
                                    value={`$${Number(detail.cluster?.totalClusterCost ?? 0).toFixed(2)}/mes`}
                                />
                                {detail.cluster?.clientName && (
                                    <MetaRow label="Cliente dueño" value={detail.cluster.clientName} />
                                )}
                                {detail.cluster?.services && detail.cluster.services.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Servicios</p>
                                        <div className="max-h-48 overflow-y-auto space-y-1">
                                            {detail.cluster.services.map((s, i) => (
                                                <div
                                                    key={s.id || i}
                                                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/5"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span
                                                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                                isOnline(s.status) ? "bg-emerald-400" : "bg-zinc-600"
                                                            }`}
                                                        />
                                                        <span className="truncate text-xs text-zinc-200">{s.name}</span>
                                                    </div>
                                                    {(s.charge ?? 0) > 0 && (
                                                        <span className="text-[11px] text-violet-300 shrink-0">${s.charge}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {detail.id !== "unassigned" && (
                                    <Link
                                        href={`/vps/${detail.id}`}
                                        className="inline-flex items-center gap-1.5 text-violet-400 hover:text-violet-300 text-xs font-medium"
                                    >
                                        Gestionar VPS <ExternalLink size={12} />
                                    </Link>
                                )}
                            </>
                        )}

                        {detail?.kind === "service" && (
                            <>
                                <Tag color="fuchsia">SERVICIO</Tag>
                                <MetaRow label="Tipo" value={String(detail.meta.type || "—")} />
                                <MetaRow label="Estado" value={String(detail.meta.status || "—")} />
                                <MetaRow
                                    label="Cobro"
                                    value={
                                        Number(detail.meta.charge || 0) > 0
                                            ? `$${detail.meta.charge}/${detail.meta.chargeCycle === "annual" ? "año" : "mes"}`
                                            : "—"
                                    }
                                />
                                <MetaRow label="Cliente" value={String(detail.meta.clientName || "—")} />
                                {Boolean(detail.meta.url) && (
                                    <a
                                        href={String(detail.meta.url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-fuchsia-400 hover:text-fuchsia-300 text-xs font-medium break-all"
                                    >
                                        {String(detail.meta.url).replace(/^https?:\/\//, "")} <ExternalLink size={12} />
                                    </a>
                                )}
                                {detail.id && !detail.id.startsWith("overflow-") && (
                                    <Link
                                        href={`/services/${detail.id}`}
                                        className="inline-flex items-center gap-1.5 text-fuchsia-400 hover:text-fuchsia-300 text-xs font-medium"
                                    >
                                        Detalle servicio <ExternalLink size={12} />
                                    </Link>
                                )}
                            </>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function StatChip({
    icon,
    label,
    value,
    accent,
}: {
    icon: ReactNode;
    label: string;
    value: string | number;
    accent?: boolean;
}) {
    return (
        <div
            className={`hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                accent
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                    : "bg-white/[0.03] border-white/8 text-zinc-300"
            }`}
        >
            {icon}
            <span className="text-zinc-500">{label}</span>
            <span className="font-bold tabular-nums text-white">{value}</span>
        </div>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2 text-zinc-400">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {label}
        </div>
    );
}

function Tag({ children, color }: { children: ReactNode; color: "cyan" | "violet" | "fuchsia" }) {
    const map = {
        cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
        violet: "bg-violet-500/15 text-violet-300 border-violet-500/25",
        fuchsia: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25",
    };
    return (
        <span className={`inline-flex text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-md border ${map[color]}`}>
            {children}
        </span>
    );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-zinc-500 text-xs shrink-0">{label}</span>
            <span className={`text-zinc-200 text-xs text-right ${mono ? "font-mono" : ""}`}>{value}</span>
        </div>
    );
}
