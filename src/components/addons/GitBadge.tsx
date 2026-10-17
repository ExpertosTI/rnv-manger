import { GitBranch } from "lucide-react";
import type { GitBadge as GitBadgeKind } from "@/lib/addons/types";
import { cn } from "@/lib/utils";

const STYLES: Record<GitBadgeKind, string> = {
    subido: "bg-emerald-100 text-emerald-800 border-emerald-200",
    no_subido: "bg-gray-100 text-gray-600 border-gray-200",
    cambios_pendientes: "bg-amber-100 text-amber-900 border-amber-200",
};

export function GitBadge({
    badge,
    label,
    compact = false,
}: {
    badge: GitBadgeKind;
    label: string;
    compact?: boolean;
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap",
                compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                STYLES[badge]
            )}
        >
            <GitBranch className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
            {label}
        </span>
    );
}
