"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
    size?: "sm" | "md" | "lg";
    text?: string;
}

export function LoadingSpinner({ size = "md", text }: LoadingSpinnerProps) {
    const sizes = {
        sm: "h-4 w-4",
        md: "h-8 w-8",
        lg: "h-12 w-12",
    };

    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
                <Loader2 className={`${sizes[size]} text-primary`} />
            </motion.div>
            {text && <p className="text-sm text-muted-foreground">{text}</p>}
        </div>
    );
}

export function PageLoading() {
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <LoadingSpinner size="lg" text="Loading..." />
        </div>
    );
}

export function TableLoading({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="h-14 bg-secondary/30 rounded-lg animate-pulse"
                />
            ))}
        </div>
    );
}
