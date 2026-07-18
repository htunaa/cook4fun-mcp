import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Account,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DEFAULT_CHAIN_ID,
  DEFAULT_LAUNCHPAD_ADDRESS,
  DEFAULT_RPC_URL,
} from "./contracts.js";

export type Config = {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  account?: Account;
  launchpad: Address;
  rpcUrl: string;
  slippageBps: bigint;
  /** cook4.fun origin used to pin token metadata (ERC-7572) at launch. */
  apiBase: string;
};

function normalizePrivateKey(pk: string): `0x${string}` {
  const trimmed = pk.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error("COOK4FUN_PRIVATE_KEY is not a valid 32-byte hex private key.");
  }
  return withPrefix as `0x${string}`;
}

/**
 * Builds viem clients from environment variables. Reads always work; write
 * clients (account + walletClient) are only created when COOK4FUN_PRIVATE_KEY
 * is set, so read-only tools run with no key configured.
 */
export function getConfig(): Config {
  const rpcUrl = process.env.COOK4FUN_RPC_URL || DEFAULT_RPC_URL;
  const launchpad = (process.env.COOK4FUN_LAUNCHPAD_ADDRESS ||
    DEFAULT_LAUNCHPAD_ADDRESS) as Address;

  let slippageBps = 1000n;
  const raw = process.env.COOK4FUN_SLIPPAGE_BPS;
  if (raw) slippageBps = BigInt(Math.max(0, Math.min(9000, parseInt(raw, 10) || 0)));

  const chain = defineChain({
    id: DEFAULT_CHAIN_ID,
    name: "Robinhood",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  let account: Account | undefined;
  let walletClient: WalletClient | undefined;
  const pk = process.env.COOK4FUN_PRIVATE_KEY;
  if (pk) {
    account = privateKeyToAccount(normalizePrivateKey(pk));
    walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  }

  const apiBase = (process.env.COOK4FUN_API_URL || "https://cook4.fun").replace(/\/+$/, "");

  return { publicClient, walletClient, account, launchpad, rpcUrl, slippageBps, apiBase };
}

/** Throws a friendly error if no wallet is configured (for write tools). */
export function requireWallet(cfg: Config): asserts cfg is Config & {
  walletClient: WalletClient;
  account: Account;
} {
  if (!cfg.walletClient || !cfg.account) {
    throw new Error(
      "No wallet configured. Set COOK4FUN_PRIVATE_KEY (a 0x private key with ETH on Robinhood chain 4663) in the MCP server env to launch or trade.",
    );
  }
}
