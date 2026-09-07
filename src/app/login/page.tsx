"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Loader2, ArrowRight, Mail, MessageCircle, KeyRound, ShieldCheck, Eye, EyeOff, Smartphone, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "@/lib/api";

type AuthMethod = "password" | "otp";
type OTPChannel = "whatsapp" | "email";

function LoginForm() {
    const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
    
    // Password login state (Collaborators, Affiliates, Admin)
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // OTP login state (WhatsApp or Email code login)
    const [otpMode, setOtpMode] = useState<"request" | "verify">("request");
    const [otpTarget, setOtpTarget] = useState("");
    const [code, setCode] = useState("");
    const [channel, setChannel] = useState<OTPChannel>("whatsapp");
    const [sentChannel, setSentChannel] = useState<OTPChannel>("whatsapp");
    const [resendCountdown, setResendCountdown] = useState(0);

    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { addToast } = useToast();
    const redirect = searchParams.get("redirect") || "/";

    // Resend countdown timer
    useEffect(() => {
        if (resendCountdown <= 0) return;
        const timer = setInterval(() => {
            setResendCountdown((prev) => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCountdown]);

    // Switch to WhatsApp OTP when user forgets password
    const handleForgotPassword = () => {
        setAuthMethod("otp");
        setChannel("whatsapp");
        if (identifier.trim()) {
            setOtpTarget(identifier.trim());
        }
        setOtpMode("request");
    };

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
    const requestOTP = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const cleanTarget = otpTarget.trim();
        if (!cleanTarget) {
            addToast(
                channel === "whatsapp"
                    ? "Ingresa tu número de WhatsApp registrado"
                    : "Ingresa tu correo electrónico registrado",
                "error"
            );
            return;
        }

        setIsLoading(true);
        try {
            const res = await auth.requestOTP(cleanTarget, channel);
            const usedChannel = (res.channel as OTPChannel) || channel;
            setSentChannel(usedChannel);
            setResendCountdown(60); // 60s cooldown

            if (res.warning) {
                addToast("WhatsApp no disponible — código enviado al correo. " + res.warning, "warning");
            } else if (usedChannel === "whatsapp") {
                addToast(res.message || "Código enviado a tu WhatsApp", "success");
            } else {
                addToast(res.message || "Código enviado a tu correo", "success");
            }
            setOtpMode("verify");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            addToast(
                !msg || msg.includes("fetch") ? "Error al solicitar código. Verifica tus datos." : msg,
                "error"
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Handle OTP verify
    const verifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanCode = code.trim();
        if (cleanCode.length < 6) {
            addToast("Ingresa el código de 6 dígitos completo", "error");
            return;
        }

        setIsLoading(true);
        try {
            const data = await auth.verifyOTP(otpTarget.trim(), cleanCode);
            if (data.token) {
                localStorage.setItem("rnv_token", data.token);
            }
            const displayName = data.user?.name || data.user?.username || otpTarget;
            addToast(`¡Bienvenido, ${displayName}!`, "success");

            if (data.user?.role === "affiliate" || data.user?.role === "collaborator") {
                router.push(redirect !== "/" ? redirect : "/clients");
            } else {
                router.push(redirect);
            }
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
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80">
                <button
                    type="button"
                    onClick={() => setAuthMethod("password")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                        authMethod === "password"
                            ? "bg-white text-slate-900 shadow-sm border border-slate-200/50"
                            : "text-slate-500 hover:text-slate-900"
                    }`}
                >
                    <KeyRound className="h-4 w-4 text-violet-600" />
                    <span>Con Contraseña</span>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setAuthMethod("otp");
                        if (!otpTarget && identifier) {
                            setOtpTarget(identifier);
                        }
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                        authMethod === "otp"
                            ? "bg-white text-emerald-700 shadow-sm border border-slate-200/50"
                            : "text-slate-500 hover:text-slate-900"
                    }`}
                >
                    <MessageCircle className="h-4 w-4 text-emerald-500" />
                    <span>Código WhatsApp</span>
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
                                Si te registraste por WhatsApp, escribe tu número directamente.
                            </p>
                        </div>

                        {/* Password Input */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between ml-1">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                                    Contraseña
                                </label>
                            </div>
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

                            {/* Forgot Password Link -> Direct WhatsApp Code */}
                            <div className="flex items-center justify-between pt-1 px-1">
                                <span className="text-xs text-slate-500">¿Olvidaste tu contraseña?</span>
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 transition-colors"
                                >
                                    <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>Entrar con código WhatsApp</span>
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
                ) : otpMode === "request" ? (
                    <motion.form
                        key="otp-request-form"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={requestOTP}
                        className="space-y-4"
                    >
                        {/* Channel selector */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 ml-1">
                                Medio de recepción
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setChannel("whatsapp")}
                                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                                        channel === "whatsapp"
                                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                                    }`}
                                >
                                    <MessageCircle className="h-4 w-4 text-emerald-600" />
                                    WhatsApp (Recomendado)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChannel("email")}
                                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                                        channel === "email"
                                            ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                                    }`}
                                >
                                    <Mail className="h-4 w-4 text-violet-600" />
                                    Correo
                                </button>
                            </div>
                        </div>

                        {/* WhatsApp / Email Input */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 ml-1">
                                {channel === "whatsapp" ? "Número de WhatsApp o Celular" : "Correo Electrónico Registrado"}
                            </label>
                            <div className="relative">
                                {channel === "whatsapp" ? (
                                    <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-500" />
                                ) : (
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-violet-500" />
                                )}
                                <Input
                                    type="text"
                                    placeholder={channel === "whatsapp" ? "Ej. 809 348 7921" : "correo@ejemplo.com"}
                                    className="pl-11 h-13 border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 text-base transition-all rounded-xl"
                                    value={otpTarget}
                                    onChange={(e) => setOtpTarget(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <p className="text-[11px] text-slate-500 px-1">
                                {channel === "whatsapp"
                                    ? "Te enviaremos un código de seguridad de 6 dígitos por WhatsApp para entrar de inmediato."
                                    : "Te enviaremos un código de seguridad de 6 dígitos a tu bandeja de entrada."}
                            </p>
                        </div>

                        <Button
                            type="submit"
                            className={`w-full h-13 mt-2 font-bold text-base rounded-2xl shadow-xl transition-all active:scale-[0.98] text-white ${
                                channel === "whatsapp"
                                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-200"
                                    : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-indigo-200"
                            }`}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    <span>{channel === "whatsapp" ? "Enviar Código por WhatsApp" : "Enviar Código al Correo"}</span>
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
                        className="space-y-4"
                    >
                        <div className="space-y-3">
                            <div className="text-center p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-xs text-slate-500">
                                    {sentChannel === "whatsapp"
                                        ? "Código enviado por WhatsApp a:"
                                        : "Código enviado a tu correo:"}
                                </p>
                                <p className="text-sm font-bold text-slate-800 mt-0.5">{otpTarget}</p>
                                <p className="text-[11px] text-slate-400 mt-1">Válido por 5 minutos</p>
                            </div>

                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="000000"
                                    className="pl-11 h-14 border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 text-center text-2xl tracking-[0.4em] font-mono rounded-xl font-bold"
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
                                className="w-full h-13 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-base rounded-2xl shadow-xl shadow-emerald-200 transition-all active:scale-[0.98]"
                                disabled={isLoading || code.length < 6}
                            >
                                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Verificar y Entrar"}
                            </Button>

                            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                                <button
                                    type="button"
                                    onClick={() => setOtpMode("request")}
                                    className="text-slate-500 hover:text-slate-900 transition-colors"
                                >
                                    &larr; Cambiar destino
                                </button>
                                <button
                                    type="button"
                                    onClick={() => requestOTP()}
                                    disabled={isLoading || resendCountdown > 0}
                                    className="font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                    <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
                                    {resendCountdown > 0 ? `Reenviar en ${resendCountdown}s` : "Reenviar código"}
                                </button>
                            </div>
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
                        <CardDescription className="text-sm text-slate-500">Acceso Seguro al Panel de Operaciones</CardDescription>
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
