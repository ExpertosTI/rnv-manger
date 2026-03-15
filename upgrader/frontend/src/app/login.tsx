"use client";

import React, { useState } from "react";
import { Lock, User, ArrowRight, RefreshCw } from "lucide-react";

export default function Login({ onLogin }: { onLogin: () => void }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Validate Renace credentials
        if (username === "admin@renace.tech" && password === "Renace2026!") {
            onLogin();
        } else {
            setError("Credenciales incorrectas. (Pista: admin@renace.tech / Renace2026!)");
        }
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans items-center justify-center p-4">
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-32 bg-indigo-500/10 rounded-full blur-3xl -z-10 group-hover:bg-indigo-500/20 transition"></div>

                <div className="flex flex-col items-center gap-4 mb-8">
                    <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl">
                        <RefreshCw className="w-10 h-10 text-indigo-500" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
                            Renace.tech Migration
                        </h1>
                        <p className="text-neutral-400 text-sm mt-1">Acceso restringido al orquestador</p>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-neutral-500" />
                            </div>
                            <input
                                type="email"
                                placeholder="usuario@renace.tech"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl pl-12 pr-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                required
                            />
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-neutral-500" />
                            </div>
                            <input
                                type="password"
                                placeholder="Contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl pl-12 pr-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2 mt-2"
                    >
                        Acceder al Sistema <ArrowRight className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}
