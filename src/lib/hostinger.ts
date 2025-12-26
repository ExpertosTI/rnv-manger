import { apiCache, CACHE_KEYS } from "./cache";

const HOSTINGER_API_BASE = "https://developers.hostinger.com";
const API_TIMEOUT = 10000; // 10 seconds timeout

export interface HostingerVPS {
    id: number;
    hostname: string;
    state: string;
    cpus: number;
    memory: number;
    disk: number;
    bandwidth: number;
    ns1?: string;
    ns2?: string;
    created_at: string;
    ipv4?: { id: number; address: string }[];
    ipv6?: { id: number; address: string }[];
    template?: { id: number; name: string; description: string };
    data_center?: { id: number; name: string; location: string };
    plan?: { id: number; name: string };
}

interface HostingerVPSResponse {
    data: HostingerVPS[];
    meta?: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

// Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
            throw new Error("Request timeout - Hostinger API took too long to respond");
        }
        throw error;
    }
}

// Retry with exponential backoff
async function fetchWithRetry<T>(
    fetchFn: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fetchFn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
    throw new Error("Max retries reached");
}

export async function getHostingerVPSList(forceRefresh: boolean = false): Promise<HostingerVPS[]> {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cached = apiCache.get<HostingerVPS[]>(CACHE_KEYS.HOSTINGER_VPS);
        if (cached) {
            console.log("✅ Returning cached VPS data");
            return cached;
        }
    }

    const token = process.env.HOSTINGER_API_TOKEN;

    if (!token) {
        throw new Error("HOSTINGER_API_TOKEN not configured. Go to Settings to add your API key.");
    }

    console.log("🔄 Fetching VPS from Hostinger API...");

    const fetchVPS = async (): Promise<HostingerVPS[]> => {
        const allVPS: HostingerVPS[] = [];
        let currentPage = 1;
        let hasMorePages = true;

        while (hasMorePages) {
            const url = `${HOSTINGER_API_BASE}/api/vps/v1/virtual-machines?page=${currentPage}`;

            const response = await fetchWithTimeout(
                url,
                {
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    cache: "no-store",
                },
                API_TIMEOUT
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error("❌ Hostinger API Error:", response.status, errorText);
                throw new Error(`Hostinger API error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();

            // Handle both array response and {data: [...]} response
            const vpsList: HostingerVPS[] = Array.isArray(data) ? data : (data.data || []);

            if (vpsList.length > 0) {
                allVPS.push(...vpsList);
            }

            // Check pagination from meta if available
            if (data.meta && currentPage < data.meta.last_page) {
                currentPage++;
            } else {
                hasMorePages = false;
            }
        }

        return allVPS;
    };

    try {
        const vpsList = await fetchWithRetry(fetchVPS, 2, 2000);

        // Cache the result for 5 minutes
        apiCache.set(CACHE_KEYS.HOSTINGER_VPS, vpsList, 5 * 60 * 1000);
        console.log(`✅ Cached ${vpsList.length} VPS servers`);

        return vpsList;
    } catch (error: any) {
        console.error("❌ Failed to fetch VPS:", error.message);
        throw error;
    }
}

export function invalidateVPSCache(): void {
    apiCache.invalidate(CACHE_KEYS.HOSTINGER_VPS);
    console.log("🗑️ VPS cache invalidated");
}

export async function getHostingerVPSDetails(vpsId: string): Promise<HostingerVPS | null> {
    const token = process.env.HOSTINGER_API_TOKEN;

    if (!token) {
        throw new Error("HOSTINGER_API_TOKEN not configured");
    }

    try {
        const response = await fetchWithTimeout(
            `${HOSTINGER_API_BASE}/api/vps/v1/virtual-machines/${vpsId}`,
            {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            },
            API_TIMEOUT
        );

        if (!response.ok) {
            console.error("Hostinger API Error:", response.status);
            return null;
        }

        const data = await response.json();
        return data.data || data;
    } catch (error) {
        console.error("Failed to fetch VPS details:", error);
        return null;
    }
}

export async function restartHostingerVPS(vpsId: string): Promise<{ success: boolean; message: string }> {
    const token = process.env.HOSTINGER_API_TOKEN;

    if (!token) {
        return { success: false, message: "API token not configured" };
    }

    try {
        const response = await fetchWithTimeout(
            `${HOSTINGER_API_BASE}/api/vps/v1/virtual-machines/${vpsId}/restart`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            },
            API_TIMEOUT
        );

        if (response.ok) {
            // Invalidate cache after restart
            invalidateVPSCache();
            return { success: true, message: "VPS restart initiated" };
        } else {
            return { success: false, message: `Error: ${response.status}` };
        }
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}
