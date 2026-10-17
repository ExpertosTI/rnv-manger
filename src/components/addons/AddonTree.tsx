import { ChevronRight, Folder, FolderGit2, Package } from "lucide-react";
import { GitBadge } from "@/components/addons/GitBadge";
import type { TreeNode } from "@/lib/addons/types";
import { cn } from "@/lib/utils";

export function AddonTree({
    node,
    selected,
    expanded,
    onToggle,
    onSelect,
    depth = 0,
}: {
    node: TreeNode;
    selected: string | null;
    expanded: Set<string>;
    onToggle: (path: string) => void;
    onSelect: (node: TreeNode) => void;
    depth?: number;
}) {
    const isOpen = expanded.has(node.relativePath);
    const hasChildren = node.children.length > 0;
    const active = selected === node.relativePath;
    const Icon = node.kind === "module" || node.kind === "version" ? Package : node.git.inRepo ? FolderGit2 : Folder;

    return (
        <div>
            <div
                className={cn(
                    "flex items-center gap-1 rounded-lg pr-2 py-1 text-sm",
                    active ? "bg-violet-100 text-violet-950" : "hover:bg-gray-50"
                )}
                style={{ paddingLeft: 8 + depth * 14 }}
            >
                <button
                    type="button"
                    className="w-5 h-5 grid place-items-center text-gray-400 shrink-0"
                    onClick={() => hasChildren && onToggle(node.relativePath)}
                    aria-label={isOpen ? "Contraer" : "Expandir"}
                >
                    {hasChildren ? (
                        <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-90")} />
                    ) : null}
                </button>
                <button
                    type="button"
                    onClick={() => onSelect(node)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                    <Icon className={cn("w-4 h-4 shrink-0", node.kind === "folder" ? "text-amber-500" : "text-violet-600")} />
                    <span className="truncate font-medium">{node.name || "raíz"}</span>
                </button>
                <GitBadge badge={node.git.badge} label={node.git.badgeLabel} compact />
            </div>
            {isOpen && hasChildren && (
                <div>
                    {node.children.map((child) => (
                        <AddonTree
                            key={child.relativePath || child.name}
                            node={child}
                            selected={selected}
                            expanded={expanded}
                            onToggle={onToggle}
                            onSelect={onSelect}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
