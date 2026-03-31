"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import { Search } from "lucide-react";

const pageTitles: Record<string, string> = {
    "/": "Panel Principal",
    "/vps": "Servidores VPS",
    "/services": "Servicios",
    "/clients": "Clientes",
    "/billing": "Facturación",
    "/audit": "Auditoría Global",
    "/users": "Usuarios",
    "/settings": "Configuración",
    "/whiteboard": "Pizarra",
    "/config-editor": "Editor de Configuración",
};

export function TopHeader() {
    const pathname = usePathname();

    if (pathname === "/login") return null;

    // Match dynamic routes like /clients/[id]
    const base = "/" + pathname.split("/")[1];
    const title = pageTitles[pathname] || pageTitles[base] || "RNV Manager";

    return (
        <header className="h-14 border-b-2 border-gray-100 bg-white/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30 flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-700 hidden sm:block">{title}</h2>
            <div className="flex items-center gap-2 ml-auto">
                <NotificationBell />
                <UserMenu />
            </div>
        </header>
    );
}
