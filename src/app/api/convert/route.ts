import { NextRequest, NextResponse } from "next/server";
import { findRoutes } from "@/lib/pathfinder";
import type { ConvertRequest } from "@/lib/types";

export async function POST(req: NextRequest) {
  let body: ConvertRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { from, to, quantity } = body;

  if (typeof from !== "string" || typeof to !== "string") {
    return NextResponse.json(
      { error: "from and to must be strings" },
      { status: 400 }
    );
  }
  if (typeof quantity !== "number" || !isFinite(quantity)) {
    return NextResponse.json(
      { error: "quantity must be a finite number" },
      { status: 400 }
    );
  }

  const routes = findRoutes(from, to, quantity);
  return NextResponse.json(routes);
}
