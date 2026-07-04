"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import type { MascotState } from "./types";

/** Inline SVG — no depende de /renace-cone.svg ni del middleware */
function RenaceConeIcon({ size }: { size: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            fill="none"
            width={size}
            height={size}
            aria-hidden
        >
            <defs>
                <linearGradient id="cone" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#a78bfa" />
                    <stop offset="1" stopColor="#7c3aed" />
                </linearGradient>
            </defs>
            <path
                d="M32 6L54 54H10L32 6Z"
                fill="url(#cone)"
                stroke="#5b21b6"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <circle cx="26" cy="34" r="3.5" fill="#fff" />
            <circle cx="38" cy="34" r="3.5" fill="#fff" />
            <circle cx="27" cy="35" r="1.5" fill="#1e1b4b" />
            <circle cx="39" cy="35" r="1.5" fill="#1e1b4b" />
            <path
                d="M27 42c2 2.5 8 2.5 10 0"
                stroke="#ede9fe"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path d="M32 14l4 10H28l4-10Z" fill="#c4b5fd" opacity=".7" />
        </svg>
    );
}

export function ConeMascot({ state, size = 56 }: { state: MascotState; size?: number }) {
    const stateClass =
        state === "thinking" ? "cone-pulse" :
            state === "success" ? "cone-success" :
                state === "error" ? "cone-shake" :
                    "cone-bounce";

    return (
        <div className={`relative ${stateClass}`} style={{ width: size, height: size }}>
            <motion.div
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
            >
                <RenaceConeIcon size={size} />
            </motion.div>
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
