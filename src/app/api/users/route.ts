import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { logAudit, getClientIP } from "@/lib/audit";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { sessions: true, auditLogs: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Error fetching users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, email, password, name, role } = body;

    if (!username || !email || !password || !name) {
      return NextResponse.json({ success: false, error: "Faltan campos requeridos" }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Usuario o email ya existe" }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        name,
        role: role || "admin",
      },
      select: { id: true, username: true, email: true, name: true, role: true, createdAt: true },
    });

    await logAudit({
      action: "CREATE",
      entity: "user",
      entityId: user.id,
      description: `Usuario creado: ${user.name} (${user.role})`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error) {
    console.error("[Users API] Error:", error);
    return NextResponse.json({ success: false, error: "Error creating user" }, { status: 500 });
  }
}
