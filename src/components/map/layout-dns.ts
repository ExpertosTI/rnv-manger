import type { Node, Edge } from "@xyflow/react";
import type { DNSIPGroup, DNSZoneAudit, TopologyCluster, TopologyNode, TopologyEdge } from "@/lib/api";

const ROOT_X = 480;
const ROOT_Y = 20;
const IP_Y = 200;
const SVC_Y = 400;
const IP_COL_W = 280;
const SVC_GAP = 54;
const MAX_SVC = 15;

function isOnline(status?: string) {
    return ["running", "online", "active"].includes((status || "").toLowerCase());
}

/** DNS Cloud: renace.tech → IPs → subdominios/servicios (con fallback automático a clusters VPS) */
export function buildDNSCloudGraph(
    audit: DNSZoneAudit | null,
    clusters: TopologyCluster[] = [],
    topoNodes: TopologyNode[] = []
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // If audit has byIp records, use them
    let groups = audit?.byIp || [];

    // Fallback: derive IP groups from clusters / topoNodes if audit is empty
    if (groups.length === 0 && clusters.length > 0) {
        groups = clusters.map((c) => ({
            ip: c.ip || "127.0.0.1",
            vpsName: c.name,
            vpsStatus: c.status,
            label: c.name,
            recordCount: c.services?.length || 0,
            proxiedCount: 0,
            records: (c.services || []).map((s) => ({
                host: s.name,
                fqdn: `${s.name.toLowerCase().replace(/\s+/g, "-")}.renace.tech`,
                type: "A",
                proxied: true,
                status: s.status,
                inRnv: true,
            })),
        }));
    }

    const totalW = Math.max(groups.length * IP_COL_W, 600);
    const startX = ROOT_X - totalW / 2 + IP_COL_W / 2;

    nodes.push({
        id: "dns-root",
        type: "dnsRoot",
        position: { x: ROOT_X - 110, y: ROOT_Y },
        data: {
            label: audit?.domain || "renace.tech",
            recordCount: audit?.totalRecords || groups.reduce((acc, g) => acc + (g.recordCount || 0), 0),
            ipCount: audit?.uniqueIPs || groups.length,
        },
    });

    groups.forEach((g, gi) => {
        const ipId = `ip-${g.ip || gi}`;
        const x = startX + gi * IP_COL_W;
        nodes.push({
            id: ipId,
            type: "ipHub",
            position: { x: x - 100, y: IP_Y },
            data: {
                ip: g.ip,
                label: g.label || g.vpsName || g.ip,
                vpsName: g.vpsName,
                vpsStatus: g.vpsStatus,
                recordCount: g.recordCount || (g.records?.length || 0),
                proxiedCount: g.proxiedCount || 0,
            },
        });
        edges.push({
            id: `dns-${ipId}`,
            source: "dns-root",
            target: ipId,
            type: "smoothstep",
            animated: true,
            className: "nm-edge-owns",
            style: { stroke: "#f59e0b", strokeWidth: 2 },
        });

        const visible = (g.records || []).slice(0, MAX_SVC);
        visible.forEach((rec, si) => {
            const sid = `dns-svc-${g.ip}-${rec.host}-${si}`;
            nodes.push({
                id: sid,
                type: "service",
                position: { x: x - 85, y: SVC_Y + si * SVC_GAP },
                data: {
                    label: rec.host === "@" ? (audit?.domain || "renace.tech") : rec.host,
                    status: rec.inRnv ? rec.status || "running" : "unknown",
                    type: rec.inRnv ? "registered" : "dns-only",
                    url: `https://${rec.fqdn}`,
                    clientName: rec.inRnv ? "✓ RNV" : "solo DNS",
                    charge: 0,
                },
            });
            edges.push({
                id: `ip-hosts-${sid}`,
                source: ipId,
                target: sid,
                type: "smoothstep",
                animated: isOnline(rec.status),
                className: rec.inRnv ? "nm-edge-hosts" : "nm-edge-dim",
                style: {
                    stroke: rec.inRnv ? "#9b7bff" : "#52525b",
                    strokeWidth: rec.inRnv ? 2 : 1,
                },
            });
        });

        if ((g.records?.length || 0) > MAX_SVC) {
            const moreId = `dns-more-${g.ip}`;
            nodes.push({
                id: moreId,
                type: "service",
                position: { x: x - 85, y: SVC_Y + visible.length * SVC_GAP },
                data: {
                    label: `+${g.records.length - MAX_SVC} más`,
                    type: "more",
                    status: "running",
                },
                selectable: false,
            });
            edges.push({
                id: `ip-more-${g.ip}`,
                source: ipId,
                target: moreId,
                type: "smoothstep",
                className: "nm-edge-dim",
                style: { stroke: "#52525b" },
            });
        }
    });

    return { nodes, edges };
}

/** Por IP: columnas de servidor sin capa cliente (soporta fallback directo de VPS y servicios) */
export function buildByIPGraph(
    audit: DNSZoneAudit | null,
    clusters: TopologyCluster[] = [],
    topoNodes: TopologyNode[] = []
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 40;
    const IP_X = 80;
    const SVC_X = 420;

    let groups = audit?.byIp || [];
    if (groups.length === 0 && clusters.length > 0) {
        groups = clusters.map((c) => ({
            ip: c.ip || "127.0.0.1",
            vpsName: c.name,
            vpsStatus: c.status,
            label: c.name,
            recordCount: c.services?.length || 0,
            proxiedCount: 0,
            records: (c.services || []).map((s) => ({
                host: s.name,
                fqdn: `${s.name.toLowerCase().replace(/\s+/g, "-")}.renace.tech`,
                type: "A",
                proxied: false,
                status: s.status,
                inRnv: true,
            })),
        }));
    }

    for (const g of groups) {
        const ipId = `ip-${g.ip}`;
        const visible = (g.records || []).slice(0, MAX_SVC);
        const blockH = Math.max(120, visible.length * SVC_GAP + 20);
        const ipY = y + blockH / 2 - 50;

        nodes.push({
            id: ipId,
            type: "ipHub",
            position: { x: IP_X, y: ipY },
            data: {
                ip: g.ip,
                label: g.label || g.vpsName || g.ip,
                vpsName: g.vpsName,
                vpsStatus: g.vpsStatus,
                recordCount: g.recordCount || visible.length,
                proxiedCount: g.proxiedCount || 0,
            },
        });

        visible.forEach((rec, si) => {
            const sid = `bysvc-${g.ip}-${si}`;
            nodes.push({
                id: sid,
                type: "service",
                position: { x: SVC_X, y: y + si * SVC_GAP },
                data: {
                    label: rec.host,
                    status: rec.inRnv ? rec.status : "stopped",
                    type: rec.proxied ? "cf-proxy" : "direct",
                    url: `https://${rec.fqdn}`,
                    clientName: rec.proxied ? "CF proxy" : "Servicio",
                },
            });
            edges.push({
                id: `byedge-${sid}`,
                source: ipId,
                target: sid,
                type: "smoothstep",
                animated: rec.inRnv && isOnline(rec.status),
                className: rec.inRnv ? "nm-edge-hosts" : "nm-edge-dim",
                style: { stroke: rec.inRnv ? "#9b7bff" : "#3f3f46", strokeWidth: 2 },
            });
        });

        y += blockH + 60;
    }
    return { nodes, edges };
}

export type { DNSIPGroup };
