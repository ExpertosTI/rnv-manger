import { NextRequest, NextResponse } from "next/server";
import prisma from "./prisma";
import crypto from "crypto";

// Hash password using crypto (no external dependency needed for simple hashing)
export async function hashPassword(password: string): Promise<string> {
  // We'll use bcryptjs when available, fallback to crypto
  try {
    const bcrypt = await import("bcryptjs");
    return bcrypt.hash(password, 12);
  } catch {
    // Fallback: use PBKDF2
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return `pbkdf2:${salt}:${hash}`;
  }
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  if (hashedPassword.startsWith("pbkdf2:")) {
    const [, salt, hash] = hashedPassword.split(":");
    const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return verify === hash;
  }
  try {
    const bcrypt = await import("bcryptjs");
    return bcrypt.compare(password, hashedPassword);
  } catch {
    return false;
  }
}

// Generate a secure session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Create a new session for a user
export async function createSession(userId: string, request?: NextRequest): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.create({
    data: {
      token,
      userId,
      ipAddress: request ? getIPFromRequest(request) : undefined,
      userAgent: request?.headers.get("user-agent") ?? undefined,
      expiresAt,
    },
  });

  return token;
}

// Validate a session token and return the user
export async function validateSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    // Clean up expired session
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session.user;
}

// Delete a session (logout)
export async function deleteSession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

// Get current user from request cookies
export async function getCurrentUser(request: NextRequest) {
  const token = request.cookies.get("rnv_session")?.value;
  if (!token || token === "authenticated") return null; // Legacy session
  return validateSession(token);
}

// Helper to get IP from request
function getIPFromRequest(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Seed the default admin user if no users exist
export async function ensureDefaultUser(): Promise<void> {
  const count = await prisma.user.count();
  if (count === 0) {
    const masterPassword = process.env.MASTER_PASSWORD || "admin123";
    const hashed = await hashPassword(masterPassword);
    await prisma.user.create({
      data: {
        username: "admin",
        email: "admin@renace.tech",
        password: hashed,
        name: "Administrador",
        role: "superadmin",
      },
    });
    console.log("[Auth] Default admin user created");
  }
}

// Set session cookie on response
export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set("rnv_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });
  return response;
}

// Clear session cookie
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set("rnv_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
