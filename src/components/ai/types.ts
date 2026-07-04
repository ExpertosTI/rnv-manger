export interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    executedFunctions?: ExecutedFunction[];
}

export interface ExecutedFunction {
    name: string;
    args?: unknown;
    result?: { success?: boolean; [key: string]: unknown };
}

export type MascotState =
    | "idle"
    | "thinking"
    | "success"
    | "error"
    | "barrel-roll"
    | "shivering"
    | "celebrate";

export type RichBlockType =
    | "text"
    | "action-buttons"
    | "confirm"
    | "summary-card"
    | "quick-actions"
    | "navigate"
    | "metrics-chart"
    | "animate"
    | "theme";

export interface RichBlock {
    type: RichBlockType;
    content: string;
    items?: string[];
}

export function genId(): string {
    return Math.random().toString(36).substring(2, 10);
}
