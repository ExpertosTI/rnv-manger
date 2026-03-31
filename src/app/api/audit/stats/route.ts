import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalLogs, todayLogs, weekLogs, monthLogs, actionBreakdown, entityBreakdown, recentActivity] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: thisWeek } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.auditLog.groupBy({
        by: ["action"],
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ["entity"],
        _count: { entity: true },
        orderBy: { _count: { entity: "desc" } },
      }),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, avatar: true } } },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totals: { total: totalLogs, today: todayLogs, week: weekLogs, month: monthLogs },
        actionBreakdown: actionBreakdown.map((a) => ({ action: a.action, count: a._count.action })),
        entityBreakdown: entityBreakdown.map((e) => ({ entity: e.entity, count: e._count.entity })),
        recentActivity,
      },
    });
  } catch (error) {
    console.error("[Audit Stats] Error:", error);
    return NextResponse.json({ success: false, error: "Error fetching audit stats" }, { status: 500 });
  }
}
