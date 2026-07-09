import type { Node, Edge } from "@xyflow/react";
import type { TopologyNode, TopologyEdge, TopologyCluster } from "@/lib/api";

export type MapViewMode = "hierarchy" | "by-ip" | "radial" | "dns-cloud";

const CLIENT_X = 40;
const VPS_X = 360;
const SERVICE_X = 700;
const CLIENT_GAP = 160;
const SERVICE_GAP = 88;
const MAX_SERVICES_VISIBLE = 8;

function num(v: unknown, fallback = 0): number {
    return typeof v === "number" ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}

/** Radial: VPS en anillo, servicios alrededor (sin clientes) */
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

    const centerX = 500;
    let clusterY = 80;
    const vpsList = [...vpsNodes].sort((a, b) => a.label.localeCompare(b.label));

    for (const v of vpsList) {
        const svcs = servicesByParent.get(v.id) || [];
        const cluster = clusterByVps.get(v.id);
        const radius = 140 + Math.min(svcs.length, 6) * 12;

        flowNodes.push({
            id: v.id,
            type: "vps",
            position: { x: centerX - 125, y: clusterY },
            data: {
                label: v.label,
                status: v.status || cluster?.status,
                ip: str(v.meta?.ip, cluster?.ip),
                serviceCount: svcs.length,
                totalClusterCost: cluster?.totalClusterCost,
                clientName: str(v.meta?.clientName, cluster?.clientName),
            },
        });

        const visible = svcs.slice(0, MAX_SERVICES_VISIBLE);
        visible.forEach((s, i) => {
            const angle = (i / Math.max(visible.length, 1)) * Math.PI * 1.6 - Math.PI * 0.3;
            const sx = centerX + 200 + Math.cos(angle) * radius;
            const sy = clusterY + 30 + Math.sin(angle) * (radius * 0.55);
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

        clusterY += radius * 1.2 + 120;
    }

    return { nodes: flowNodes, edges: flowEdges };
}

export function buildFlowGraph(
    mode: MapViewMode,
    topoNodes: TopologyNode[],
    topoEdges: TopologyEdge[],
    clusters: TopologyCluster[]
): { nodes: Node[]; edges: Edge[] } {
    if (mode === "radial") {
        return buildRadialGraph(topoNodes, clusters);
    }
    return buildHierarchyGraph(topoNodes, topoEdges, clusters);
}

function buildHierarchyGraph(
    topoNodes: TopologyNode[],
    topoEdges: TopologyEdge[],
    clusters: TopologyCluster[]
): { nodes: Node[]; edges: Edge[] } {
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

    // Layout VPS columns first to compute Y centers
    const vpsY = new Map<string, number>();
    let cursorY = 40;
    for (const v of sortedVps) {
        const svcs = servicesByParent.get(v.id) || [];
        const visible = Math.min(svcs.length, MAX_SERVICES_VISIBLE);
        const blockH = Math.max(140, visible * SERVICE_GAP + 40);
        vpsY.set(v.id, cursorY + blockH / 2 - 60);
        cursorY += blockH + 48;
    }

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
            position: { x: CLIENT_X, y },
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

    // VPS + services
    for (const v of sortedVps) {
        const cluster = clusterByVps.get(v.id);
        const y = vpsY.get(v.id) ?? 40;
        flowNodes.push({
            id: v.id,
            type: "vps",
            position: { x: VPS_X, y },
            data: {
                label: v.label,
                status: v.status || cluster?.status,
                ip: str(v.meta?.ip, cluster?.ip),
                provider: str(v.meta?.provider),
                monthlyCost: num(v.meta?.monthlyCost, cluster?.monthlyCost),
                serviceCount: num(v.meta?.serviceCount, cluster?.serviceCount),
                clientName: str(v.meta?.clientName, cluster?.clientName),
                totalClusterCost:
                    cluster?.totalClusterCost
                    ?? (num(v.meta?.servicesMonthlyCost) + num(v.meta?.monthlyCost)),
            },
        });

        const svcs = servicesByParent.get(v.id) || [];
        const visible = svcs.slice(0, MAX_SERVICES_VISIBLE);
        const startY = y - ((visible.length - 1) * SERVICE_GAP) / 2;

        visible.forEach((s, i) => {
            flowNodes.push({
                id: s.id,
                type: "service",
                position: { x: SERVICE_X, y: startY + i * SERVICE_GAP },
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
                    x: SERVICE_X,
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

    // Orphan unassigned services cluster
    const orphans = servicesByParent.get("orphan") || [];
    if (orphans.length > 0) {
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
