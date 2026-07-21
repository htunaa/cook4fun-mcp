import {
  concat,
  encodeAbiParameters,
  formatEther,
  getContractAddress,
  isAddress,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { LAUNCHPAD_ABI } from "./contracts.js";

export type LaunchpadToken = {
  token: Address;
  name: string;
  symbol: string;
  createdAt: bigint;
  poolId: Hex;
  distribute: boolean;
};

// A coin is an EIP-1167 clone, so its address is decided by a salt we pick before
// sending the launch. The clone's init code is constant, so the launchpad mixes
// the sender in (keccak256(sender, salt)) — that is why the same salt lands on a
// different address for a different caller and nobody can front-run a ground one.
const PROXY_PREFIX = "0x3d602d80600a3d3981f3363d3d373d3d3d363d73" as const;
const PROXY_SUFFIX = "0x5af43d82803e903d91602b57fd5bf3" as const;

/**
 * Grinds a salt so the launched coin's address ends in `c00c`, the cook4.fun
 * signature every coin carries. Falls back to any salt after `budgetMs` so a
 * launch is never blocked just because the pretty address was slow.
 */
export function grindSalt(
  creator: Address,
  launchpad: Address,
  implementation: Address,
  budgetMs = 6000,
): Hex {
  const bytecodeHash = keccak256(concat([PROXY_PREFIX, implementation, PROXY_SUFFIX]));
  const started = Date.now();
  let i = Math.floor(Math.random() * 1e9) + 1;
  let salt = `0x${i.toString(16).padStart(64, "0")}` as Hex;
  while (Date.now() - started < budgetMs) {
    salt = `0x${i.toString(16).padStart(64, "0")}` as Hex;
    const derived = keccak256(
      encodeAbiParameters(parseAbiParameters("address, bytes32"), [creator, salt]),
    );
    const address = getContractAddress({ opcode: "CREATE2", from: launchpad, salt: derived, bytecodeHash });
    if (address.toLowerCase().endsWith("c00c")) return salt;
    i++;
  }
  return salt; // ordinary address, launch anyway
}

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
    poolId: t.poolId as Hex,
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

export type TokenMetadata = {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
};

/**
 * Pin the coin's metadata JSON (ERC-7572) via cook4.fun and return the URL to
 * store on-chain as `md`. Terminals read the coin's picture and socials from
 * this, NOT from the launchpad's imageUrl field, so a launch without it shows
 * up with no image anywhere. cook4.fun also copies a remotely hosted image onto
 * IPFS here, so the picture outlives whatever host the caller used.
 *
 * Returns "" on any failure: a missing picture should never block a launch.
 */
export async function pinMetadata(apiBase: string, meta: TokenMetadata): Promise<string> {
  try {
    const res = await fetch(`${apiBase}/api/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
    if (!res.ok) return "";
    const json: any = await res.json();
    return typeof json?.uri === "string" ? json.uri : "";
  } catch {
    return "";
  }
}

export function explorerTx(hash: string): string {
  return `https://robinhoodchain.blockscout.com/tx/${hash}`;
}
