"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { motion } from "framer-motion";

export default function LoginPage() {
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const { addToast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();

            if (data.success) {
                addToast("Acceso concedido", "success");
                router.push("/");
                router.refresh();
            } else {
                addToast("Contraseña incorrecta", "error");
            }
        } catch (error) {
            addToast("Error de conexión", "error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-purple-50 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <div className="flex justify-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-purple-200">
                        <Image src="/renace-logo-icon.svg" alt="Renace" width={32} height={32} className="w-8 h-8 object-contain" />
                    </div>
                </div>

                <Card className="border-2 border-gray-100 shadow-xl backdrop-blur-sm bg-white/80">
                    <CardHeader className="space-y-1 text-center">
                        <CardTitle className="text-2xl font-bold">RNV Manager</CardTitle>
                        <CardDescription>
                            Ingresa la contraseña maestra para continuar
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input
                                        type="password"
                                        placeholder="••••••••"
                                        className="pl-10 h-12 border-gray-200 focus:border-violet-500 focus:ring-violet-500"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-12 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-semibold shadow-lg shadow-purple-100 transition-all active:scale-[0.98]"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    "Desbloquear Panel"
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <p className="text-center text-sm text-gray-500 mt-8">
                    © 2025 RNV Manager • Local Environment
                </p>
            </motion.div>
        </div>
    );
}
