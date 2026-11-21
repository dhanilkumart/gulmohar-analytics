import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 }) };
  }
  if (user.role !== "admin" && user.role !== "manager") {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Admin or Manager privileges required for master data management" },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/**
 * GET /api/admin/reasons?type=wastage|breakage|all&isActive=all|true|false
 * Lists configured reasons for wastage and/or breakage.
 */
export async function GET(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const isActiveParam = searchParams.get("isActive");

    const activeFilter: { isActive?: boolean } = {};
    if (isActiveParam !== null && isActiveParam !== undefined && isActiveParam !== "all") {
      activeFilter.isActive = isActiveParam === "true";
    }

    let wastageReasons: any[] = [];
    let breakageReasons: any[] = [];

    if (type === "all" || type === "wastage") {
      wastageReasons = await prisma.wastageReason.findMany({
        where: {
          organizationId: user!.organizationId,
          ...activeFilter,
        },
        orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
      });
    }

    if (type === "all" || type === "breakage") {
      breakageReasons = await prisma.breakageReason.findMany({
        where: {
          organizationId: user!.organizationId,
          ...activeFilter,
        },
        orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
      });
    }

    return NextResponse.json({
      success: true,
      wastageReasons,
      breakageReasons,
    });
  } catch (err: any) {
    console.error("GET /api/admin/reasons error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/reasons
 * Create a new wastage or breakage reason.
 * Body: { type: "wastage" | "breakage", code: string, label: string, description?: string, displayOrder?: number, isActive?: boolean }
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { type, code, label, description, displayOrder, isActive } = body;

    if (type !== "wastage" && type !== "breakage") {
      return NextResponse.json({ error: "Invalid reason type. Must be 'wastage' or 'breakage'" }, { status: 400 });
    }

    const sanitizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    const sanitizedLabel = typeof label === "string" ? label.trim() : "";

    if (!sanitizedCode || !sanitizedLabel) {
      return NextResponse.json({ error: "Code and Label are required" }, { status: 400 });
    }

    if (type === "wastage") {
      const existing = await prisma.wastageReason.findUnique({
        where: {
          organizationId_code: {
            organizationId: user!.organizationId,
            code: sanitizedCode,
          },
        },
      });
      if (existing) {
        return NextResponse.json({ error: `Wastage reason with code '${sanitizedCode}' already exists` }, { status: 400 });
      }

      const created = await prisma.wastageReason.create({
        data: {
          organizationId: user!.organizationId,
          code: sanitizedCode,
          label: sanitizedLabel,
          description: description ? String(description).trim() : null,
          displayOrder: Number(displayOrder) || 0,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });

      return NextResponse.json({ success: true, reason: created });
    } else {
      const existing = await prisma.breakageReason.findUnique({
        where: {
          organizationId_code: {
            organizationId: user!.organizationId,
            code: sanitizedCode,
          },
        },
      });
      if (existing) {
        return NextResponse.json({ error: `Breakage reason with code '${sanitizedCode}' already exists` }, { status: 400 });
      }

      const created = await prisma.breakageReason.create({
        data: {
          organizationId: user!.organizationId,
          code: sanitizedCode,
          label: sanitizedLabel,
          description: description ? String(description).trim() : null,
          displayOrder: Number(displayOrder) || 0,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });

      return NextResponse.json({ success: true, reason: created });
    }
  } catch (err: any) {
    console.error("POST /api/admin/reasons error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/reasons
 * Update an existing reason.
 * Body: { type: "wastage" | "breakage", id: string, code?: string, label?: string, description?: string, displayOrder?: number, isActive?: boolean }
 */
export async function PUT(request: Request) {
  try {
    const { user, errorResponse } = await requireAdminUser();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { type, id, code, label, description, displayOrder, isActive } = body;

    if (type !== "wastage" && type !== "breakage") {
      return NextResponse.json({ error: "Invalid reason type. Must be 'wastage' or 'breakage'" }, { status: 400 });
    }
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Reason ID is required" }, { status: 400 });
    }

    if (type === "wastage") {
      const existing = await prisma.wastageReason.findFirst({
        where: { id, organizationId: user!.organizationId },
      });
      if (!existing) {
        return NextResponse.json({ error: "Wastage reason not found" }, { status: 404 });
      }

      const data: Prisma.WastageReasonUpdateInput = {};
      if (code !== undefined) {
        const sanitizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
        if (!sanitizedCode) return NextResponse.json({ error: "Code cannot be empty" }, { status: 400 });
        if (sanitizedCode !== existing.code) {
          const duplicate = await prisma.wastageReason.findUnique({
            where: { organizationId_code: { organizationId: user!.organizationId, code: sanitizedCode } },
          });
          if (duplicate) return NextResponse.json({ error: `Code '${sanitizedCode}' already exists` }, { status: 400 });
          data.code = sanitizedCode;
        }
      }
      if (label !== undefined) {
        const sanitizedLabel = typeof label === "string" ? label.trim() : "";
        if (!sanitizedLabel) return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 });
        data.label = sanitizedLabel;
      }
      if (description !== undefined) {
        data.description = description ? String(description).trim() : null;
      }
      if (displayOrder !== undefined) {
        data.displayOrder = Number(displayOrder) || 0;
      }
      if (isActive !== undefined) {
        data.isActive = Boolean(isActive);
      }

      const updated = await prisma.wastageReason.update({
        where: { id },
        data,
      });

      return NextResponse.json({ success: true, reason: updated });
    } else {
      const existing = await prisma.breakageReason.findFirst({
        where: { id, organizationId: user!.organizationId },
      });
      if (!existing) {
        return NextResponse.json({ error: "Breakage reason not found" }, { status: 404 });
      }

      const data: Prisma.BreakageReasonUpdateInput = {};
      if (code !== undefined) {
        const sanitizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
        if (!sanitizedCode) return NextResponse.json({ error: "Code cannot be empty" }, { status: 400 });
        if (sanitizedCode !== existing.code) {
          const duplicate = await prisma.breakageReason.findUnique({
            where: { organizationId_code: { organizationId: user!.organizationId, code: sanitizedCode } },
          });
          if (duplicate) return NextResponse.json({ error: `Code '${sanitizedCode}' already exists` }, { status: 400 });
          data.code = sanitizedCode;
        }
      }
      if (label !== undefined) {
        const sanitizedLabel = typeof label === "string" ? label.trim() : "";
        if (!sanitizedLabel) return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 });
        data.label = sanitizedLabel;
      }
      if (description !== undefined) {
        data.description = description ? String(description).trim() : null;
      }
      if (displayOrder !== undefined) {
        data.displayOrder = Number(displayOrder) || 0;
      }
      if (isActive !== undefined) {
        data.isActive = Boolean(isActive);
      }

      const updated = await prisma.breakageReason.update({
        where: { id },
        data,
      });

      return NextResponse.json({ success: true, reason: updated });
    }
  } catch (err: any) {
    console.error("PUT /api/admin/reasons error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

