import type { Node, Edge } from "@xyflow/react";
import type { TopologyNode, TopologyEdge, TopologyCluster } from "@/lib/api";

export type MapViewMode = "hierarchy" | "by-ip" | "radial" | "dns-cloud";

const CLIENT_X = 40;
const VPS_X = 360;
const SERVICE_X = 700;
const CLIENT_GAP = 160;
const SERVICE_GAP = 88;
export type MapLayoutOptions = {
    /** Solo VPS + clientes; servicios al expandir un VPS */
    compact?: boolean;
    expandedVpsId?: string | null;
};

const MAX_SERVICES_VISIBLE = 6;

function num(v: unknown, fallback = 0): number {
    return typeof v === "number" ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}

/** Radial: VPS en anillo central, servicios alrededor de cada VPS */
export function buildRadialGraph(
    topoNodes: TopologyNode[],
    clusters: TopologyCluster[]
): { nodes: Node[]; edges: Edge[] } {
    const vpsNodes = topoNodes.filter((n) => n.type === "vps");
    const services = topoNodes.filter((n) => n.type === "service");
    const servicesByParent = new Map<string, TopologyNode[]>();
    for (const s of services) {
        const pid = s.parentId || "orphan";
        if (!servicesByParent.has(pid)) servicesByParent.set(pid, []);
        servicesByParent.get(pid)!.push(s);
    }

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    const clusterByVps = new Map(clusters.map((c) => [c.vpsId, c]));

    const centerX = 520;
    const centerY = 380;
    const vpsRingR = 200;
    const svcRingR = 130;
    const vpsList = [...vpsNodes].sort((a, b) => a.label.localeCompare(b.label));
    const n = vpsList.length || 1;

    vpsList.forEach((v, vi) => {
        const angle = (vi / n) * Math.PI * 2 - Math.PI / 2;
        const vx = centerX + Math.cos(angle) * vpsRingR - 125;
        const vy = centerY + Math.sin(angle) * vpsRingR - 60;
        const cluster = clusterByVps.get(v.id);
        const svcs = servicesByParent.get(v.id) || [];

        flowNodes.push({
            id: v.id,
            type: "vps",
            position: { x: vx, y: vy },
            data: {
                label: v.label,
                status: v.status || cluster?.status,
                ip: str(v.meta?.ip, cluster?.ip),
                serviceCount: svcs.length,
                totalClusterCost: cluster?.totalClusterCost,
                clientName: str(v.meta?.clientName, cluster?.clientName),
                compact: false,
            },
        });

        const visible = svcs.slice(0, MAX_SERVICES_VISIBLE);
        visible.forEach((s, si) => {
            const svcAngle = angle + ((si - (visible.length - 1) / 2) * 0.35);
            const sx = centerX + Math.cos(svcAngle) * (vpsRingR + svcRingR) - 90;
            const sy = centerY + Math.sin(svcAngle) * (vpsRingR + svcRingR) - 30;
            flowNodes.push({
                id: s.id,
                type: "service",
                position: { x: sx, y: sy },
                data: {
                    label: s.label,
                    status: s.status,
                    type: str(s.meta?.type),
                    url: str(s.meta?.url),
                    faviconUrl: str(s.meta?.faviconUrl),
                    charge: num(s.meta?.charge),
                },
            });
            flowEdges.push({
                id: `radial-${v.id}-${s.id}`,
                source: v.id,
                target: s.id,
                type: "default",
                animated: isOnline(s.status),
                className: isOnline(s.status) ? "nm-edge-hosts" : "nm-edge-dim",
                style: { stroke: isOnline(s.status) ? "#9b7bff" : "#3f3f46", strokeWidth: 2 },
            });
        });

        if (svcs.length > MAX_SERVICES_VISIBLE) {
            const overflowId = `overflow-${v.id}`;
            const svcAngle = angle + 0.5;
            flowNodes.push({
                id: overflowId,
                type: "service",
                position: {
                    x: centerX + Math.cos(svcAngle) * (vpsRingR + svcRingR) - 90,
                    y: centerY + Math.sin(svcAngle) * (vpsRingR + svcRingR) - 30,
                },
                data: { label: `+${svcs.length - MAX_SERVICES_VISIBLE} más`, status: "running", type: "more", charge: 0 },
                selectable: false,
            });
            flowEdges.push({
                id: `radial-${v.id}-${overflowId}`,
                source: v.id,
                target: overflowId,
                type: "default",
                className: "nm-edge-dim",
                style: { stroke: "#52525b", strokeWidth: 1.25 },
            });
        }
    });

    return { nodes: flowNodes, edges: flowEdges };
}

export function buildFlowGraph(
    mode: MapViewMode,
    topoNodes: TopologyNode[],
    topoEdges: TopologyEdge[],
    clusters: TopologyCluster[],
    opts?: MapLayoutOptions
): { nodes: Node[]; edges: Edge[] } {
    if (mode === "radial") {
        return buildRadialGraph(topoNodes, clusters);
    }
    return buildHierarchyGraph(topoNodes, topoEdges, clusters, opts);
}

function buildHierarchyGraph(
    topoNodes: TopologyNode[],
    topoEdges: TopologyEdge[],
    clusters: TopologyCluster[],
    opts?: MapLayoutOptions
): { nodes: Node[]; edges: Edge[] } {
    const compact = opts?.compact !== false;
    const expandedVpsId = opts?.expandedVpsId ?? null;
    const clients = topoNodes.filter((n) => n.type === "client");
    const vpsNodes = topoNodes.filter((n) => n.type === "vps");
    const services = topoNodes.filter((n) => n.type === "service");

    const clusterByVps = new Map(clusters.map((c) => [c.vpsId, c]));
    const servicesByParent = new Map<string, TopologyNode[]>();
    for (const s of services) {
        const pid = s.parentId || "orphan";
        if (!servicesByParent.has(pid)) servicesByParent.set(pid, []);
        servicesByParent.get(pid)!.push(s);
    }

    // Sort VPS: those with clients first, by name
    const sortedVps = [...vpsNodes].sort((a, b) => a.label.localeCompare(b.label));

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Layout VPS — grid horizontal en modo compacto
    const vpsY = new Map<string, number>();
    const vpsX = new Map<string, number>();
    const VPS_COLS = compact ? 3 : 1;
    const VPS_COL_W = compact ? 320 : 0;
    const VPS_ROW_H = compact ? 200 : 0;

    let cursorY = 40;
    sortedVps.forEach((v, idx) => {
        const svcs = servicesByParent.get(v.id) || [];
        const showServices = !compact || expandedVpsId === v.id;
        const visibleCount = showServices ? Math.min(svcs.length, MAX_SERVICES_VISIBLE) : 0;
        const blockH = compact
            ? VPS_ROW_H
            : Math.max(140, visibleCount * SERVICE_GAP + 40);

        if (compact) {
            const col = idx % VPS_COLS;
            const row = Math.floor(idx / VPS_COLS);
            vpsX.set(v.id, VPS_X + col * VPS_COL_W);
            vpsY.set(v.id, 60 + row * VPS_ROW_H);
        } else {
            vpsY.set(v.id, cursorY + blockH/2 - 60);
            cursorY += blockH + 48;
        }
    });

    // Clients on the left — center near connected VPS if possible
    const clientVpsLinks = new Map<string, string[]>();
    for (const e of topoEdges) {
        if (e.kind === "owns") {
            if (!clientVpsLinks.has(e.from)) clientVpsLinks.set(e.from, []);
            clientVpsLinks.get(e.from)!.push(e.to);
        }
    }

    const placedClients = new Set<string>();
    let clientFallbackY = 60;
    const sortedClients = [...clients].sort((a, b) => a.label.localeCompare(b.label));

    for (const c of sortedClients) {
        const linked = clientVpsLinks.get(c.id) || [];
        let y = clientFallbackY;
        if (linked.length > 0) {
            const ys = linked.map((id) => vpsY.get(id)).filter((n): n is number => n != null);
            if (ys.length) y = ys.reduce((a, b) => a + b, 0) / ys.length;
        }
        // Avoid stacking too tightly
        if (placedClients.size > 0) {
            const prev = flowNodes.filter((n) => n.type === "client");
            for (const p of prev) {
                if (Math.abs(p.position.y - y) < CLIENT_GAP - 20) {
                    y = p.position.y + CLIENT_GAP;
                }
            }
        }
        placedClients.add(c.id);
        clientFallbackY = Math.max(clientFallbackY + CLIENT_GAP, y + CLIENT_GAP);

        flowNodes.push({
            id: c.id,
            type: "client",
            position: { x: CLIENT_X, y: compact ? 80 + (placedClients.size % 4) * 140 : y },
            data: {
                label: c.label,
                status: c.status,
                email: str(c.meta?.email),
                chargeAmount: num(c.meta?.chargeAmount),
                billingCycle: str(c.meta?.billingCycle, "monthly"),
                dueDesc: str(c.meta?.dueDesc),
            },
        });
    }

    // VPS + servicios (solo si no compacto o VPS expandido)
    for (const v of sortedVps) {
        const cluster = clusterByVps.get(v.id);
        const y = vpsY.get(v.id) ?? 40;
        const x = compact ? (vpsX.get(v.id) ?? VPS_X) : VPS_X;
        const svcs = servicesByParent.get(v.id) || [];
        const isExpanded = expandedVpsId === v.id;

        flowNodes.push({
            id: v.id,
            type: "vps",
            position: { x, y },
            data: {
                label: v.label,
                status: v.status || cluster?.status,
                ip: str(v.meta?.ip, cluster?.ip),
                provider: str(v.meta?.provider),
                monthlyCost: num(v.meta?.monthlyCost, cluster?.monthlyCost),
                serviceCount: num(v.meta?.serviceCount, cluster?.serviceCount) || svcs.length,
                clientName: str(v.meta?.clientName, cluster?.clientName),
                totalClusterCost:
                    cluster?.totalClusterCost
                    ?? (num(v.meta?.servicesMonthlyCost) + num(v.meta?.monthlyCost)),
                compact,
                expanded: isExpanded,
            },
        });

        if (compact && !isExpanded) {
            continue;
        }

        const visible = svcs.slice(0, MAX_SERVICES_VISIBLE);
        const startY = y - ((visible.length - 1) * SERVICE_GAP) / 2;
        const svcX = compact ? x + 280 : SERVICE_X;

        visible.forEach((s, i) => {
            flowNodes.push({
                id: s.id,
                type: "service",
                position: { x: svcX, y: startY + i * SERVICE_GAP },
                data: {
                    label: s.label,
                    status: s.status,
                    type: str(s.meta?.type),
                    url: str(s.meta?.url),
                    faviconUrl: str(s.meta?.faviconUrl),
                    charge: num(s.meta?.charge),
                    chargeCycle: str(s.meta?.chargeCycle, "monthly"),
                    clientName: str(s.meta?.clientName),
                    port: num(s.meta?.port) || undefined,
                },
            });
            flowEdges.push({
                id: `hosts-${v.id}-${s.id}`,
                source: v.id,
                target: s.id,
                type: "smoothstep",
                animated: isOnline(s.status),
                className: isOnline(s.status) ? "nm-edge-hosts" : "nm-edge-dim",
                style: {
                    stroke: isOnline(s.status) ? "#9b7bff" : "#3f3f46",
                    strokeWidth: isOnline(s.status) ? 2 : 1.25,
                },
            });
        });

        if (svcs.length > MAX_SERVICES_VISIBLE) {
            const overflowId = `overflow-${v.id}`;
            flowNodes.push({
                id: overflowId,
                type: "service",
                position: {
                    x: svcX,
                    y: startY + visible.length * SERVICE_GAP,
                },
                data: {
                    label: `+${svcs.length - MAX_SERVICES_VISIBLE} más`,
                    status: "running",
                    type: "more",
                    charge: 0,
                },
                selectable: false,
            });
            flowEdges.push({
                id: `hosts-${v.id}-${overflowId}`,
                source: v.id,
                target: overflowId,
                type: "smoothstep",
                className: "nm-edge-dim",
                style: { stroke: "#52525b", strokeWidth: 1.25 },
            });
        }
    }

    // Client → VPS owns edges
    for (const e of topoEdges) {
        if (e.kind !== "owns") continue;
        if (!flowNodes.some((n) => n.id === e.from) || !flowNodes.some((n) => n.id === e.to)) continue;
        flowEdges.push({
            id: `owns-${e.from}-${e.to}`,
            source: e.from,
            target: e.to,
            type: "smoothstep",
            animated: true,
            className: "nm-edge-owns",
            style: { stroke: "#2ee6d6", strokeWidth: 2.5 },
            label: "owns",
            labelStyle: { fill: "#a5f3fc", fontSize: 10, fontWeight: 700, fontFamily: "monospace" },
            labelBgStyle: { fill: "#05060b", fillOpacity: 0.85 },
            labelBgPadding: [5, 8] as [number, number],
            labelBgBorderRadius: 6,
        });
    }

    // Orphan unassigned services cluster (solo en modo expandido / no compacto)
    const orphans = servicesByParent.get("orphan") || [];
    if (orphans.length > 0 && !compact) {
        const id = "unassigned";
        const y = cursorY + 40;
        flowNodes.push({
            id,
            type: "vps",
            position: { x: VPS_X, y },
            data: {
                label: "Sin VPS",
                status: "unknown",
                ip: "—",
                serviceCount: orphans.length,
                totalClusterCost: 0,
            },
        });
        orphans.slice(0, MAX_SERVICES_VISIBLE).forEach((s, i) => {
            flowNodes.push({
                id: s.id,
                type: "service",
                position: { x: SERVICE_X, y: y - 40 + i * SERVICE_GAP },
                data: {
                    label: s.label,
                    status: s.status,
                    type: str(s.meta?.type),
                    charge: num(s.meta?.charge),
                    clientName: str(s.meta?.clientName),
                },
            });
            flowEdges.push({
                id: `orphan-${s.id}`,
                source: id,
                target: s.id,
                type: "smoothstep",
                className: "nm-edge-dim",
                style: { stroke: "#52525b", strokeWidth: 1.25 },
            });
        });
    }

    return { nodes: flowNodes, edges: flowEdges };
}

function isOnline(status?: string) {
    return ["running", "online", "active"].includes((status || "").toLowerCase());
}
