import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword, createSession, setSessionCookie, ensureDefaultUser } from "@/lib/auth";
import { logAudit, getClientIP } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Ensure default user exists on first login
    await ensureDefaultUser();

    // Support legacy login with just password (backward compatible)
    if (!username && password) {
      // Legacy mode: check master password and log in as first admin
      const masterPassword = process.env.MASTER_PASSWORD || "admin123";
      if (password === masterPassword) {
        let user = await prisma.user.findFirst({ where: { role: "superadmin" } });
        if (!user) {
          await ensureDefaultUser();
          user = await prisma.user.findFirst({ where: { role: "superadmin" } });
        }
        if (user) {
          const token = await createSession(user.id, request);
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
          await logAudit({
            action: "LOGIN",
            entity: "user",
            entityId: user.id,
            description: `${user.name} inició sesión (modo legacy)`,
            ipAddress: getClientIP(request),
            userId: user.id,
          });
          const response = NextResponse.json({
            success: true,
            user: { id: user.id, name: user.name, username: user.username, role: user.role, avatar: user.avatar },
          });
          return setSessionCookie(response, token);
        }
      }
      return NextResponse.json({ success: false, message: "Contraseña incorrecta" }, { status: 401 });
    }

    // New mode: username + password
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username },
          { email: username },
        ],
        isActive: true,
      },
    });

    if (!user) {
      await logAudit({
        action: "LOGIN",
        entity: "user",
        description: `Intento de login fallido para: ${username}`,
        ipAddress: getClientIP(request),
      });
      return NextResponse.json({ success: false, message: "Usuario o contraseña incorrectos" }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      await logAudit({
        action: "LOGIN",
        entity: "user",
        entityId: user.id,
        description: `Contraseña incorrecta para: ${user.username}`,
        ipAddress: getClientIP(request),
        userId: user.id,
      });
      return NextResponse.json({ success: false, message: "Usuario o contraseña incorrectos" }, { status: 401 });
    }

    const token = await createSession(user.id, request);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await logAudit({
      action: "LOGIN",
      entity: "user",
      entityId: user.id,
      description: `${user.name} inició sesión`,
      ipAddress: getClientIP(request),
      userId: user.id,
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, username: user.username, role: user.role, avatar: user.avatar },
    });
    return setSessionCookie(response, token);
  } catch (error) {
    console.error("[Auth] Login error:", error);
    return NextResponse.json({ success: false, message: "Error del servidor" }, { status: 500 });
  }
}
