"use client";

import { useState } from "react";
import { useCurrency, type CurrencyMode } from "@/lib/currency";
import { DollarSign, RefreshCw, Check, Edit2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function CurrencyToggle({ className = "" }: { className?: string }) {
    const { mode, rate, setMode, setRate } = useCurrency();
    const [isEditingRate, setIsEditingRate] = useState(false);
    const [tempRate, setTempRate] = useState(rate.toString());

    const handleSaveRate = () => {
        const val = parseFloat(tempRate);
        if (!isNaN(val) && val > 0) {
            setRate(val);
            setIsEditingRate(false);
        }
    };

    return (
        <div className={`flex items-center gap-2 flex-wrap ${className}`}>
            {/* Currency Mode Pills */}
            <div className="flex bg-gray-100/90 dark:bg-zinc-800 p-1 rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-inner">
                <button
                    type="button"
                    onClick={() => setMode("USD")}
                    className={`flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                        mode === "USD"
                            ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                            : "text-gray-600 dark:text-zinc-400 hover:text-gray-900"
                    }`}
                >
                    <span>💵</span> USD ($)
                </button>
                <button
                    type="button"
                    onClick={() => setMode("DOP")}
                    className={`flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                        mode === "DOP"
                            ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm"
                            : "text-gray-600 dark:text-zinc-400 hover:text-gray-900"
                    }`}
                >
                    <span>🇩🇴</span> DOP (RD$)
                </button>
                <button
                    type="button"
                    onClick={() => setMode("DUAL")}
                    className={`flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                        mode === "DUAL"
                            ? "bg-white dark:bg-zinc-900 text-violet-600 dark:text-violet-400 shadow-sm"
                            : "text-gray-600 dark:text-zinc-400 hover:text-gray-900"
                    }`}
                >
                    <span>🔄</span> Dual
                </button>
            </div>

            {/* Exchange Rate Badge & Quick Edit */}
            {isEditingRate ? (
                <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-emerald-300 rounded-xl px-2 py-1 shadow-sm">
                    <span className="text-[11px] text-gray-500 font-medium">1 USD = RD$</span>
                    <Input
                        type="number"
                        step="0.1"
                        value={tempRate}
                        onChange={(e) => setTempRate(e.target.value)}
                        className="w-16 h-6 text-xs p-1 text-center font-bold border-gray-300 rounded-lg"
                        autoFocus
                    />
                    <Button
                        size="sm"
                        onClick={handleSaveRate}
                        className="h-6 w-6 p-0 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        <Check size={12} />
                    </Button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => {
                        setTempRate(rate.toString());
                        setIsEditingRate(true);
                    }}
                    title="Clic para cambiar la tasa de cambio USD/DOP"
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 rounded-xl text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 transition-colors"
                >
                    <span>Tasa: <b className="font-mono">1 USD = RD$ {rate.toFixed(2)}</b></span>
                    <Edit2 size={11} className="text-emerald-600 opacity-70" />
                </button>
            )}
        </div>
    );
}
