/**
 * RNV Manager - Go API Client
 * All API calls go to /api/* which nginx proxies to the Go backend.
 */

const API_BASE = "/api";

async function request<T>(
    path: string,
    options?: RequestInit
): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        ...options,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }

    return res.json();
}

/** SWR-compatible fetcher for /api paths */
export const fetcher = <T = unknown>(path: string): Promise<T> =>
    request<T>(path.startsWith("/api") ? path.slice(4) : path);

/** Extrae array de respuestas { success, data: T[] } */
export function unwrapList<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === "object" && "data" in res) {
        const d = (res as { data: unknown }).data;
        return Array.isArray(d) ? (d as T[]) : [];
    }
    return [];
}

export const listFetcher = <T>(path: string): Promise<T[]> =>
    fetcher<{ success?: boolean; data?: T[] }>(path).then(unwrapList<T>);

// ── Auth ────────────────────────────────────────────────────────────────────

export const auth = {
    requestOTP: (email: string) =>
        request<{ success: boolean; error?: string }>("/auth/request-otp", {
            method: "POST",
            body: JSON.stringify({ email }),
        }),
    verifyOTP: (email: string, code: string) =>
        request<{ success: boolean; user?: User; error?: string }>("/auth/verify-otp", {
            method: "POST",
            body: JSON.stringify({ email, code }),
        }),
    login: (username: string, password: string) =>
        request<{ success: boolean; token: string; user: User }>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password }),
        }),
    logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
    me: () => request<{ success: boolean; user: User }>("/auth/me"),
};

// ── AI ──────────────────────────────────────────────────────────────────────

export const ai = {
    chat: (
        message: string,
        history: { role: string; content: string }[],
        url?: string
    ) =>
        request<{
            success: boolean;
            response: string;
            executedFunctions?: Array<{ name: string; args?: unknown; result?: { success?: boolean } }>;
            error?: string;
        }>("/ai/chat", {
            method: "POST",
            body: JSON.stringify({ message, history, url }),
        }).then((data) => {
            if (!data.success) throw new Error(data.error || "Error del asistente");
            return data;
        }),
};

// ── VPS ─────────────────────────────────────────────────────────────────────

export const vps = {
    list: () => request<ApiList<VPS>>("/vps"),
    get: (id: string) => request<ApiItem<VPS>>(`/vps/${id}`),
    create: (data: Partial<VPS>) =>
        request<ApiItem<VPS>>("/vps", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<VPS>) =>
        request<ApiItem<VPS>>(`/vps/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request<ApiSuccess>(`/vps/${id}`, { method: "DELETE" }),
    listServices: (vpsId: string) => request<ApiList<Service>>(`/vps/${vpsId}/services`),
    createService: (vpsId: string, data: Partial<Service>) =>
        request<ApiItem<Service>>(`/vps/${vpsId}/services`, { method: "POST", body: JSON.stringify(data) }),
};

// ── Clients ─────────────────────────────────────────────────────────────────

export const clients = {
    list: () => request<ApiList<Client>>("/clients"),
    get: (id: string) => request<ApiItem<Client>>(`/clients/${id}`),
    create: (data: Partial<Client>) =>
        request<ApiItem<Client>>("/clients", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Client>) =>
        request<ApiItem<Client>>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request<ApiSuccess>(`/clients/${id}`, { method: "DELETE" }),
};

// ── Services ─────────────────────────────────────────────────────────────────

export const services = {
    list: () => request<ApiList<Service>>("/services"),
    get: (id: string) => request<ApiItem<Service>>(`/services/${id}`),
    create: (data: Partial<Service>) =>
        request<ApiItem<Service>>("/services", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Service>) =>
        request<ApiItem<Service>>(`/services/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request<ApiSuccess>(`/services/${id}`, { method: "DELETE" }),
    control: (id: string, action: "start" | "stop" | "restart" | "status") =>
        request<{ success: boolean; output?: string; error?: string; status?: string }>(
            `/services/${id}/control`,
            { method: "POST", body: JSON.stringify({ action }) }
        ),
    overview: () =>
        request<{ success: boolean; data: ServiceOverviewGroup[]; count: number }>("/services/overview"),
    scan: (vpsId?: string) =>
        request<{
            success: boolean;
            results: VPSScanResult[];
            totals: { found: number; created: number; updated: number; vps: number };
        }>(`/services/scan${vpsId ? "?vpsId=" + vpsId : ""}`, { method: "POST" }),
};

// ── SSH ─────────────────────────────────────────────────────────────────────

export const ssh = {
    exec: (params: { host: string; port?: number; username: string; password: string; command: string }) =>
        request<SSHResult>("/ssh", { method: "POST", body: JSON.stringify({ ...params, action: "exec" }) }),
    test: (params: { host: string; port?: number; username: string; password: string }) =>
        request<{ success: boolean; message: string; latency: number }>("/ssh", {
            method: "POST",
            body: JSON.stringify({ ...params, action: "test" }),
        }),
    info: (params: { host: string; port?: number; username: string; password: string }) =>
        request<{ success: boolean; data: ServerInfo }>("/ssh", {
            method: "POST",
            body: JSON.stringify({ ...params, action: "info" }),
        }),
    // WebSocket terminal URL
    terminalUrl: () => {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${proto}//${window.location.host}/api/ssh/terminal`;
    },
};

// ── Monitor ─────────────────────────────────────────────────────────────────

export const monitor = {
    metrics: (params: { host: string; port?: number; username: string; password: string }) =>
        request<{ success: boolean; data: Record<string, string> }>("/monitor", {
            method: "POST",
            body: JSON.stringify(params),
        }),
};

// ── Audit ────────────────────────────────────────────────────────────────────

export const audit = {
    list: (params?: { page?: number; limit?: number; action?: string; entity?: string; search?: string }) => {
        const q = new URLSearchParams(params as Record<string, string>).toString();
        return request<AuditListResponse>(`/audit${q ? "?" + q : ""}`);
    },
    stats: () => request<{ success: boolean; data: AuditStats }>("/audit/stats"),
};

// ── Users ─────────────────────────────────────────────────────────────────────

export const users = {
    list: () => request<ApiList<User>>("/users"),
    create: (data: { username: string; email: string; password: string; name: string; role?: string }) =>
        request<ApiItem<User>>("/users", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<ApiSuccess>(`/users/${id}`, { method: "DELETE" }),
};

// ── Notifications ────────────────────────────────────────────────────────────

export const notifications = {
    list: (unreadOnly?: boolean) =>
        request<{ success: boolean; data: Notification[]; unreadCount: number }>(
            `/notifications${unreadOnly ? "?unread=true" : ""}`
        ),
    markRead: (ids?: string[]) =>
        request<ApiSuccess>("/notifications", {
            method: "PUT",
            body: JSON.stringify(ids ? { ids } : { all: true }),
        }),
};

// ── Stats ─────────────────────────────────────────────────────────────────────

export const stats = {
    dashboard: () => request<{ success: boolean; data: DashboardStats }>("/stats"),
};

// ── Settings ─────────────────────────────────────────────────────────────────

export const settings = {
    get: (key?: string) => request<{ success: boolean; data: AppSettings | AppSettings[] }>(`/settings${key ? "?key=" + key : ""}`),
    set: (key: string, value: string, category?: string) =>
        request<ApiItem<AppSettings>>("/settings", { method: "POST", body: JSON.stringify({ key, value, category }) }),
    delete: (key: string) => request<ApiSuccess>(`/settings?key=${key}`, { method: "DELETE" }),
};

// ── Billing ───────────────────────────────────────────────────────────────────

export const billing = {
    summary: () => request<{ success: boolean; data: BillingSummary }>("/billing"),
    overdue: () =>
        request<{ success: boolean; data: OverdueClient[]; count: number }>("/billing/overdue"),
    createPayment: (data: Partial<Payment>) =>
        request<ApiItem<Payment>>("/billing", { method: "POST", body: JSON.stringify(data) }),
    remind: (data: { clientId?: string; all?: boolean }) =>
        request<{ success: boolean; sent: number; skipped: number; failed: number; errors?: string[] }>(
            "/billing/remind",
            { method: "POST", body: JSON.stringify(data) }
        ),
};

// ── Calendar ──────────────────────────────────────────────────────────────────

export const calendar = {
    events: (from?: string, to?: string) =>
        request<{ success: boolean; data: CalendarEvent[]; count: number }>(
            `/calendar?from=${from || ""}&to=${to || ""}`
        ),
    listTasks: (status?: string) =>
        request<{ success: boolean; data: ScheduledTask[] }>(
            `/calendar/tasks${status ? "?status=" + status : ""}`
        ),
    createTask: (data: Partial<ScheduledTask> & { title: string; scheduledAt: string }) =>
        request<{ success: boolean; data: ScheduledTask }>("/calendar/tasks", {
            method: "POST", body: JSON.stringify(data),
        }),
    cancelTask: (id: string) =>
        request<{ success: boolean }>(`/calendar/tasks/${id}`, { method: "DELETE" }),
};

// ── History ───────────────────────────────────────────────────────────────────

export const history = {
    list: (year?: number) => request<ApiList<RevenueHistory>>(`/history${year ? "?year=" + year : ""}`),
    upsert: (data: Partial<RevenueHistory>) =>
        request<ApiItem<RevenueHistory>>("/history", { method: "POST", body: JSON.stringify(data) }),
};

// ── Types ─────────────────────────────────────────────────────────────────────

type ApiList<T> = { success: boolean; data: T[]; count?: number };
type ApiItem<T> = { success: boolean; data: T };
type ApiSuccess = { success: boolean; message: string };

export interface User {
    id: string;
    username: string;
    email: string;
    name: string;
    role: "superadmin" | "admin" | "viewer";
    avatar?: string;
    isActive: boolean;
    lastLoginAt?: string;
    createdAt: string;
}

export interface Client {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    companyName?: string;
    notes?: string;
    isActive: boolean;
    billingCycle?: "monthly" | "annual";
    monthlyFee: number;
    annualFee?: number;
    currency: string;
    paymentDay: number;
    paymentMonth?: number;
    totalMonthlyCost: number;
    odooPartnerId?: number;
    vpsList?: VPS[];
    services?: Service[];
    payments?: Payment[];
    calculatedCosts?: { vps: number; services: number; baseFee: number; total: number };
    syncedWithOdoo?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface VPS {
    id: string;
    name: string;
    ipAddress: string;
    provider: string;
    hostingerId?: string;
    status: string;
    sshUser: string;
    sshPort: number;
    monthlyCost: number;
    configFiles: string[];
    clientId?: string;
    client?: Client;
    services?: Service[];
    createdAt: string;
    updatedAt: string;
}

export interface Service {
    id: string;
    name: string;
    type: string;
    port?: number;
    url?: string;
    status: string;
    monthlyCost: number;
    vpsId?: string;
    clientId?: string;
    vps?: VPS;
    client?: Client;
    createdAt: string;
    updatedAt: string;
}

export interface ServiceOverviewGroup {
    id: string;
    name: string;
    ipAddress: string;
    status: string;
    clientId?: string;
    client?: Client;
    services: Service[];
}

export interface VPSScanResult {
    vpsId: string;
    vpsName: string;
    ip: string;
    success: boolean;
    error?: string;
    found: { name: string; type: string; status: string }[];
    created: number;
    updated: number;
}

export interface OverdueClient {
    id: string;
    name: string;
    email?: string;
    amount: number;
    paymentDay: number;
    paymentMonth?: number;
    billingCycle?: string;
    daysLate: number;
    hasEmail: boolean;
}

export interface CalendarEvent {
    id: string;
    type: "due" | "overdue" | "paid" | "task" | "reminder";
    title: string;
    description?: string;
    date: string;
    clientId?: string;
    clientName?: string;
    amount?: number;
    status?: string;
    billingCycle?: string;
}

export interface ScheduledTask {
    id: string;
    title: string;
    description?: string;
    type: string;
    scheduledAt: string;
    clientId?: string;
    status: string;
    notifyEmail: boolean;
}

export interface Payment {
    id: string;
    amount: number;
    currency: string;
    date: string;
    status: string;
    clientId: string;
    notes?: string;
    createdAt: string;
}

export interface RevenueHistory {
    id: string;
    year: number;
    month: number;
    revenue: number;
    expenses: number;
    clients: number;
    vps: number;
    services: number;
}

export interface AppSettings {
    id: string;
    key: string;
    value: string;
    category: string;
}

export interface Notification {
    id: string;
    type: "alert" | "info" | "warning" | "success";
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
}

export interface SSHResult {
    success: boolean;
    output: string;
    error?: string;
    exitCode: number;
}

export interface ServerInfo {
    hostname: string;
    uptime: string;
    memory: { total: string; used: string; free: string };
    disk: { total: string; used: string; free: string; percent: string };
    cpu: string;
    os: string;
}

export interface AuditLog {
    id: string;
    action: string;
    entity: string;
    entityId?: string;
    description: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userId?: string;
    user?: User;
    createdAt: string;
}

export interface AuditListResponse {
    success: boolean;
    data: AuditLog[];
    pagination: { total: number; page: number; limit: number; pages: number };
}

export interface AuditStats {
    totals: { total: number; today: number; week: number; month: number };
    actionBreakdown: Array<{ action: string; count: number }>;
    entityBreakdown: Array<{ entity: string; count: number }>;
    recentActivity: AuditLog[];
}

export interface DashboardStats {
    totals: {
        clients: number;
        activeClients: number;
        vps: number;
        services: number;
        monthlyRevenue: number;
        monthlyExpense: number;
        netProfit: number;
    };
    revenueHistory: RevenueHistory[];
    recentActivity: AuditLog[];
    vpsStatus: Array<{ status: string; count: number }>;
}

export interface BillingSummary {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    clientCount: number;
    upcomingPayments: Client[];
}
