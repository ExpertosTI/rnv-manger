"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";

type Props = {
    variant?: "light" | "dark";
    className?: string;
};

export function SidebarToggle({ variant = "light", className }: Props) {
    const { collapsed, toggle } = useSidebar();
    const isDark = variant === "dark";

    return (
        <Button
            variant="ghost"
            size="icon"
            className={cn(
                "hidden lg:flex h-9 w-9 rounded-xl shrink-0",
                isDark
                    ? "text-zinc-300 hover:bg-white/10 hover:text-white border border-white/10"
                    : "",
                className
            )}
            onClick={toggle}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
    );
}
