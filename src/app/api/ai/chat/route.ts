/**
 * AI Chat API Endpoint
 * Handles conversation with Gemini AI and function execution
 */

import { NextRequest, NextResponse } from "next/server";
import { createChatSession, getCandidateModels, getGeminiClient } from "@/lib/gemini";
import { functionHandlers } from "@/lib/ai-functions";
import prisma from "@/lib/prisma";

// Maximum iterations to prevent infinite loops
const MAX_FUNCTION_CALLS = 5;

export async function POST(request: NextRequest) {
    try {
        const client = await getGeminiClient();
        if (!client) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Gemini no está configurado. Agrega GEMINI_API_KEY en ajustes."
                },
                { status: 503 }
            );
        }
        const body = await request.json();
        const { message, history = [], url } = body;

        if (!message || typeof message !== "string") {
            return NextResponse.json(
                { success: false, error: "Message is required" },
                { status: 400 }
            );
        }

        // Convertir historial al formato de Gemini
        // Limit history to last 20 messages to save tokens and avoid context limit
        // Also ensure system instructions aren't duplicated if they were part of history
        const relevantHistory = history.slice(-20);

        const formattedHistory = relevantHistory.map((msg: any) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
        }));

        // Gemini requires the first message to be role 'user' — drop leading 'model' entries
        while (formattedHistory.length > 0 && formattedHistory[0].role === "model") {
            formattedHistory.shift();
        }

        const runChat = async (modelName: string) => {
            const chat = await createChatSession(formattedHistory, modelName);
            let contextPrefix = "";
            if (url) {
                contextPrefix = `[CONTEXTO DE NAVEGACIÓN: El usuario está viendo la ruta: '${url}'. Si el usuario usa términos como "este cliente", "este VPS", "aquí" o "este servicio", asume que se refiere a la entidad visible en esta ruta.]\n\n`;
            }

            // Inject stored memories for personalized context
            try {
                const memories = await prisma.aIMemory.findMany({
                    orderBy: [{ frequency: "desc" }, { lastUsed: "desc" }],
                    take: 10,
                });
                if (memories.length > 0) {
                    const memoryText = memories.map((m: any) => `- [${m.type}] ${m.content}`).join("\n");
                    contextPrefix += `[MEMORIA DEL USUARIO — Datos aprendidos sobre cómo trabaja este usuario:]\n${memoryText}\n\n`;
                }
            } catch { /* memories not available yet */ }
            let result = await chat.sendMessage(contextPrefix + message);
            let response = result.response;
            let iterations = 0;
            const executedFunctions: any[] = [];

            while (iterations < MAX_FUNCTION_CALLS) {
                const functionCalls = response.functionCalls();

                if (!functionCalls || functionCalls.length === 0) {
                    break;
                }

                const functionResults = await Promise.all(
                    functionCalls.map(async (fc) => {
                        const functionName = fc.name;
                        const args = fc.args;

                        console.log(`[AI] Ejecutando función: ${functionName}`, args);

                        const handler = functionHandlers[functionName];
                        if (!handler) {
                            return {
                                name: functionName,
                                response: {
                                    success: false,
                                    error: `Función ${functionName} no implementada`
                                }
                            };
                        }

                        const functionResult = await handler(args);

                        executedFunctions.push({
                            name: functionName,
                            args,
                            result: functionResult
                        });

                        return {
                            name: functionName,
                            response: functionResult
                        };
                    })
                );

                result = await chat.sendMessage(
                    functionResults.map(fr => ({
                        functionResponse: fr
                    }))
                );

                response = result.response;
                iterations++;
            }

            return {
                finalText: response.text(),
                executedFunctions,
                iterations
            };
        };

        const listSupportedModels = async () => {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                return [];
            }
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" }
                });
                if (!response.ok) {
                    return [];
                }
                const data = await response.json();
                if (!data || !Array.isArray(data.models)) {
                    return [];
                }
                return data.models
                    .filter((model: any) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent"))
                    .map((model: any) => (typeof model.name === "string" ? model.name.replace(/^models\//, "") : ""))
                    .filter((name: string) => name.length > 0);
            } catch {
                return [];
            }
        };

        const triedModels = new Set<string>();
        const candidateModels = getCandidateModels();
        let lastError: any;

        for (const modelName of candidateModels) {
            if (triedModels.has(modelName)) {
                continue;
            }
            triedModels.add(modelName);
            try {
                const { finalText, executedFunctions, iterations } = await runChat(modelName);
                return NextResponse.json({
                    success: true,
                    response: finalText,
                    executedFunctions,
                    iterations
                });
            } catch (error: any) {
                lastError = error;
                const messageText = error?.message || "";
                const modelNotFound = messageText.includes("404")
                    || messageText.includes("not found")
                    || messageText.includes("generateContent")
                    || messageText.includes("models/");
                if (modelNotFound) {
                    console.warn("[AI Chat] Model not available:", modelName);
                }
                if (!modelNotFound) {
                    throw error;
                }
            }
        }

        const availableModels = await listSupportedModels();
        for (const modelName of availableModels) {
            if (triedModels.has(modelName)) {
                continue;
            }
            triedModels.add(modelName);
            try {
                const { finalText, executedFunctions, iterations } = await runChat(modelName);
                return NextResponse.json({
                    success: true,
                    response: finalText,
                    executedFunctions,
                    iterations
                });
            } catch (error: any) {
                lastError = error;
                const messageText = error?.message || "";
                const modelNotFound = messageText.includes("404")
                    || messageText.includes("not found")
                    || messageText.includes("generateContent")
                    || messageText.includes("models/");
                if (modelNotFound) {
                    console.warn("[AI Chat] Model not available:", modelName);
                    continue;
                }
                throw error;
            }
        }

        throw lastError;

    } catch (error: any) {
        console.error("[AI Chat] Error:", error);

        // Handle specific Gemini errors
        if (error.message?.includes("API key")) {
            return NextResponse.json(
                {
                    success: false,
                    error: "API key de Gemini no configurada correctamente"
                },
                { status: 500 }
            );
        }

        if (error.message?.includes("429") || error.message?.includes("Quota") || error.message?.includes("Resource has been exhausted")) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Servicio saturado temporalmente (Quota Exceeded). Por favor intenta de nuevo en unos minutos o contacta soporte."
                },
                { status: 429 }
            );
        }

        if (error.message?.includes("unregistered callers")) {
            return NextResponse.json(
                {
                    success: false,
                    error: "La API key de Gemini no está habilitada para llamadas no registradas. Activa el acceso en Google AI Studio o usa una clave válida."
                },
                { status: 403 }
            );
        }

        if (error.message?.includes("503")) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Servicio AI temporalmente no disponible. Reintentando..."
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                error: error.message || "Error al procesar el mensaje"
            },
            { status: 500 }
        );
    }
}
