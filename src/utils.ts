import { formatEther, isAddress, type Address, type PublicClient } from "viem";
import { LAUNCHPAD_ABI } from "./contracts.js";

export type LaunchpadToken = {
  token: Address;
  name: string;
  symbol: string;
  createdAt: bigint;
  pool: Address;
  distribute: boolean;
};

/** Fetch up to `limit` tokens registered on the launchpad. */
export async function fetchTokens(
  publicClient: PublicClient,
  launchpad: Address,
  limit = 500n,
): Promise<LaunchpadToken[]> {
  const res = (await publicClient.readContract({
    address: launchpad,
    abi: LAUNCHPAD_ABI,
    functionName: "getTokens",
    args: [0n, limit],
  })) as readonly [readonly any[], bigint];
  const rows = res[0] ?? [];
  return rows.map((t: any) => ({
    token: t.token as Address,
    name: t.name as string,
    symbol: t.symbol as string,
    createdAt: t.createdAt as bigint,
    pool: t.pool as Address,
    distribute: t.distribute as boolean,
  }));
}

/**
 * Resolve a user's token reference (0x address or $TICKER / name) to an address.
 */
export async function resolveToken(
  publicClient: PublicClient,
  launchpad: Address,
  ref: string,
): Promise<{ address: Address; label: string }> {
  const trimmed = ref.trim();
  if (isAddress(trimmed)) return { address: trimmed as Address, label: trimmed };

  const wanted = trimmed.replace(/^\$/, "").toLowerCase();
  const tokens = await fetchTokens(publicClient, launchpad);
  const match =
    tokens.find((t) => t.symbol.toLowerCase() === wanted) ??
    tokens.find((t) => t.name.toLowerCase() === wanted) ??
    tokens.find((t) => t.symbol.toLowerCase().includes(wanted));
  if (!match) {
    throw new Error(
      `No coin matching "${ref}" is registered on cook4.fun. Pass a contract address or an exact $TICKER.`,
    );
  }
  return { address: match.token, label: `${match.name} ($${match.symbol})` };
}

/** Apply a slippage tolerance (bps) to an expected output. */
export function applySlippage(expected: bigint, slippageBps: bigint): bigint {
  if (expected <= 0n) return 0n;
  return (expected * (10000n - slippageBps)) / 10000n;
}

export function fmtEth(wei: bigint, digits = 5): string {
  const n = Number(formatEther(wei));
  return `${n.toFixed(digits).replace(/\.?0+$/, "")} ETH`;
}

export function explorerTx(hash: string): string {
  return `https://blockscout.mainnet.chain.robinhood.com/tx/${hash}`;
}
