import { NextResponse } from "next/server";
import { getSession, getSettlements } from "@/lib/store/sessionStore";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "unknown session" }, { status: 404 });
  }
  const settlements = await getSettlements(id);
  return NextResponse.json({ session, settlements });
}
