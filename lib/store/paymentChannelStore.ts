import type { ProviderId } from "../shared/types";
import { globalSingleton } from "./globalSingleton";

export interface ChannelState {
  channelId: string;
  cumulativeDrops: bigint;
}

// One active session at a time for this hackathon build — see docs/architecture.md.
const channels = globalSingleton("channels", () => new Map<ProviderId, ChannelState>());

const lockTail = globalSingleton("channelLockTail", () => new Map<ProviderId, Promise<void>>());

/**
 * Serializes channel-open + settlement per provider within this process.
 * Settlement spans several `await`s (real XRPL network calls), so two tasks
 * settling to the same provider concurrently could otherwise interleave
 * between them and corrupt the cumulative-claim math or double-open a
 * channel — this chains each provider's operations so only one runs at a
 * time, without needing an external lock.
 */
export async function withChannelLock<T>(providerId: ProviderId, fn: () => Promise<T>): Promise<T> {
  const previous = lockTail.get(providerId) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  lockTail.set(providerId, previous.then(() => next));

  await previous;
  try {
    return await fn();
  } finally {
    release!();
  }
}

export function getChannelState(providerId: ProviderId): ChannelState | null {
  return channels.get(providerId) ?? null;
}

export function saveChannelState(providerId: ProviderId, state: ChannelState): void {
  channels.set(providerId, state);
}

export function clearChannelState(providerId: ProviderId): void {
  channels.delete(providerId);
}
