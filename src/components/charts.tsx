"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BarChartProps {
    data: { label: string; value: number; color?: string }[];
    maxValue?: number;
    height?: number;
    showLabels?: boolean;
}

export function BarChart({ data, maxValue, height = 200, showLabels = true }: BarChartProps) {
    const max = maxValue ?? Math.max(...data.map((d) => d.value));

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-end justify-between gap-2 flex-1" style={{ height }}>
                {data.map((item, index) => {
                    const barHeight = (item.value / max) * 100;
                    return (
                        <div key={index} className="flex flex-col items-center flex-1 h-full justify-end">
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${barHeight}%` }}
                                transition={{ delay: index * 0.05, duration: 0.5, ease: "easeOut" }}
                                className={cn(
                                    "w-full rounded-t-md min-h-[4px]",
                                    item.color || "bg-primary"
                                )}
                            />
                            {showLabels && (
                                <span className="text-xs text-muted-foreground mt-2 truncate w-full text-center">
                                    {item.label}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

interface LineChartProps {
    data: number[];
    height?: number;
    color?: string;
}

export function SparkLine({ data, height = 40, color = "stroke-primary" }: LineChartProps) {
    if (data.length < 2) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * 100;
        const y = 100 - ((value - min) / range) * 100;
        return `${x},${y}`;
    }).join(" ");

    return (
        <svg width="100%" height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
            <motion.polyline
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, ease: "easeOut" }}
                fill="none"
                className={cn("stroke-2", color)}
                points={points}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
