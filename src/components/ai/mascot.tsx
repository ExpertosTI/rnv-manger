"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import type { MascotState } from "./types";

export function ConeMascot({ state, size = 56 }: { state: MascotState; size?: number }) {
    const stateClass =
        state === "thinking" ? "cone-pulse" :
            state === "success" ? "cone-success" :
                state === "error" ? "cone-shake" :
                    "cone-bounce";

    return (
        <div className={`relative ${stateClass}`} style={{ width: size, height: size }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img
                src="/renace-cone.svg"
                alt="Asistente RNV"
                width={size}
                height={size}
                className="drop-shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                draggable={false}
                animate={
                    state === "barrel-roll" ? { rotate: [0, 360, 360], scale: [1, 1.2, 1] } :
                        state === "shivering" ? { x: [-3, 3, -3, 3, 0], y: [-2, 2, -1, 1, 0] } :
                            state === "celebrate" ? { y: [0, -20, 0], scale: [1, 1.1, 1] } :
                                {}
                }
                transition={
                    state === "barrel-roll" ? { duration: 1, ease: "easeInOut" } :
                        state === "shivering" ? { duration: 0.3, repeat: 3 } :
                            state === "celebrate" ? { duration: 0.5, repeat: 2 } :
                                {}
                }
            />
            {state === "thinking" && (
                <div className="absolute -top-1 -right-1 w-4 h-4">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500" />
                </div>
            )}
            {state === "success" && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                >
                    <Check className="w-3 h-3 text-white" />
                </motion.div>
            )}
        </div>
    );
}
