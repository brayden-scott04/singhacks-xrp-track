import { Client } from "xrpl";
import { env } from "../../shared/env.js";

let clientPromise: Promise<Client> | null = null;

/** Single shared xrpl.Client, connected once and reused across the process. */
export function getXrplClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client(env.XRPL_NETWORK);
      await client.connect();
      console.log(`[xrpl] connected to ${env.XRPL_NETWORK}`);
      return client;
    })();
  }
  return clientPromise;
}
