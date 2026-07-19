import {
    LayoutDashboard,
    Server,
    Users,
    Settings,
    Database,
    Zap,
    Palette,
    DollarSign,
    Shield,
    UsersRound,
    Calendar,
    Network,
    ListTodo,
    PackageSearch,
    MessageCircle,
    Sparkles,
    type LucideIcon,
} from "lucide-react";

export type NavItem = {
    icon: LucideIcon;
    label: string;
    href: string;
    headerTitle?: string;
};

/** Navegación principal — una sola fuente para sidebar, dock y header */
export const MAIN_NAV: NavItem[] = [
    { icon: LayoutDashboard, label: "Panel Principal", href: "/", headerTitle: "Panel Principal" },
    { icon: ListTodo, label: "Mi Flujo", href: "/workflow", headerTitle: "Mi Flujo" },
    { icon: Sparkles, label: "Wizard", href: "/wizard", headerTitle: "Organizar y cobrar" },
    { icon: Server, label: "Servidores VPS", href: "/vps", headerTitle: "Servidores VPS" },
    { icon: Database, label: "Servicios", href: "/services", headerTitle: "Servicios" },
    { icon: PackageSearch, label: "Inventario", href: "/inventory", headerTitle: "Inventario Real" },
    { icon: MessageCircle, label: "WhatsApp", href: "/whatsapp", headerTitle: "WhatsApp Renace" },
    { icon: Network, label: "Mapa", href: "/map", headerTitle: "Mapa de Infraestructura" },
    { icon: Users, label: "Clientes", href: "/clients", headerTitle: "Clientes" },
    { icon: DollarSign, label: "Facturación", href: "/billing", headerTitle: "Facturación" },
    { icon: Calendar, label: "Calendario", href: "/calendar", headerTitle: "Calendario" },
    { icon: Palette, label: "Pizarra", href: "/whiteboard", headerTitle: "Pizarra" },
];

export const ADMIN_NAV: NavItem[] = [
    { icon: Shield, label: "Auditoría", href: "/audit", headerTitle: "Auditoría" },
    { icon: UsersRound, label: "Usuarios", href: "/users", headerTitle: "Usuarios" },
    { icon: Settings, label: "Configuración", href: "/settings", headerTitle: "Configuración" },
];

export const ALL_NAV = [...MAIN_NAV, ...ADMIN_NAV];

export function pageTitleForPath(pathname: string): string {
    const exact = ALL_NAV.find((n) => n.href === pathname);
    if (exact?.headerTitle) return exact.headerTitle;
    const base = "/" + pathname.split("/").filter(Boolean)[0];
    const partial = ALL_NAV.find((n) => n.href === base);
    return partial?.headerTitle || "RNV Manager";
}

/** Atajos del dashboard — rutas que no están ya cubiertas por las tarjetas KPI */
export const DASHBOARD_SHORTCUTS: NavItem[] = [
    { icon: ListTodo, label: "Mi Flujo de trabajo", href: "/workflow" },
    { icon: Network, label: "Mapa de infraestructura", href: "/map" },
    { icon: Zap, label: "Pizarra colaborativa", href: "/whiteboard" },
];

export function isVpsOnline(status?: string): boolean {
    return ["running", "online", "active"].includes((status || "").toLowerCase());
}
