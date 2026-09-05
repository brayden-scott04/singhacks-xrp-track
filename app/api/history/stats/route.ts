import { NextResponse } from "next/server";
import { historyStore } from "@/lib/store/historyStore";

export async function GET() {
  return NextResponse.json(historyStore.getHistoryStats());
}
