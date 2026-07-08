"use client";

import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import { useSidebar } from "@/contexts/SidebarContext";
import { Button } from "@/components/ui/button";

const pageTitles: Record<string, string> = {
    "/": "Panel Principal",
    "/workflow": "Mi Flujo de Trabajo",
    "/vps": "Servidores VPS",
    "/services": "Servicios",
    "/map": "Neural Map",
    "/clients": "Clientes",
    "/billing": "Facturación",
    "/calendar": "Calendario",
    "/audit": "Auditoría Global",
    "/users": "Usuarios",
    "/settings": "Configuración",
    "/whiteboard": "Pizarra",
    "/config-editor": "Editor de Configuración",
};

export function TopHeader() {
    const pathname = usePathname();
    const { collapsed, toggle } = useSidebar();
    const isMap = pathname === "/map" || pathname.startsWith("/map/");

    const base = "/" + pathname.split("/")[1];
    const title = pageTitles[pathname] || pageTitles[base] || "RNV Manager";

    if (isMap) return null;

    return (
        <header className="h-14 border-b-2 border-gray-100 bg-white/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30 flex-shrink-0">
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="hidden lg:flex h-9 w-9 rounded-xl"
                    onClick={toggle}
                    title={collapsed ? "Expandir menú" : "Colapsar menú"}
                >
                    {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
                <h2 className="text-base font-semibold text-gray-700 hidden sm:block">{title}</h2>
            </div>
            <div className="flex items-center gap-2 ml-auto">
                <NotificationBell />
                <UserMenu />
            </div>
        </header>
    );
}
