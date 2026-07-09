"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import { SidebarToggle } from "./SidebarToggle";

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

    const base = "/" + pathname.split("/")[1];
    const title = pageTitles[pathname] || pageTitles[base] || "RNV Manager";

    return (
        <header className="h-12 border-b border-gray-100/80 bg-white/70 backdrop-blur-md flex items-center justify-between px-4 sm:px-5 sticky top-0 z-30 flex-shrink-0">
            <div className="flex items-center gap-2">
                <SidebarToggle />
                <h2 className="text-base font-semibold text-gray-700 hidden sm:block">{title}</h2>
            </div>
            <div className="flex items-center gap-2 ml-auto">
                <NotificationBell />
                <UserMenu />
            </div>
        </header>
    );
}
