"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import type { MascotState } from "./types";

/** Inline SVG con curvas suaves, reflejos 3D y diseño premium de RENACE */
function RenaceConeIcon({ size }: { size: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            fill="none"
            width={size}
            height={size}
            aria-hidden
            className="select-none"
        >
            <defs>
                {/* Gradiente principal del cono */}
                <linearGradient id="coneGrad" x1="16" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#c084fc" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6d28d9" />
                </linearGradient>

                {/* Brillo especular superior */}
                <linearGradient id="coneGloss" x1="32" y1="8" x2="32" y2="34" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>

                {/* Sombra base suave */}
                <radialGradient id="baseGlow" cx="32" cy="54" r="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#2e1065" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Sombra sutil de profundidad base */}
            <ellipse cx="32" cy="55" rx="20" ry="4" fill="url(#baseGlow)" />

            {/* Cuerpo del cono con puntas redondeadas (sin aristas duras) */}
            <path
                d="M 32 7
                   C 33.6 7, 35 8.6, 35.8 10.4
                   L 52.4 48.6
                   C 53.4 51, 51.7 53.5, 49.1 53.5
                   L 14.9 53.5
                   C 12.3 53.5, 10.6 51, 11.6 48.6
                   L 28.2 10.4
                   C 29 8.6, 30.4 7, 32 7 Z"
                fill="url(#coneGrad)"
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeLinejoin="round"
            />

            {/* Franja reflectante de seguridad / diseño Renace */}
            <path
                d="M 23.5 28
                   L 40.5 28
                   C 42 28, 43 29.5, 42.4 31
                   L 40.5 35
                   L 23.5 35
                   L 21.6 31
                   C 21 29.5, 22 28, 23.5 28 Z"
                fill="#ffffff"
                fillOpacity="0.22"
            />

            {/* Brillo cenital */}
            <path
                d="M 32 9
                   C 33 9, 34 10.2, 34.5 11.5
                   L 37 18
                   L 27 18
                   L 29.5 11.5
                   C 30 10.2, 31 9, 32 9 Z"
                fill="url(#coneGloss)"
            />

            {/* Ojos expresivos */}
            <g>
                {/* Ojo Izquierdo */}
                <ellipse cx="26" cy="36" rx="3.8" ry="4.2" fill="#ffffff" />
                <ellipse cx="26.8" cy="36.5" rx="2.2" ry="2.5" fill="#1e1b4b" />
                <circle cx="25.5" cy="34.8" r="1" fill="#ffffff" />

                {/* Ojo Derecho */}
                <ellipse cx="38" cy="36" rx="3.8" ry="4.2" fill="#ffffff" />
                <ellipse cx="38.8" cy="36.5" rx="2.2" ry="2.5" fill="#1e1b4b" />
                <circle cx="37.5" cy="34.8" r="1" fill="#ffffff" />
            </g>

            {/* Sonrisa amigable */}
            <path
                d="M 28 43 C 30.5 45.5, 33.5 45.5, 36 43"
                stroke="#f5f3ff"
                strokeWidth="2"
                strokeLinecap="round"
            />
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
        <div className={`relative flex items-center justify-center ${stateClass}`} style={{ width: size, height: size }}>
            <motion.div
                draggable={false}
                animate={
                    state === "barrel-roll" ? { rotate: [0, 360, 360], scale: [1, 1.15, 1] } :
                        state === "shivering" ? { x: [-2, 2, -2, 2, 0], y: [-1, 1, -1, 1, 0] } :
                            state === "celebrate" ? { y: [0, -16, 0], scale: [1, 1.1, 1] } :
                                {}
                }
                transition={
                    state === "barrel-roll" ? { duration: 0.9, ease: "easeInOut" } :
                        state === "shivering" ? { duration: 0.25, repeat: 3 } :
                            state === "celebrate" ? { duration: 0.45, repeat: 2 } :
                                {}
                }
            >
                <RenaceConeIcon size={size} />
            </motion.div>
            {state === "thinking" && (
                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500 shadow-md shadow-cyan-400/50" />
                </div>
            )}
            {state === "success" && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-md shadow-emerald-500/50 border border-white/40"
                >
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                </motion.div>
            )}
        </div>
    );
}
