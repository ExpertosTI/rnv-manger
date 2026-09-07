"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Loader2, User, ArrowRight, Mail, MessageCircle, KeyRound, ShieldCheck, Eye, EyeOff, Smartphone } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "@/lib/api";

type AuthMethod = "password" | "otp";
type OTPChannel = "email" | "whatsapp";

function LoginForm() {
    const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
    
    // Password login state (Collaborators, Affiliates, Admin)
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // OTP login state (Admin OTP)
    const [otpMode, setOtpMode] = useState<"email" | "otp">("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [channel, setChannel] = useState<OTPChannel>("email");
    const [sentChannel, setSentChannel] = useState<OTPChannel>("email");

    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { addToast } = useToast();
    const redirect = searchParams.get("redirect") || "/";

    // Handle Password Login (WhatsApp / Email / Username)
    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanId = identifier.trim();
        if (!cleanId) {
            addToast("Ingresa tu número de WhatsApp o correo electrónico", "error");
            return;
        }
        if (!password) {
            addToast("Ingresa tu contraseña", "error");
            return;
        }

        setIsLoading(true);
        try {
            const data = await auth.login(cleanId, password);
            if (data.token) {
                localStorage.setItem("rnv_token", data.token);
            }
            const displayName = data.user?.name || data.user?.username || cleanId;
            addToast(`¡Bienvenido, ${displayName}!`, "success");

            // Redirect affiliate / collaborator to /clients by default
            if (data.user?.role === "affiliate" || data.user?.role === "collaborator") {
                router.push(redirect !== "/" ? redirect : "/clients");
            } else {
                router.push(redirect);
            }
            router.refresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            addToast(
                !msg || msg.includes("fetch") ? "Credenciales incorrectas o error de conexión" : msg,
                "error"
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Handle OTP request
    const requestOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!trimmed.includes("@")) {
            addToast(
                "Usa tu email autorizado (ej. expertostird@gmail.com).",
                "error"
            );
            return;
        }
        setIsLoading(true);
        try {
            const res = await auth.requestOTP(trimmed, channel);
            setEmail(trimmed);
            const usedChannel = (res.channel as OTPChannel) || channel;
            setSentChannel(usedChannel);
            if (res.warning) {
                addToast("WhatsApp falló — código enviado al correo. " + res.warning, "warning");
            } else if (usedChannel === "whatsapp") {
                addToast("Código enviado por WhatsApp a 849 y 809 (copia al correo admin)", "success");
            } else {
                addToast("Código enviado a tu correo", "success");
            }
            setOtpMode("otp");
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

    // Handle OTP verify
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
                !msg || msg.includes("fetch") ? "Error de conexión o código inválido" : msg,
                "error"
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* Method Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
                <button
                    type="button"
                    onClick={() => setAuthMethod("password")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                        authMethod === "password"
                            ? "bg-white text-violet-700 shadow-sm border border-slate-200/50"
                            : "text-slate-500 hover:text-slate-900"
                    }`}
                >
                    <KeyRound className="h-4 w-4" />
                    <span>Con Contraseña</span>
                </button>
                <button
                    type="button"
                    onClick={() => setAuthMethod("otp")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                        authMethod === "otp"
                            ? "bg-white text-violet-700 shadow-sm border border-slate-200/50"
                            : "text-slate-500 hover:text-slate-900"
                    }`}
                >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Código OTP</span>
                </button>
            </div>

            <AnimatePresence mode="wait">
                {authMethod === "password" ? (
                    <motion.form
                        key="password-form"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={handlePasswordLogin}
                        className="space-y-4"
                    >
                        {/* WhatsApp / Email Input */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 ml-1">
                                WhatsApp, Correo o Usuario
                            </label>
                            <div className="relative">
                                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Ej. 809 348 7921 o correo@ejemplo.com"
                                    className="pl-11 h-13 border-slate-200 focus:border-violet-500 focus:ring-violet-500 text-base transition-all rounded-xl"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <p className="text-[11px] text-slate-500 px-1">
                                Si te registraste con tu WhatsApp, escribe tu número directamente.
                            </p>
                        </div>

                        {/* Password Input */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 ml-1">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    className="pl-11 pr-11 h-13 border-slate-200 focus:border-violet-500 focus:ring-violet-500 text-base transition-all rounded-xl"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-13 mt-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-base rounded-2xl shadow-xl shadow-indigo-200 transition-all active:scale-[0.98]"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    <span>Iniciar Sesión</span>
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </>
                            )}
                        </Button>
                    </motion.form>
                ) : otpMode === "email" ? (
                    <motion.form
                        key="otp-request-form"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={requestOTP}
                        className="space-y-5"
                    >
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 ml-1">
                                ¿Cómo quieres recibir el código?
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setChannel("email")}
                                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-all ${
                                        channel === "email"
                                            ? "border-violet-500 bg-violet-50 text-violet-700"
                                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                                    }`}
                                >
                                    <Mail className="h-4 w-4" />
                                    Correo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChannel("whatsapp")}
                                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-all ${
                                        channel === "whatsapp"
                                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                                    }`}
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    WhatsApp
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 ml-1">
                                Email de Administrador
                            </label>
                            <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type="email"
                                    inputMode="email"
                                    autoComplete="email"
                                    placeholder="expertostird@gmail.com"
                                    className="pl-11 h-13 border-slate-200 focus:border-violet-500 focus:ring-violet-500 text-base transition-all rounded-xl"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <p className="text-[11px] text-slate-500 px-1">
                                {channel === "whatsapp"
                                    ? "Ingresa tu email registrado. El código OTP se enviará a tus números vinculados."
                                    : "El código OTP se enviará a tu correo."}
                            </p>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-13 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-base rounded-2xl shadow-xl shadow-indigo-200 transition-all active:scale-[0.98]"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    {channel === "whatsapp" ? "Enviar código por WhatsApp" : "Enviar código al correo"}
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </>
                            )}
                        </Button>
                    </motion.form>
                ) : (
                    <motion.form
                        key="otp-verify-form"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={verifyOTP}
                        className="space-y-5"
                    >
                        <div className="space-y-3">
                            <div className="text-center mb-1">
                                <p className="text-xs text-slate-500">
                                    {sentChannel === "whatsapp"
                                        ? "Revisa WhatsApp. Código enviado para:"
                                        : "Hemos enviado un código a:"}
                                </p>
                                <p className="text-sm font-bold text-violet-600">{email}</p>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="000000"
                                    className="pl-11 h-14 border-slate-200 focus:border-violet-500 focus:ring-violet-500 text-center text-2xl tracking-[0.4em] font-mono rounded-xl"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    required
                                    maxLength={6}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <Button
                                type="submit"
                                className="w-full h-13 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-base rounded-2xl shadow-xl shadow-indigo-200 transition-all active:scale-[0.98]"
                                disabled={isLoading || code.length < 6}
                            >
                                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Verificar y Entrar"}
                            </Button>
                            <button
                                type="button"
                                onClick={() => setOtpMode("email")}
                                className="text-xs text-slate-400 hover:text-violet-600 font-medium transition-colors py-1"
                            >
                                &larr; Volver a ingresar email
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>
        </div>
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
                <div className="flex flex-col items-center justify-center mb-6">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        className="w-20 h-20 rounded-3xl p-1 bg-[#0f0e17] border border-violet-500/40 shadow-2xl shadow-violet-500/30 flex items-center justify-center"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo.png" alt="RENACE" className="w-full h-full object-contain rounded-2xl" />
                    </motion.div>
                    <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-100/80 text-violet-700 border border-violet-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        RENACE INFRASTRUCTURE OS
                    </span>
                </div>

                <Card className="border border-slate-200/80 shadow-2xl backdrop-blur-sm bg-white/95 rounded-3xl overflow-hidden">
                    <CardHeader className="space-y-1 text-center pb-2 pt-6">
                        <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">RNV Manager</CardTitle>
                        <CardDescription className="text-sm text-slate-500">Panel Central de Monitoreo & Operaciones</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-3 pb-6">
                        <Suspense fallback={<div className="h-32 animate-pulse bg-slate-50 rounded-xl" />}>
                            <LoginForm />
                        </Suspense>
                    </CardContent>
                </Card>

                <p className="text-center text-xs text-slate-400 mt-6">
                    &copy; {new Date().getFullYear()} RNV Manager &bull; Renace Tech
                </p>
            </motion.div>
        </div>
    );
}
