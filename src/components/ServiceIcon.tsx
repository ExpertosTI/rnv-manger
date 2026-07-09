"use client";

import { useState } from "react";
import { Database, Globe, Zap, Bot, Server, Box, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
    name?: string;
    type?: string;
    url?: string | null;
    faviconUrl?: string | null;
    size?: "xs" | "sm" | "md" | "lg";
    online?: boolean;
    className?: string;
    dark?: boolean;
};

const SIZES = {
    xs: { box: "h-7 w-7", icon: "h-3.5 w-3.5", img: 20 },
    sm: { box: "h-9 w-9", icon: "h-4 w-4", img: 24 },
    md: { box: "h-11 w-11", icon: "h-5 w-5", img: 32 },
    lg: { box: "h-14 w-14", icon: "h-6 w-6", img: 40 },
};

function hostnameFromUrl(raw?: string | null) {
    if (!raw) return "";
    try {
        const u = raw.startsWith("http") ? raw : `https://${raw}`;
        return new URL(u).hostname;
    } catch {
        return "";
    }
}

function resolveSrc(faviconUrl?: string | null, url?: string | null, type?: string) {
    if (faviconUrl) return faviconUrl;
    const host = hostnameFromUrl(url);
    if (host) return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    const t = (type || "").toLowerCase();
    const defaults: Record<string, string> = {
        odoo: "https://www.odoo.com/favicon.ico",
        ai: "https://n8n.io/favicon.ico",
        n8n: "https://n8n.io/favicon.ico",
        evoapi: "https://www.google.com/s2/favicons?domain=evolution-api.com&sz=128",
        evolution: "https://www.google.com/s2/favicons?domain=evolution-api.com&sz=128",
        whatsapp: "https://www.google.com/s2/favicons?domain=web.whatsapp.com&sz=128",
        postgres: "https://www.postgresql.org/favicon.ico",
        mysql: "https://www.mysql.com/favicon.ico",
        redis: "https://redis.io/favicon.ico",
        nginx: "https://nginx.org/favicon.ico",
        docker: "https://www.docker.com/favicon.ico",
    };
    return defaults[t] || "";
}

function TypeFallback({ type, className }: { type?: string; className?: string }) {
    const t = (type || "").toLowerCase();
    if (t === "odoo") return <Zap className={className} />;
    if (t === "ai" || t === "n8n") return <Bot className={className} />;
    if (t === "evoapi" || t === "evolution" || t === "whatsapp") return <MessageCircle className={className} />;
    if (t === "web" || t === "api") return <Globe className={className} />;
    if (t === "postgres" || t === "mysql" || t === "redis") return <Database className={className} />;
    if (t === "nginx" || t === "docker") return <Server className={className} />;
    return <Box className={className} />;
}

export function ServiceIcon({
    name,
    type,
    url,
    faviconUrl,
    size = "sm",
    online,
    className,
    dark,
}: Props) {
    const [failed, setFailed] = useState(false);
    const sz = SIZES[size];
    const src = resolveSrc(faviconUrl, url, type);
    const showImg = src && !failed;

    return (
        <div
            className={cn(
                "relative shrink-0 rounded-xl border overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105",
                sz.box,
                online
                    ? dark
                        ? "border-fuchsia-300/40 bg-gradient-to-br from-fuchsia-400/30 to-pink-600/20 shadow-[0_0_16px_rgba(255,94,200,0.35)]"
                        : "border-violet-200 bg-white shadow-md shadow-violet-100"
                    : dark
                        ? "border-zinc-700 bg-zinc-900"
                        : "border-gray-200 bg-gray-50",
                className
            )}
            title={name}
        >
            {showImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={name || type || "servicio"}
                    width={sz.img}
                    height={sz.img}
                    className="object-contain p-1"
                    onError={() => setFailed(true)}
                />
            ) : (
                <TypeFallback
                    type={type}
                    className={cn(
                        sz.icon,
                        online
                            ? dark ? "text-fuchsia-100" : "text-violet-600"
                            : dark ? "text-zinc-500" : "text-gray-400"
                    )}
                />
            )}
            {online !== undefined && (
                <span
                    className={cn(
                        "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2",
                        dark ? "border-[#100c18]" : "border-white",
                        online ? "bg-emerald-400 shadow-[0_0_6px_#7dffb3]" : "bg-zinc-500"
                    )}
                />
            )}
        </div>
    );
}
