import { randomUUID } from "node:crypto";
import type { SessionState, SettlementRecord } from "../shared/types.js";

interface SessionRecord {
  state: SessionState;
  settlements: SettlementRecord[];
}

const sessions = new Map<string, SessionRecord>();

export function createSession(capUsd: number): SessionState {
  const sessionId = randomUUID();
  const state: SessionState = {
    sessionId,
    capUsd,
    spentUsd: 0,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  sessions.set(sessionId, { state, settlements: [] });
  return state;
}

export function getSession(sessionId: string): SessionState | null {
  return sessions.get(sessionId)?.state ?? null;
}

export function requireSession(sessionId: string): SessionState {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  return session;
}

export function recordSettlement(sessionId: string, settlement: SettlementRecord): void {
  const record = sessions.get(sessionId);
  if (!record) throw new Error(`Unknown session: ${sessionId}`);
  record.settlements.push(settlement);
}

export function getSettlements(sessionId: string): SettlementRecord[] {
  return sessions.get(sessionId)?.settlements ?? [];
}
