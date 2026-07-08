"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type SidebarContextValue = {
    collapsed: boolean;
    toggle: () => void;
    setCollapsed: (v: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "rnv-sidebar-collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [collapsed, setCollapsedState] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === "1") setCollapsedState(true);
        } catch {
            /* ignore */
        }
        setReady(true);
    }, []);

    const setCollapsed = useCallback((v: boolean) => {
        setCollapsedState(v);
        try {
            localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
        } catch {
            /* ignore */
        }
    }, []);

    const toggle = useCallback(() => {
        setCollapsedState((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
            } catch {
                /* ignore */
            }
            return next;
        });
    }, []);

    if (!ready) {
        return <>{children}</>;
    }

    return (
        <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const ctx = useContext(SidebarContext);
    if (!ctx) {
        return {
            collapsed: false,
            toggle: () => {},
            setCollapsed: () => {},
        };
    }
    return ctx;
}
