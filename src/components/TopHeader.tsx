"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import { SidebarToggle } from "./SidebarToggle";
import { pageTitleForPath } from "@/config/nav";

export function TopHeader() {
    const pathname = usePathname();
    const title = pageTitleForPath(pathname);

    return (
        <header className="h-12 border-b border-gray-200/80 bg-white/90 backdrop-blur-md flex items-center justify-between px-4 sm:px-5 sticky top-0 z-30 flex-shrink-0 shadow-sm shadow-gray-100/50">
            <div className="flex items-center gap-2 min-w-0">
                <SidebarToggle />
                <h1 className="text-sm sm:text-base font-semibold text-gray-800 truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-2 ml-auto shrink-0">
                <NotificationBell />
                <UserMenu />
            </div>
        </header>
    );
}
