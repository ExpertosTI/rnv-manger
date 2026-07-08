"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Users, Server, Database, Zap } from "lucide-react";

export type ClientNodeData = {
    label: string;
    status?: string;
    email?: string;
    chargeAmount?: number;
    billingCycle?: string;
    dueDesc?: string;
};

export type VpsNodeData = {
    label: string;
    status?: string;
    ip?: string;
    provider?: string;
    monthlyCost?: number;
    serviceCount?: number;
    clientName?: string;
    totalClusterCost?: number;
};

export type ServiceNodeData = {
    label: string;
    status?: string;
    type?: string;
    url?: string;
    charge?: number;
    chargeCycle?: string;
    clientName?: string;
    port?: number;
};

function isOnline(status?: string) {
    const s = (status || "").toLowerCase();
    return ["running", "online", "active"].includes(s);
}

export const ClientNode = memo(function ClientNode({ data, selected }: NodeProps) {
    const d = data as ClientNodeData;
    return (
        <div
            className={`min-w-[200px] rounded-2xl border bg-[#12121a]/95 backdrop-blur-xl shadow-2xl transition-all ${
                selected
                    ? "border-cyan-400/80 shadow-[0_0_32px_rgba(34,211,238,0.35)]"
                    : "border-cyan-500/30 hover:border-cyan-400/50"
            }`}
        >
            <div className="h-1 rounded-t-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-cyan-300" />
            <div className="p-3.5">
                <div className="flex items-start gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
                            <Users className="w-5 h-5 text-cyan-300" />
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-400/80 font-semibold">Cliente</p>
                        <p className="text-sm font-bold text-white truncate mt-0.5">{d.label}</p>
                        {d.email && <p className="text-[11px] text-zinc-500 truncate mt-0.5">{d.email}</p>}
                    </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-lg font-bold text-cyan-300 tabular-nums">
                        ${(d.chargeAmount ?? 0).toFixed(0)}
                        <span className="text-[10px] font-medium text-zinc-500 ml-1">
                            /{d.billingCycle === "annual" ? "año" : "mes"}
                        </span>
                    </span>
                    {d.dueDesc && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300/90 border border-cyan-500/20">
                            {d.dueDesc}
                        </span>
                    )}
                </div>
            </div>
            <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-cyan-400 !border-2 !border-[#0a0a0f]" />
        </div>
    );
});

export const VpsNode = memo(function VpsNode({ data, selected }: NodeProps) {
    const d = data as VpsNodeData;
    const online = isOnline(d.status);
    return (
        <div
            className={`min-w-[230px] rounded-2xl border bg-[#12121a]/95 backdrop-blur-xl shadow-2xl transition-all ${
                selected
                    ? "border-violet-400/80 shadow-[0_0_36px_rgba(167,139,250,0.4)]"
                    : "border-violet-500/35 hover:border-violet-400/55"
            }`}
        >
            <div className="h-1 rounded-t-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-400" />
            <div className="p-3.5">
                <div className="flex items-start gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                            <Server className="w-5 h-5 text-violet-300" />
                        </div>
                        <span
                            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${
                                online
                                    ? "bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse"
                                    : "bg-zinc-500"
                            }`}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-violet-400/80 font-semibold">VPS</p>
                            <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                    online
                                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                        : "bg-zinc-700/50 text-zinc-400 border border-zinc-600"
                                }`}
                            >
                                {online ? "ONLINE" : (d.status || "OFF").toUpperCase()}
                            </span>
                        </div>
                        <p className="text-sm font-bold text-white truncate mt-0.5">{d.label}</p>
                        <p className="text-[11px] font-mono text-zinc-500 mt-0.5">{d.ip || "—"}</p>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white/[0.03] border border-white/5 px-2.5 py-1.5">
                        <p className="text-[9px] uppercase tracking-wider text-zinc-500">Servicios</p>
                        <p className="text-sm font-bold text-white tabular-nums">{d.serviceCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] border border-white/5 px-2.5 py-1.5">
                        <p className="text-[9px] uppercase tracking-wider text-zinc-500">Cluster</p>
                        <p className="text-sm font-bold text-violet-300 tabular-nums">
                            ${(d.totalClusterCost ?? d.monthlyCost ?? 0).toFixed(0)}
                        </p>
                    </div>
                </div>
                {d.clientName && (
                    <p className="mt-2 text-[11px] text-cyan-400/80 truncate flex items-center gap-1">
                        <Users className="w-3 h-3" /> {d.clientName}
                    </p>
                )}
            </div>
            <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-violet-400 !border-2 !border-[#0a0a0f]" />
            <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-violet-400 !border-2 !border-[#0a0a0f]" />
        </div>
    );
});

export const ServiceNode = memo(function ServiceNode({ data, selected }: NodeProps) {
    const d = data as ServiceNodeData;
    const online = isOnline(d.status);
    return (
        <div
            className={`min-w-[170px] max-w-[200px] rounded-xl border bg-[#14141e]/95 backdrop-blur-xl shadow-xl transition-all ${
                selected
                    ? "border-fuchsia-400/80 shadow-[0_0_28px_rgba(232,121,249,0.35)]"
                    : "border-fuchsia-500/25 hover:border-fuchsia-400/45"
            }`}
        >
            <div className="p-2.5">
                <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-400/30 flex items-center justify-center">
                            {d.type === "odoo" ? (
                                <Zap className="w-3.5 h-3.5 text-fuchsia-300" />
                            ) : (
                                <Database className="w-3.5 h-3.5 text-fuchsia-300" />
                            )}
                        </div>
                        <span
                            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                                online ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-zinc-600"
                            }`}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] uppercase tracking-wider text-fuchsia-400/70 font-semibold">
                            {d.type || "svc"}
                        </p>
                        <p className="text-xs font-bold text-white truncate">{d.label}</p>
                    </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-1">
                    {(d.charge ?? 0) > 0 ? (
                        <span className="text-[11px] font-semibold text-fuchsia-300">
                            ${d.charge}
                            <span className="text-zinc-500">/{d.chargeCycle === "annual" ? "a" : "m"}</span>
                        </span>
                    ) : (
                        <span className="text-[10px] text-zinc-600">—</span>
                    )}
                    {d.clientName && (
                        <span className="text-[9px] text-cyan-400/70 truncate max-w-[80px]">{d.clientName}</span>
                    )}
                </div>
            </div>
            <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-fuchsia-400 !border-2 !border-[#0a0a0f]" />
        </div>
    );
});

export const mapNodeTypes = {
    client: ClientNode,
    vps: VpsNode,
    service: ServiceNode,
};
