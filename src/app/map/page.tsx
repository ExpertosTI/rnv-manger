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
import "@/components/map/map.css";
import {
    Network, RefreshCw, Users, Server, Database, DollarSign,
    ExternalLink, Sparkles, Maximize2, ZoomIn, Radio, Cpu, ListTodo,
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
import { ServiceTaskPanel, type ServiceTaskTarget } from "@/components/ServiceTaskPanel";

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
    const [taskTarget, setTaskTarget] = useState<ServiceTaskTarget | null>(null);
    const [taskOpen, setTaskOpen] = useState(false);
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
                const meta = {
                    ...((raw?.meta as Record<string, unknown>) || {}),
                    status: raw?.status,
                    ...node.data,
                };
                setDetail({
                    kind: "service",
                    id: node.id,
                    label: String(node.data.label || ""),
                    meta,
                });
                if (node.id && !node.id.startsWith("overflow-")) {
                    setTaskTarget({
                        serviceId: node.id,
                        serviceName: String(node.data.label || raw?.label || "Servicio"),
                        clientId: meta.clientId as string | undefined,
                        clientName: meta.clientName as string | undefined,
                        url: meta.url as string | undefined,
                    });
                    setTaskOpen(true);
                }
            }
        },
        [topoNodes, clusters]
    );

    const nodeTypes = useMemo(() => mapNodeTypes, []);
    const liveEdges = edges.filter((e) => e.animated).length;

    return (
        <div className="neural-map h-full min-h-0 flex flex-col overflow-hidden text-white bg-[#05060b]">
            {/* Top chrome */}
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#080a12]/80 backdrop-blur-2xl">
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />
                <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative shrink-0">
                        <div className="absolute inset-0 rounded-2xl bg-violet-500/40 blur-lg animate-pulse" />
                        <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#9b7bff] via-[#ff5ec8] to-[#2ee6d6] shadow-[0_0_28px_rgba(155,123,255,0.55)]">
                            <Network className="h-5 w-5 text-white" />
                        </div>
                        <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-cyan-200 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-semibold tracking-tight nm-shimmer-text sm:text-xl">
                            Neural Topology
                        </h1>
                        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                                <Radio className="h-3 w-3" />
                                {liveEdges} live links
                            </span>
                            <span className="hidden sm:inline truncate">Cliente → VPS → Servicios · canvas vivo</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <StatChip icon={<Users className="w-3.5 h-3.5 text-cyan-300" />} label="Clients" value={totals.clients} tone="cyan" />
                    <StatChip icon={<Server className="w-3.5 h-3.5 text-violet-300" />} label="VPS" value={totals.vps} tone="violet" />
                    <StatChip icon={<Database className="w-3.5 h-3.5 text-fuchsia-300" />} label="Svcs" value={totals.services} tone="fuchsia" />
                    <StatChip
                        icon={<DollarSign className="w-3.5 h-3.5 text-emerald-300" />}
                        label="MRR"
                        value={`$${totals.monthlyRevenue.toFixed(0)}`}
                        tone="lime"
                    />
                    <Link href="/workflow">
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 rounded-xl border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
                        >
                            <ListTodo size={14} />
                            Mi Flujo
                        </Button>
                    </Link>
                    <Button
                        size="sm"
                        onClick={load}
                        disabled={loading}
                        className="gap-1.5 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_0_20px_rgba(155,123,255,0.4)] hover:from-violet-500 hover:to-fuchsia-500"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        Sync
                    </Button>
                </div>
            </div>

            <div className="relative flex-1 min-h-0 flex">
                <div className="relative flex-1 min-w-0 overflow-hidden">
                    {/* Living atmosphere */}
                    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(155,123,255,0.18),transparent_50%),radial-gradient(ellipse_at_80%_30%,rgba(46,230,214,0.12),transparent_45%),radial-gradient(ellipse_at_60%_80%,rgba(255,94,200,0.12),transparent_50%)]" />
                        <div className="nm-noise absolute inset-0 opacity-40 mix-blend-soft-light" />
                        <div className="nm-drift absolute left-[12%] top-[18%] h-72 w-72 rounded-full bg-violet-600/20 blur-[90px]" />
                        <div className="nm-drift absolute right-[18%] bottom-[12%] h-64 w-64 rounded-full bg-cyan-500/15 blur-[80px]" style={{ animationDelay: "-6s" }} />
                        <div className="nm-drift absolute left-[40%] top-[55%] h-52 w-52 rounded-full bg-fuchsia-500/15 blur-[70px]" style={{ animationDelay: "-11s" }} />
                        {/* subtle grid overlay */}
                        <div
                            className="absolute inset-0 opacity-[0.07]"
                            style={{
                                backgroundImage:
                                    "linear-gradient(rgba(155,123,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(46,230,214,0.35) 1px, transparent 1px)",
                                backgroundSize: "64px 64px",
                            }}
                        />
                    </div>

                    {loading && nodes.length === 0 ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#05060b]">
                            <div className="relative">
                                <div className="absolute inset-0 rounded-3xl bg-violet-500/30 blur-xl animate-pulse" />
                                <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl border border-violet-400/40 bg-violet-500/10">
                                    <Cpu className="h-7 w-7 text-violet-300 animate-pulse" />
                                </div>
                            </div>
                            <p className="nm-shimmer-text text-sm font-medium">Synthesizing neural graph…</p>
                        </div>
                    ) : nodes.length === 0 ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
                            <Network className="h-10 w-10 text-zinc-600" />
                            <p className="text-zinc-400">Sin nodos. Restaura backup o escanea VPS.</p>
                            <Link href="/services" className="text-sm text-violet-300 hover:underline">
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
                            fitViewOptions={{ padding: 0.18, maxZoom: 1.05 }}
                            minZoom={0.15}
                            maxZoom={1.9}
                            proOptions={{ hideAttribution: true }}
                            className="!bg-transparent"
                            defaultEdgeOptions={{ type: "smoothstep" }}
                        >
                            <Background
                                id="dots"
                                variant={BackgroundVariant.Dots}
                                gap={28}
                                size={1.4}
                                color="rgba(155,123,255,0.22)"
                            />
                            <Background
                                id="cross"
                                variant={BackgroundVariant.Lines}
                                gap={112}
                                size={1}
                                color="rgba(46,230,214,0.05)"
                            />
                            <Controls
                                className="!m-4 !overflow-hidden !rounded-2xl !border !border-white/10 !bg-[#0c101c]/90 !shadow-[0_12px_40px_rgba(0,0,0,0.5)] [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!text-zinc-300 [&>button:hover]:!bg-violet-500/20"
                                showInteractive={false}
                            />
                            <MiniMap
                                className="!m-4 !overflow-hidden !rounded-2xl !border !border-white/10 !bg-[#080a12]/95"
                                nodeColor={(n) => {
                                    if (n.type === "client") return "#2ee6d6";
                                    if (n.type === "vps") return "#9b7bff";
                                    return "#ff5ec8";
                                }}
                                maskColor="rgba(5,6,11,0.78)"
                                pannable
                                zoomable
                            />
                        </ReactFlow>
                    )}

                    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3.5 py-1.5 text-[11px] text-zinc-400 backdrop-blur-xl">
                        <ZoomIn className="h-3.5 w-3.5 text-violet-300" />
                        Scroll zoom · drag nodes · click inspect
                        <Maximize2 className="ml-1 h-3.5 w-3.5 text-cyan-300" />
                    </div>

                    <div className="absolute left-4 top-4 z-10 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-[11px] backdrop-blur-xl">
                        <LegendDot color="bg-[#2ee6d6] shadow-[0_0_10px_#2ee6d6]" label="Cliente" />
                        <LegendDot color="bg-[#9b7bff] shadow-[0_0_10px_#9b7bff]" label="VPS" />
                        <LegendDot color="bg-[#ff5ec8] shadow-[0_0_10px_#ff5ec8]" label="Servicio" />
                        <LegendDot color="bg-[#7dffb3] animate-pulse" label="Live signal" />
                    </div>
                </div>

                {/* Inspector */}
                <aside className="relative z-20 w-full sm:w-[340px] shrink-0 overflow-y-auto border-l border-white/[0.06] bg-[#080a12]/90 backdrop-blur-2xl">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-violet-500/40 via-fuchsia-400/30 to-transparent" />
                    <div className="p-4 border-b border-white/[0.06]">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                                Node Inspector
                            </p>
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[9px] text-violet-300">
                                <Sparkles className="h-3 w-3" /> AI ready
                            </span>
                        </div>
                        <p className="mt-1.5 text-base font-semibold tracking-tight text-white">
                            {detail ? detail.label : "Selecciona un nodo"}
                        </p>
                    </div>
                    <div className="space-y-4 p-4 text-sm">
                        {!detail && (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-zinc-500">
                                Explora el canvas: bordes animados = señal en vivo. El asistente lee este grafo con{" "}
                                <code className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-300">rnv_topology</code>.
                            </div>
                        )}

                        {detail?.kind === "client" && (
                            <>
                                <Tag color="cyan">CLIENT NODE</Tag>
                                <MetaRow label="Email" value={String(detail.meta.email || "—")} />
                                <MetaRow
                                    label="Cargo"
                                    value={`$${Number(detail.meta.chargeAmount || 0).toFixed(2)} / ${detail.meta.billingCycle === "annual" ? "año" : "mes"}`}
                                />
                                <MetaRow label="Vencimiento" value={String(detail.meta.dueDesc || "—")} />
                                <Link
                                    href={`/clients/${detail.id}`}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200"
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
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                            Servicios vivos
                                        </p>
                                        <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                                            {detail.cluster.services.map((s, i) => (
                                                <div
                                                    key={s.id || i}
                                                    className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-2.5 py-2"
                                                >
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span
                                                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                                                isOnline(s.status)
                                                                    ? "bg-emerald-300 shadow-[0_0_8px_#7dffb3]"
                                                                    : "bg-zinc-600"
                                                            }`}
                                                        />
                                                        <span className="truncate text-xs text-zinc-200">{s.name}</span>
                                                    </div>
                                                    {(s.charge ?? 0) > 0 && (
                                                        <span className="shrink-0 font-mono text-[11px] text-violet-300">
                                                            ${s.charge}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {detail.id !== "unassigned" && (
                                    <Link
                                        href={`/vps/${detail.id}`}
                                        className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 hover:text-violet-200"
                                    >
                                        Gestionar VPS <ExternalLink size={12} />
                                    </Link>
                                )}
                            </>
                        )}

                        {detail?.kind === "service" && (
                            <>
                                <Tag color="fuchsia">SERVICE NODE</Tag>
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
                                        className="inline-flex items-center gap-1.5 break-all text-xs font-medium text-fuchsia-300 hover:text-fuchsia-200"
                                    >
                                        {String(detail.meta.url).replace(/^https?:\/\//, "")} <ExternalLink size={12} />
                                    </a>
                                )}
                                {detail.id && !detail.id.startsWith("overflow-") && (
                                    <>
                                        <Button
                                            size="sm"
                                            className="w-full gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 border-0 text-white shadow-[0_0_20px_rgba(155,123,255,0.35)]"
                                            onClick={() => {
                                                setTaskTarget({
                                                    serviceId: detail.id,
                                                    serviceName: detail.label,
                                                    clientId: detail.meta.clientId as string | undefined,
                                                    clientName: detail.meta.clientName as string | undefined,
                                                    url: detail.meta.url as string | undefined,
                                                });
                                                setTaskOpen(true);
                                            }}
                                        >
                                            <ListTodo className="h-4 w-4" />
                                            Asignar tarea de trabajo
                                        </Button>
                                        <Link
                                            href={`/services/${detail.id}`}
                                            className="inline-flex items-center gap-1.5 text-xs font-medium text-fuchsia-300 hover:text-fuchsia-200"
                                        >
                                            Detalle servicio <ExternalLink size={12} />
                                        </Link>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </aside>
            </div>

            <ServiceTaskPanel
                target={taskTarget}
                open={taskOpen}
                onOpenChange={setTaskOpen}
                dark
            />
        </div>
    );
}

function StatChip({
    icon,
    label,
    value,
    tone,
}: {
    icon: ReactNode;
    label: string;
    value: string | number;
    tone: "cyan" | "violet" | "fuchsia" | "lime";
}) {
    const tones = {
        cyan: "border-cyan-400/20 bg-cyan-400/5",
        violet: "border-violet-400/20 bg-violet-400/5",
        fuchsia: "border-fuchsia-400/20 bg-fuchsia-400/5",
        lime: "border-emerald-400/25 bg-emerald-400/10",
    };
    return (
        <div className={`hidden md:flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${tones[tone]}`}>
            {icon}
            <span className="text-zinc-500">{label}</span>
            <span className="font-bold tabular-nums text-white">{value}</span>
        </div>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2 text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${color}`} />
            {label}
        </div>
    );
}

function Tag({ children, color }: { children: ReactNode; color: "cyan" | "violet" | "fuchsia" }) {
    const map = {
        cyan: "bg-cyan-500/15 text-cyan-200 border-cyan-400/30 shadow-[0_0_16px_rgba(46,230,214,0.15)]",
        violet: "bg-violet-500/15 text-violet-200 border-violet-400/30 shadow-[0_0_16px_rgba(155,123,255,0.15)]",
        fuchsia: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30 shadow-[0_0_16px_rgba(255,94,200,0.15)]",
    };
    return (
        <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] ${map[color]}`}>
            {children}
        </span>
    );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2">
            <span className="shrink-0 text-xs text-zinc-500">{label}</span>
            <span className={`text-right text-xs text-zinc-100 ${mono ? "font-mono" : ""}`}>{value}</span>
        </div>
    );
}
