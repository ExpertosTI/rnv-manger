"use client";

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";

export type CurrencyMode = "USD" | "DOP" | "DUAL";

export const DEFAULT_EXCHANGE_RATE = 60.50; // 1 USD = 60.50 DOP

interface CurrencyContextType {
    mode: CurrencyMode;
    rate: number;
    setMode: (mode: CurrencyMode) => void;
    setRate: (rate: number) => void;
    format: (amountInUSD: number, customMode?: CurrencyMode) => string;
    formatUSD: (amountInUSD: number) => string;
    formatDOP: (amountInUSD: number) => string;
    toDOP: (amountInUSD: number) => number;
    toUSD: (amountInDOP: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<CurrencyMode>("USD");
    const [rate, setRateState] = useState<number>(DEFAULT_EXCHANGE_RATE);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const savedMode = localStorage.getItem("rnv_currency_mode") as CurrencyMode | null;
            const savedRate = localStorage.getItem("rnv_exchange_rate");
            if (savedMode && ["USD", "DOP", "DUAL"].includes(savedMode)) {
                setModeState(savedMode);
            }
            if (savedRate && !isNaN(parseFloat(savedRate)) && parseFloat(savedRate) > 0) {
                setRateState(parseFloat(savedRate));
            }
        }
    }, []);

    const setMode = useCallback((newMode: CurrencyMode) => {
        setModeState(newMode);
        if (typeof window !== "undefined") {
            localStorage.setItem("rnv_currency_mode", newMode);
        }
    }, []);

    const setRate = useCallback((newRate: number) => {
        if (newRate > 0) {
            setRateState(newRate);
            if (typeof window !== "undefined") {
                localStorage.setItem("rnv_exchange_rate", newRate.toString());
            }
        }
    }, []);

    const toDOP = useCallback((amountInUSD: number) => {
        return (amountInUSD || 0) * rate;
    }, [rate]);

    const toUSD = useCallback((amountInDOP: number) => {
        return rate > 0 ? (amountInDOP || 0) / rate : 0;
    }, [rate]);

    const formatUSD = useCallback((amountInUSD: number) => {
        const val = amountInUSD || 0;
        return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }, []);

    const formatDOP = useCallback((amountInUSD: number) => {
        const val = toDOP(amountInUSD);
        return `RD$ ${val.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }, [toDOP]);

    const format = useCallback((amountInUSD: number, customMode?: CurrencyMode) => {
        const activeMode = customMode || mode;
        const usd = formatUSD(amountInUSD);
        const dop = formatDOP(amountInUSD);

        if (activeMode === "DOP") return dop;
        if (activeMode === "DUAL") return `${usd} (${dop})`;
        return usd;
    }, [mode, formatUSD, formatDOP]);

    return (
        <CurrencyContext.Provider value={{ mode, rate, setMode, setRate, format, formatUSD, formatDOP, toDOP, toUSD }}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const ctx = useContext(CurrencyContext);
    if (!ctx) {
        // Fallback for components rendered outside provider
        const rate = DEFAULT_EXCHANGE_RATE;
        const toDOP = (amountInUSD: number) => (amountInUSD || 0) * rate;
        const toUSD = (amountInDOP: number) => (amountInDOP || 0) / rate;
        const formatUSD = (amountInUSD: number) => `$${(amountInUSD || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const formatDOP = (amountInUSD: number) => `RD$ ${toDOP(amountInUSD).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const format = (amountInUSD: number, mode: CurrencyMode = "USD") => {
            if (mode === "DOP") return formatDOP(amountInUSD);
            if (mode === "DUAL") return `${formatUSD(amountInUSD)} (${formatDOP(amountInUSD)})`;
            return formatUSD(amountInUSD);
        };
        return {
            mode: "USD" as CurrencyMode,
            rate,
            setMode: () => {},
            setRate: () => {},
            format,
            formatUSD,
            formatDOP,
            toDOP,
            toUSD,
        };
    }
    return ctx;
}
