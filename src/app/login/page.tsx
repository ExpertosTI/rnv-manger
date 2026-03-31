"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Zap, Loader2, User, ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { motion } from "framer-motion";

function LoginForm() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { addToast } = useToast();
    const redirect = searchParams.get("redirect") || "/";

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const body: Record<string, string> = { password };
            if (username) body.username = username;

            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (data.success) {
                addToast(`Bienvenido${data.user?.name ? ", " + data.user.name : ""}`, "success");
                router.push(redirect);
                router.refresh();
            } else {
                addToast(data.message || "Credenciales incorrectas", "error");
            }
        } catch {
            addToast("Error de conexión con el servidor", "error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-3">
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="Usuario o email (opcional)"
                        className="pl-10 h-12 border-gray-200 focus:border-violet-500 focus:ring-violet-500"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                    />
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        type="password"
                        placeholder="Contraseña"
                        className="pl-10 h-12 border-gray-200 focus:border-violet-500 focus:ring-violet-500"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                    />
                </div>
            </div>
            <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-semibold shadow-lg shadow-purple-200 transition-all active:scale-[0.98]"
                disabled={isLoading}
            >
                {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <>
                        Iniciar Sesión
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                )}
            </Button>
            <p className="text-xs text-center text-gray-400">
                Sin usuario: usa solo la contraseña maestra
            </p>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-violet-50/30 to-purple-50 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <div className="flex justify-center mb-8">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-purple-300"
                    >
                        <Zap className="w-10 h-10 text-white" />
                    </motion.div>
                </div>

                <Card className="border-2 border-gray-100 shadow-2xl backdrop-blur-sm bg-white/90">
                    <CardHeader className="space-y-1 text-center pb-2">
                        <CardTitle className="text-2xl font-bold">RNV Manager</CardTitle>
                        <CardDescription>Panel de Control de Infraestructura</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={<div className="h-32 animate-pulse bg-gray-50 rounded-xl" />}>
                            <LoginForm />
                        </Suspense>
                    </CardContent>
                </Card>

                <p className="text-center text-sm text-gray-500 mt-8">
                    &copy; {new Date().getFullYear()} RNV Manager &bull; Renace Tech
                </p>
            </motion.div>
        </div>
    );
}
