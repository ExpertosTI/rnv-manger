"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Zap, Loader2, User, ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { motion } from "framer-motion";
import { auth } from "@/lib/api";

function LoginForm() {
    const [mode, setMode] = useState<"email" | "otp">("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { addToast } = useToast();
    const redirect = searchParams.get("redirect") || "/";

    const requestOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await auth.requestOTP(email);
            addToast("Código enviado correctamente", "success");
            setMode("otp");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            addToast(
                !msg || msg.includes("fetch") ? "Error de conexión con el servidor" : msg,
                "error"
            );
        } finally {
            setIsLoading(false);
        }
    };

    const verifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const data = await auth.verifyOTP(email, code);
            addToast("Bienvenido, " + (data.user?.name || email), "success");
            router.push(redirect);
            router.refresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            addToast(
                !msg || msg.includes("fetch") ? "Error de conexión" : msg,
                "error"
            );
        } finally {
            setIsLoading(false);
        }
    };

    if (mode === "email") {
        return (
            <form onSubmit={requestOTP} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 ml-1">Email de acceso</label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                            type="email"
                            placeholder="tu@email.com"
                            className="pl-10 h-14 border-gray-200 focus:border-violet-500 focus:ring-violet-500 text-lg transition-all"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>
                </div>
                <Button
                    type="submit"
                    className="w-full h-14 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-lg rounded-2xl shadow-xl shadow-indigo-200 transition-all active:scale-[0.98]"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                        <>
                            Enviar Código de Acceso
                            <ArrowRight className="ml-2 h-5 h-5" />
                        </>
                    )}
                </Button>
            </form>
        );
    }

    return (
        <form onSubmit={verifyOTP} className="space-y-6">
            <div className="space-y-3">
                <div className="text-center mb-2">
                    <p className="text-sm text-gray-500">Hemos enviado un código a:</p>
                    <p className="text-sm font-bold text-violet-600">{email}</p>
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        className="pl-10 h-14 border-gray-200 focus:border-violet-500 focus:ring-violet-500 text-center text-2xl tracking-[0.5em] font-mono"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        required
                        maxLength={6}
                        autoFocus
                    />
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <Button
                    type="submit"
                    className="w-full h-14 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-lg rounded-2xl shadow-xl shadow-indigo-200 transition-all active:scale-[0.98]"
                    disabled={isLoading || code.length < 6}
                >
                    {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Verificar y Entrar"}
                </Button>
                <button
                    type="button"
                    onClick={() => setMode("email")}
                    className="text-sm text-gray-400 hover:text-violet-600 font-medium transition-colors"
                >
                    &larr; Volver a ingresar email
                </button>
            </div>
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
