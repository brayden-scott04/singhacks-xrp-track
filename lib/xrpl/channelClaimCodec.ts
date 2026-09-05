import * as keypairs from "ripple-keypairs";

/**
 * XRPL payment channel claim message: "CLM\0" + 32-byte channel id +
 * 8-byte big-endian drop amount. This is the exact byte layout `rippled`'s
 * channel_authorize/channel_verify use — see
 * https://xrpl.org/docs/references/http-websocket-apis/admin-api-methods/signing-methods/channel_authorize
 */
function encodeClaimHex(channelId: string, amountDrops: string): string {
  const buf = Buffer.alloc(4 + 32 + 8);
  buf.write("CLM\0", 0, "ascii");
  buf.write(channelId.toUpperCase(), 4, "hex");
  buf.writeBigUInt64BE(BigInt(amountDrops), 36);
  return buf.toString("hex").toUpperCase();
}

/** Signs an off-chain, no-gas claim authorizing up to `amountDrops` cumulative from this channel. */
export function signChannelClaim(channelId: string, amountDrops: string, privateKeyHex: string): string {
  const message = encodeClaimHex(channelId, amountDrops);
  return keypairs.sign(message, privateKeyHex);
}

/** Verifies a claim signature against the channel source's public key. */
export function verifyChannelClaim(channelId: string, amountDrops: string, signature: string, publicKeyHex: string): boolean {
  const message = encodeClaimHex(channelId, amountDrops);
  try {
    return keypairs.verify(message, signature, publicKeyHex);
  } catch {
    return false;
  }
}
