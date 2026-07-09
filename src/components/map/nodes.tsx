"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Users, Server, Activity, Cloud, Globe } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";

export type DnsRootNodeData = {
    label: string;
    recordCount?: number;
    ipCount?: number;
};

export type IpHubNodeData = {
    ip: string;
    label: string;
    vpsName?: string;
    vpsStatus?: string;
    recordCount?: number;
    proxiedCount?: number;
};

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
    faviconUrl?: string;
    charge?: number;
    chargeCycle?: string;
    clientName?: string;
    port?: number;
};

function isOnline(status?: string) {
    const s = (status || "").toLowerCase();
    return ["running", "online", "active"].includes(s);
}

function ActivityBars({ hot }: { hot?: boolean }) {
    const delays = [0, 0.15, 0.3, 0.08, 0.22];
    const heights = [40, 70, 55, 90, 45];
    return (
        <div className="flex items-end gap-[3px] h-5">
            {heights.map((h, i) => (
                <span
                    key={i}
                    className={`nm-activity-bar w-[3px] rounded-full ${
                        hot ? "bg-gradient-to-t from-emerald-500 to-cyan-300" : "bg-zinc-600"
                    }`}
                    style={{
                        height: `${h}%`,
                        animationDelay: `${delays[i]}s`,
                        animationDuration: `${0.9 + i * 0.12}s`,
                        opacity: hot ? 1 : 0.4,
                    }}
                />
            ))}
        </div>
    );
}

export const ClientNode = memo(function ClientNode({ data, selected }: NodeProps) {
    const d = data as ClientNodeData;
    return (
        <div
            className={`nm-float group relative min-w-[220px] rounded-[20px] transition-all duration-300 ${
                selected ? "scale-[1.03]" : "hover:scale-[1.015]"
            }`}
        >
            {/* Outer glow bloom */}
            <div
                className={`absolute -inset-[1px] rounded-[21px] opacity-80 blur-[1px] ${
                    selected
                        ? "bg-gradient-to-br from-cyan-300 via-teal-400 to-sky-500"
                        : "bg-gradient-to-br from-cyan-500/70 via-teal-600/40 to-transparent"
                }`}
            />
            <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-[linear-gradient(160deg,#0d1520_0%,#0a1018_45%,#071018_100%)] shadow-[0_20px_50px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="nm-scanline" />
                <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-cyan-400/20 blur-2xl nm-drift" />
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-cyan-500/10 to-transparent" />

                <div className="relative p-4">
                    <div className="flex items-start gap-3">
                        <div className="relative">
                            <span className="nm-pulse-ring absolute inset-0 rounded-2xl border border-cyan-400/50" />
                            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/30 to-teal-600/20 border border-cyan-300/40 shadow-[0_0_20px_rgba(46,230,214,0.35)]">
                                <Users className="h-5 w-5 text-cyan-200" />
                            </div>
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                                Cliente · billing
                            </p>
                            <p className="mt-1 truncate text-[15px] font-semibold tracking-tight text-white">
                                {d.label}
                            </p>
                            {d.email && (
                                <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{d.email}</p>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                            <p className="text-[9px] uppercase tracking-wider text-zinc-500">MRR</p>
                            <p className="font-mono text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-teal-300">
                                ${(d.chargeAmount ?? 0).toFixed(0)}
                                <span className="ml-1 text-[11px] font-medium text-zinc-500">
                                    /{d.billingCycle === "annual" ? "yr" : "mo"}
                                </span>
                            </p>
                        </div>
                        {d.dueDesc && (
                            <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-medium text-cyan-200 shadow-[0_0_12px_rgba(46,230,214,0.15)]">
                                {d.dueDesc}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Right}
                className="!-right-1.5 !h-3.5 !w-3.5 !border-[3px] !border-[#05060b] !bg-cyan-300 !shadow-[0_0_12px_#2ee6d6]"
            />
        </div>
    );
});

export const VpsNode = memo(function VpsNode({ data, selected }: NodeProps) {
    const d = data as VpsNodeData;
    const online = isOnline(d.status);
    return (
        <div
            className={`nm-float nm-float-delay-1 group relative min-w-[250px] rounded-[22px] transition-all duration-300 ${
                selected ? "scale-[1.03]" : "hover:scale-[1.015]"
            }`}
        >
            <div
                className={`absolute -inset-[1px] rounded-[23px] ${
                    selected
                        ? "bg-gradient-to-br from-violet-300 via-fuchsia-400 to-indigo-500 opacity-90"
                        : online
                            ? "bg-gradient-to-br from-violet-400/80 via-fuchsia-500/50 to-indigo-600/40 opacity-70"
                            : "bg-gradient-to-br from-zinc-500/40 to-zinc-700/20 opacity-60"
                }`}
            />
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(165deg,#12101c_0%,#0e0c18_50%,#0a0914_100%)] shadow-[0_24px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]">
                <div className="nm-scanline" />
                <div className="absolute -left-10 top-0 h-32 w-32 rounded-full bg-violet-500/25 blur-3xl" />
                <div className="absolute -right-6 bottom-0 h-24 w-24 rounded-full bg-fuchsia-500/20 blur-2xl nm-drift" />

                {/* Orbit ring */}
                <div className="pointer-events-none absolute right-3 top-3 h-10 w-10 opacity-40">
                    <div className="nm-orbit h-full w-full rounded-full border border-dashed border-violet-300/40" />
                    <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-fuchsia-300 shadow-[0_0_8px_#ff5ec8]" />
                </div>

                <div className="relative p-4">
                    <div className="flex items-start gap-3">
                        <div className="relative">
                            {online && (
                                <span className="nm-pulse-ring absolute -inset-1 rounded-2xl border border-emerald-400/40" />
                            )}
                            <div
                                className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[0_0_22px_rgba(155,123,255,0.4)] ${
                                    online
                                        ? "border-violet-300/50 bg-gradient-to-br from-violet-400/35 to-fuchsia-600/25"
                                        : "border-zinc-600 bg-zinc-800/60"
                                }`}
                            >
                                <Server className={`h-5 w-5 ${online ? "text-violet-100" : "text-zinc-400"}`} />
                            </div>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/80">
                                    VPS node
                                </p>
                                <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide ${
                                        online
                                            ? "border border-emerald-400/30 bg-emerald-400/15 text-emerald-300 shadow-[0_0_12px_rgba(125,255,179,0.25)]"
                                            : "border border-zinc-600 bg-zinc-800 text-zinc-400"
                                    }`}
                                >
                                    <span
                                        className={`h-1.5 w-1.5 rounded-full ${
                                            online ? "bg-emerald-300 animate-pulse" : "bg-zinc-500"
                                        }`}
                                    />
                                    {online ? "LIVE" : (d.status || "OFF").toUpperCase()}
                                </span>
                            </div>
                            <p className="mt-1 truncate text-[15px] font-semibold tracking-tight text-white">
                                {d.label}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-violet-200/50">{d.ip || "—"}</p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-2.5 py-2 backdrop-blur">
                                <p className="text-[9px] uppercase tracking-wider text-zinc-500">Svcs</p>
                                <p className="text-lg font-bold tabular-nums text-white">{d.serviceCount ?? 0}</p>
                            </div>
                            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-2.5 py-2 backdrop-blur">
                                <p className="text-[9px] uppercase tracking-wider text-zinc-500">Cost</p>
                                <p className="text-lg font-bold tabular-nums text-violet-200">
                                    ${(d.totalClusterCost ?? d.monthlyCost ?? 0).toFixed(0)}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col items-end justify-end gap-1 rounded-xl border border-white/5 bg-black/20 px-2.5 py-2">
                            <Activity className="h-3 w-3 text-violet-300/70" />
                            <ActivityBars hot={online} />
                        </div>
                    </div>

                    {d.clientName && (
                        <p className="mt-3 flex items-center gap-1.5 truncate text-[11px] text-cyan-300/80">
                            <Users className="h-3 w-3 shrink-0" />
                            {d.clientName}
                        </p>
                    )}
                </div>
            </div>
            <Handle
                type="target"
                position={Position.Left}
                className="!-left-1.5 !h-3.5 !w-3.5 !border-[3px] !border-[#05060b] !bg-violet-300 !shadow-[0_0_12px_#9b7bff]"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!-right-1.5 !h-3.5 !w-3.5 !border-[3px] !border-[#05060b] !bg-violet-300 !shadow-[0_0_12px_#9b7bff]"
            />
        </div>
    );
});

export const ServiceNode = memo(function ServiceNode({ data, selected }: NodeProps) {
    const d = data as ServiceNodeData;
    const online = isOnline(d.status);
    const isMore = d.type === "more";

    return (
        <div
            className={`nm-float nm-float-delay-2 group relative min-w-[178px] max-w-[210px] rounded-2xl transition-all duration-300 ${
                selected ? "scale-[1.04]" : "hover:scale-[1.02]"
            }`}
        >
            <div
                className={`absolute -inset-[1px] rounded-[17px] ${
                    selected
                        ? "bg-gradient-to-br from-fuchsia-300 via-pink-400 to-rose-400 opacity-90"
                        : online
                            ? "bg-gradient-to-br from-fuchsia-400/70 via-pink-500/40 to-transparent opacity-65"
                            : "bg-zinc-600/30 opacity-50"
                }`}
            />
            <div
                className={`relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] ${
                    isMore
                        ? "bg-[#12121a]/90 border-dashed"
                        : "bg-[linear-gradient(155deg,#151020_0%,#100c18_100%)]"
                }`}
            >
                {!isMore && <div className="nm-scanline opacity-25" />}
                <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-fuchsia-500/20 blur-xl" />

                <div className="relative p-3">
                    <div className="flex items-center gap-2.5">
                        <ServiceIcon
                            name={d.label}
                            type={d.type}
                            url={d.url}
                            faviconUrl={d.faviconUrl}
                            size="sm"
                            online={online}
                            dark
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300/70">
                                {isMore ? "cluster" : d.type || "svc"}
                            </p>
                            <p className="truncate text-[12px] font-semibold text-white">{d.label}</p>
                        </div>
                    </div>

                    {!isMore && (
                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/5 pt-2">
                            {(d.charge ?? 0) > 0 ? (
                                <span className="font-mono text-[11px] font-semibold text-fuchsia-200">
                                    ${d.charge}
                                    <span className="text-zinc-500">/{d.chargeCycle === "annual" ? "y" : "m"}</span>
                                </span>
                            ) : (
                                <span className="text-[10px] text-zinc-600">no bill</span>
                            )}
                            {d.clientName ? (
                                <span className="max-w-[90px] truncate text-[9px] text-cyan-300/70">{d.clientName}</span>
                            ) : online ? (
                                <span className="text-[9px] text-emerald-400/80">● signal</span>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
            <Handle
                type="target"
                position={Position.Left}
                className="!-left-1 !h-2.5 !w-2.5 !border-2 !border-[#05060b] !bg-fuchsia-300 !shadow-[0_0_10px_#ff5ec8]"
            />
        </div>
    );
});

export const DnsRootNode = memo(function DnsRootNode({ data, selected }: NodeProps) {
    const d = data as DnsRootNodeData;
    return (
        <div className={`nm-float relative min-w-[220px] rounded-[20px] transition-all ${selected ? "scale-[1.03]" : ""}`}>
            <div className="absolute -inset-[1px] rounded-[21px] bg-gradient-to-br from-amber-400/80 via-orange-500/60 to-amber-600/40 opacity-90" />
            <div className="relative overflow-hidden rounded-[20px] border border-amber-300/30 bg-[linear-gradient(160deg,#1a1408_0%,#0f0c06_100%)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.35)]">
                        <Cloud className="h-5 w-5 text-amber-200" />
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">DNS · Cloudflare</p>
                        <p className="text-[15px] font-semibold text-white">{d.label}</p>
                        <p className="text-[10px] text-amber-200/60">{d.recordCount ?? 0} registros · {d.ipCount ?? 0} IPs</p>
                    </div>
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className="!bottom-0 !h-3 !w-3 !border-2 !border-[#05060b] !bg-amber-300" />
        </div>
    );
});

export const IpHubNode = memo(function IpHubNode({ data, selected }: NodeProps) {
    const d = data as IpHubNodeData;
    const online = ["online", "running"].includes((d.vpsStatus || "").toLowerCase());
    return (
        <div className={`nm-float nm-float-delay-1 relative min-w-[200px] rounded-[18px] transition-all ${selected ? "scale-[1.03]" : ""}`}>
            <div className={`absolute -inset-[1px] rounded-[19px] ${online ? "bg-gradient-to-br from-emerald-400/60 to-teal-600/40" : "bg-gradient-to-br from-orange-400/50 to-amber-700/30"} opacity-80`} />
            <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(165deg,#101820_0%,#0a0e14_100%)] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                <div className="flex items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-500/15">
                        <Globe className="h-4 w-4 text-teal-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-teal-300/70">IP origen</p>
                        <p className="truncate text-[13px] font-semibold text-white">{d.label}</p>
                        <p className="font-mono text-[10px] text-zinc-400">{d.ip}</p>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-[9px] text-violet-200">
                        {d.recordCount ?? 0} apps
                    </span>
                    {(d.proxiedCount ?? 0) > 0 && (
                        <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-200">
                            {d.proxiedCount} CF proxy
                        </span>
                    )}
                    {d.vpsName && (
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] ${online ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-zinc-600 text-zinc-400"}`}>
                            {d.vpsName}
                        </span>
                    )}
                </div>
            </div>
            <Handle type="target" position={Position.Top} className="!top-0 !h-2.5 !w-2.5 !border-2 !border-[#05060b] !bg-amber-300" />
            <Handle type="source" position={Position.Bottom} className="!bottom-0 !h-2.5 !w-2.5 !border-2 !border-[#05060b] !bg-teal-300" />
            <Handle type="source" position={Position.Right} className="!-right-1 !h-2.5 !w-2.5 !border-2 !border-[#05060b] !bg-teal-300" />
        </div>
    );
});

export const mapNodeTypes = {
    client: ClientNode,
    vps: VpsNode,
    service: ServiceNode,
    dnsRoot: DnsRootNode,
    ipHub: IpHubNode,
};
