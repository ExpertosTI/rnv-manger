"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
    UsersRound, ShieldCheck, ArrowRight, Eye, EyeOff, CheckCircle2, 
    AlertCircle, Sparkles, Phone, Mail, Lock, User
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";
import { affiliates } from "@/lib/api";

function RegisterContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { addToast } = useToast();

    const token = searchParams.get("token") || "";

    const [isValidating, setIsValidating] = useState(true);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [inviteInfo, setInviteInfo] = useState<{
        name?: string;
        email?: string;
        note?: string;
        expiresAt: string;
    } | null>(null);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setIsValidating(false);
            setTokenError("No se proporcionó ningún token de invitación. Solicita un enlace válido al administrador.");
            return;
        }

        affiliates.getInviteInfo(token)
            .then((res) => {
                if (res.success && res.data) {
                    setInviteInfo(res.data);
                    if (res.data.name) setName(res.data.name);
                    if (res.data.email) setEmail(res.data.email);
                } else {
                    setTokenError("El enlace de invitación no es válido o ha expirado.");
                }
            })
            .catch((err) => {
                setTokenError(err instanceof Error ? err.message : "Enlace no válido o expirado.");
            })
            .finally(() => {
                setIsValidating(false);
            });
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password.length < 6) {
            addToast("La contraseña debe tener al menos 6 caracteres", "error");
            return;
        }

        if (password !== confirmPassword) {
            addToast("Las contraseñas no coinciden", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await affiliates.register({
                token,
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phone: phone.trim() ? phone.trim() : undefined,
                password,
            });

            if (res.success) {
                setIsSuccess(true);
                addToast("¡Cuenta creada exitosamente! Redirigiendo a tu panel...", "success");
                setTimeout(() => {
                    router.push("/clients");
                    router.refresh();
                }, 1600);
            } else {
                addToast("Error al registrar", "error");
            }
        } catch (err) {
            addToast(err instanceof Error ? err.message : "Error al procesar el registro", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isValidating) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 animate-pulse flex items-center justify-center text-white shadow-xl shadow-violet-500/25">
                    <Sparkles className="h-6 w-6 animate-spin" />
                </div>
                <p className="text-sm font-medium text-gray-600">Verificando enlace de invitación...</p>
            </div>
        );
    }

    if (tokenError) {
        return (
            <Card className="border-red-200/80 shadow-2xl shadow-red-500/5 backdrop-blur-xl bg-white/95">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 mb-3 shadow-inner">
                        <AlertCircle size={32} />
                    </div>
                    <CardTitle className="text-xl font-bold text-gray-900">Enlace no disponible</CardTitle>
                    <CardDescription className="text-sm text-gray-600 mt-2">
                        {tokenError}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 text-center">
                    <Button 
                        onClick={() => router.push("/login")}
                        className="bg-gray-900 hover:bg-black text-white rounded-xl px-6 py-2.5 shadow-md"
                    >
                        Ir al inicio de sesión
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (isSuccess) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center p-8 space-y-4"
            >
                <div className="mx-auto w-20 h-20 rounded-3xl bg-emerald-50 border-2 border-emerald-300 flex items-center justify-center text-emerald-600 shadow-xl shadow-emerald-500/15">
                    <CheckCircle2 size={40} className="animate-bounce" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">¡Bienvenido a RNV Manager!</h2>
                <p className="text-sm text-gray-600 max-w-sm mx-auto">
                    Tu cuenta como Colaborador ha sido activada. Accediendo a tu panel de clientes asignados...
                </p>
                <div className="pt-4 flex justify-center">
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100/80 text-emerald-800 text-xs font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        Iniciando sesión automáticamente
                    </span>
                </div>
            </motion.div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 ml-1 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-violet-600" />
                    Nombre Completo
                </label>
                <Input
                    type="text"
                    required
                    placeholder="Ej. Carlos Mendoza"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white transition-all text-sm"
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 ml-1 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-violet-600" />
                    Correo Electrónico
                </label>
                <Input
                    type="email"
                    required
                    placeholder="carlos@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white transition-all text-sm"
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 ml-1 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-violet-600" />
                    Teléfono / WhatsApp (opcional)
                </label>
                <Input
                    type="tel"
                    placeholder="Ej. +1 829 555 1234"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11 rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white transition-all text-sm"
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 ml-1 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-violet-600" />
                    Contraseña
                </label>
                <div className="relative">
                    <Input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        placeholder="Mínimo 6 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white transition-all text-sm pr-10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 ml-1 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-violet-600" />
                    Confirmar Contraseña
                </label>
                <Input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Repite tu contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white transition-all text-sm"
                />
            </div>

            <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 mt-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-violet-600/25 transition-all flex items-center justify-center gap-2 group"
            >
                {isSubmitting ? (
                    <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Creando tu cuenta...
                    </span>
                ) : (
                    <>
                        Completar Registro y Entrar
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </>
                )}
            </Button>
        </form>
    );
}

export default function AffiliateRegisterPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 sm:p-6 relative overflow-hidden">
            {/* Background glowing effects */}
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-violet-300 text-xs font-semibold mb-3">
                        <UsersRound size={14} className="text-violet-400" />
                        Invitación de Colaborador · RNV Manager
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        Únete como Afiliado
                    </h1>
                    <p className="text-sm text-slate-300 mt-1.5 max-w-xs mx-auto">
                        Crea tu perfil para gestionar tus clientes asignados, partidas y facturación de servicios.
                    </p>
                </div>

                <Card className="border border-white/10 shadow-2xl shadow-violet-950/50 backdrop-blur-2xl bg-white/95 rounded-3xl overflow-hidden">
                    <CardContent className="p-6 sm:p-8">
                        <Suspense fallback={
                            <div className="py-12 text-center text-gray-500 text-sm animate-pulse">
                                Cargando invitación...
                            </div>
                        }>
                            <RegisterContent />
                        </Suspense>
                    </CardContent>
                </Card>

                <p className="text-center text-xs text-slate-400 mt-6">
                    © {new Date().getFullYear()} RENACE.tech · RNV Manager Alta Disponibilidad
                </p>
            </div>
        </div>
    );
}
