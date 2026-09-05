import { EventEmitter } from "node:events";
import type { DecisionResult, ExcludedBid, IndustryAgentId, IndustryBid, ProviderId, SessionState, SettlementRecord } from "../shared/types";

export type BidStreamEvent =
  | { type: "bid.received"; sessionId: string; taskId: string; bid: IndustryBid }
  | { type: "bid.excluded"; sessionId: string; taskId: string; excluded: ExcludedBid }
  | { type: "decision.made"; sessionId: string; taskId: string; decision: DecisionResult }
  | { type: "settlement.started"; sessionId: string; taskId: string; providerId: ProviderId; industryId: IndustryAgentId }
  | { type: "settlement.confirmed"; sessionId: string; taskId: string; settlement: SettlementRecord }
  | { type: "settlement.fallback"; sessionId: string; taskId: string; reason: string }
  | { type: "session.warning"; sessionId: string; session: SessionState }
  | { type: "session.paused"; sessionId: string; session: SessionState }
  | { type: "session.resumed"; sessionId: string; session: SessionState }
  | { type: "task.completed"; sessionId: string; taskId: string; output: string }
  | { type: "task.rejected"; sessionId: string; taskId: string; reason: string }
  | { type: "task.failed"; sessionId: string; taskId: string; reason: string };

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function publish(event: BidStreamEvent): void {
  emitter.emit("event", event);
}

export function subscribe(listener: (event: BidStreamEvent) => void): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}
