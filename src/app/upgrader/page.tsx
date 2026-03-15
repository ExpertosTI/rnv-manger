"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

const UPGRADER_URL = process.env.NEXT_PUBLIC_UPGRADER_URL || "https://upgrader.rnv.renace.tech";

export default function UpgraderPage() {
    const [reachable, setReachable] = useState(false);
    const [checking, setChecking] = useState(true);

    const checkUpgrader = async () => {
        setChecking(true);
        try {
            const res = await fetch(UPGRADER_URL, { method: "GET", mode: "no-cors" });
            setReachable(Boolean(res));
        } catch {
            setReachable(false);
        } finally {
            setChecking(false);
        }
    };

    useEffect(() => {
        checkUpgrader();
    }, []);

    if (!reachable && !checking) {
        return (
            <div className="space-y-4">
                <div className="rounded-2xl border border-red-300 bg-red-50 p-6">
                    <h1 className="text-2xl font-bold text-red-800">Upgrader no disponible</h1>
                    <p className="mt-2 text-red-700">
                        La app integrada de OpenUpgrade no respondió en {UPGRADER_URL}.
                    </p>
                    <div className="mt-4 flex gap-3">
                        <button
                            onClick={checkUpgrader}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Reintentar
                        </button>
                        <a
                            href={UPGRADER_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-red-700 hover:bg-red-100"
                        >
                            <ExternalLink className="h-4 w-4" />
                            Abrir directo
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">OpenUpgrade</h1>
                <a
                    href={UPGRADER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-white hover:bg-violet-700"
                >
                    <ExternalLink className="h-4 w-4" />
                    Abrir en ventana
                </a>
            </div>
            <div className="h-[80vh] overflow-hidden rounded-2xl border border-gray-700 bg-black">
                <iframe src={UPGRADER_URL} className="h-full w-full border-0" />
            </div>
        </div>
    );
}
