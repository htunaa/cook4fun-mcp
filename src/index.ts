import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatEther, parseEther, parseUnits, decodeEventLog, type Address } from "viem";
import { getConfig, requireWallet } from "./chain.js";
import { ERC20_ABI, LAUNCHPAD_ABI } from "./contracts.js";
import { applySlippage, explorerTx, fetchTokens, fmtEth, pinMetadata, resolveToken } from "./utils.js";

const TOKEN_CREATED_ABI = [
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "i", type: "uint256", indexed: true },
      { name: "t", type: "address", indexed: true },
      { name: "c", type: "address", indexed: true },
      { name: "n", type: "string", indexed: false },
      { name: "s", type: "string", indexed: false },
      { name: "ts", type: "uint256", indexed: false },
      { name: "d", type: "bool", indexed: false },
    ],
  },
] as const;

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

const server = new McpServer({ name: "cook4fun-mcp", version: "0.1.0" });

// ------------------------------------------------------------------ reads

server.registerTool(
  "cook4fun_list_coins",
  {
    title: "List cook4.fun coins",
    description:
      "List the newest coins on cook4.fun with their market caps. Read-only, no wallet needed.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
  },
  async ({ limit }) => {
    try {
      const cfg = getConfig();
      const tokens = await fetchTokens(cfg.publicClient, cfg.launchpad);
      if (tokens.length === 0) return ok("cook4.fun has no coins listed yet.");
      const newest = [...tokens]
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
        .slice(0, limit ?? 10);
      const lines = await Promise.all(
        newest.map(async (t) => {
          let mcap = "?";
          try {
            const m = (await cfg.publicClient.readContract({
              address: cfg.launchpad,
              abi: LAUNCHPAD_ABI,
              functionName: "getMCAP",
              args: [t.token],
            })) as bigint;
            mcap = `${Number(formatEther(m)).toFixed(4)} ETH`;
          } catch {}
          return `- ${t.name} ($${t.symbol}): ${mcap} mcap${t.distribute ? " [rewards]" : ""} (${t.token})`;
        }),
      );
      return ok(`cook4.fun has ${tokens.length} coins. Newest:\n${lines.join("\n")}`);
    } catch (e: any) {
      return fail(`Couldn't list coins: ${e?.shortMessage || e?.message || String(e)}`);
    }
  },
);

server.registerTool(
  "cook4fun_wallet",
  {
    title: "Show trading wallet",
    description: "Show the configured wallet address and its ETH balance on the Robinhood chain.",
    inputSchema: {},
  },
  async () => {
    try {
      const cfg = getConfig();
      requireWallet(cfg);
      const bal = await cfg.publicClient.getBalance({ address: cfg.account.address });
      return ok(`Wallet ${cfg.account.address}\nBalance: ${fmtEth(bal)}`);
    } catch (e: any) {
      return fail(e?.shortMessage || e?.message || String(e));
    }
  },
);

// ------------------------------------------------------------------ writes

server.registerTool(
  "cook4fun_launch",
  {
    title: "Launch a coin",
    description:
      "Launch a new coin on cook4.fun: deploys the token, opens its Uniswap V3 pool, and optionally makes a first buy. Requires a wallet with ETH.",
    inputSchema: {
      name: z.string().min(1).describe("Coin name, e.g. \"Space Cat\""),
      symbol: z.string().min(1).max(12).describe("Ticker, e.g. SCAT"),
      description: z.string().optional(),
      image: z.string().optional().describe("Image URL (https or ipfs://)"),
      twitter: z.string().optional(),
      telegram: z.string().optional(),
      website: z.string().optional(),
      metadataUrl: z.string().optional().describe("ERC-7572 metadata JSON URL"),
      distribute: z.boolean().optional().describe("Share LP fees with holders"),
      firstBuyEth: z.string().optional().describe("ETH amount for an initial buy, e.g. \"0.05\""),
    },
  },
  async (a) => {
    try {
      const cfg = getConfig();
      requireWallet(cfg);
      const firstBuy = a.firstBuyEth ? parseEther(a.firstBuyEth) : 0n;

      // Pin the metadata JSON (ERC-7572) unless the caller supplied one.
      // Terminals read the coin's picture and socials from this; launching
      // without it leaves contractURI empty and the coin shows up with no
      // image anywhere. cook4.fun also copies the image onto IPFS here.
      let metadataUrl = a.metadataUrl ?? "";
      if (!metadataUrl) {
        metadataUrl = await pinMetadata(cfg.apiBase, {
          name: a.name,
          symbol: a.symbol.toUpperCase(),
          description: a.description ?? "",
          image: a.image ?? "",
          twitter: a.twitter ?? "",
          telegram: a.telegram ?? "",
          website: a.website ?? "",
        });
      }

      const creationFee = (await cfg.publicClient.readContract({
        address: cfg.launchpad,
        abi: LAUNCHPAD_ABI,
        functionName: "creationFee",
        args: [],
      })) as bigint;
      const value = creationFee + firstBuy;

      const hash = await cfg.walletClient.writeContract({
        address: cfg.launchpad,
        abi: LAUNCHPAD_ABI,
        functionName: "createToken",
        args: [
          a.name,
          a.symbol.toUpperCase(),
          a.description ?? "",
          a.image ?? "",
          a.twitter ?? "",
          a.telegram ?? "",
          a.website ?? "",
          a.distribute ?? false,
          firstBuy,
          metadataUrl,
        ],
        value,
        account: cfg.account,
        chain: cfg.walletClient.chain,
      });
      const receipt = await cfg.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") return fail(`Launch reverted. ${explorerTx(hash)}`);

      let token: Address | undefined;
      for (const log of receipt.logs) {
        try {
          const d = decodeEventLog({ abi: TOKEN_CREATED_ABI, data: log.data, topics: log.topics });
          if (d.eventName === "TokenCreated") { token = (d.args as any).t as Address; break; }
        } catch {}
      }
      return ok(
        `Launched "${a.name}" ($${a.symbol.toUpperCase()}).${token ? `\nToken: ${token}\nhttps://cook4.fun/token/${token}` : ""}\n${explorerTx(hash)}`,
      );
    } catch (e: any) {
      return fail(`Couldn't launch: ${e?.shortMessage || e?.message || String(e)}`);
    }
  },
);

server.registerTool(
  "cook4fun_buy",
  {
    title: "Buy a coin",
    description:
      "Buy a cook4.fun coin by spending ETH. Reference the coin by 0x address or $TICKER. Slippage-protected.",
    inputSchema: {
      token: z.string().describe("Coin address (0x…) or $TICKER"),
      ethAmount: z.string().describe("ETH to spend, e.g. \"0.05\""),
      slippageBps: z.number().int().min(0).max(9000).optional(),
    },
  },
  async (a) => {
    try {
      const cfg = getConfig();
      requireWallet(cfg);
      const { address, label } = await resolveToken(cfg.publicClient, cfg.launchpad, a.token);
      const value = parseEther(a.ethAmount);
      const price = (await cfg.publicClient.readContract({
        address: cfg.launchpad, abi: LAUNCHPAD_ABI, functionName: "getPrice", args: [address],
      })) as bigint;
      const slip = a.slippageBps !== undefined ? BigInt(a.slippageBps) : cfg.slippageBps;
      const expectedOut = price > 0n ? (value * 10n ** 18n) / price : 0n;
      const minOut = applySlippage(expectedOut, slip);

      const hash = await cfg.walletClient.writeContract({
        address: cfg.launchpad, abi: LAUNCHPAD_ABI, functionName: "buy",
        args: [address, minOut], value, account: cfg.account, chain: cfg.walletClient.chain,
      });
      const receipt = await cfg.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") return fail(`Buy reverted. ${explorerTx(hash)}`);
      return ok(`Bought ${label} for ${fmtEth(value)}.\n${explorerTx(hash)}`);
    } catch (e: any) {
      return fail(`Couldn't buy: ${e?.shortMessage || e?.message || String(e)}`);
    }
  },
);

server.registerTool(
  "cook4fun_sell",
  {
    title: "Sell a coin",
    description:
      "Sell a cook4.fun coin back to ETH. Specify an exact token amount, a percentage, or all. Auto-approves and is slippage-protected.",
    inputSchema: {
      token: z.string().describe("Coin address (0x…) or $TICKER"),
      amountTokens: z.string().optional().describe("Exact number of tokens to sell"),
      percent: z.number().min(0).max(100).optional().describe("Percent of balance to sell"),
      all: z.boolean().optional().describe("Sell the entire balance"),
      slippageBps: z.number().int().min(0).max(9000).optional(),
    },
  },
  async (a) => {
    try {
      const cfg = getConfig();
      requireWallet(cfg);
      const { address, label } = await resolveToken(cfg.publicClient, cfg.launchpad, a.token);
      const balance = (await cfg.publicClient.readContract({
        address, abi: ERC20_ABI, functionName: "balanceOf", args: [cfg.account.address],
      })) as bigint;
      if (balance <= 0n) return fail(`Wallet holds no ${label}.`);

      let amount: bigint;
      if (a.amountTokens !== undefined) amount = parseUnits(a.amountTokens, 18);
      else if (a.all || a.percent === 100) amount = balance;
      else if (a.percent) amount = (balance * BigInt(Math.round(a.percent * 100))) / 10000n;
      else return fail("Specify amountTokens, percent, or all.");
      if (amount > balance) amount = balance;
      if (amount <= 0n) return fail("That is zero tokens.");

      const allowance = (await cfg.publicClient.readContract({
        address, abi: ERC20_ABI, functionName: "allowance", args: [cfg.account.address, cfg.launchpad],
      })) as bigint;
      if (allowance < amount) {
        const ah = await cfg.walletClient.writeContract({
          address, abi: ERC20_ABI, functionName: "approve",
          args: [cfg.launchpad, amount], account: cfg.account, chain: cfg.walletClient.chain,
        });
        await cfg.publicClient.waitForTransactionReceipt({ hash: ah });
      }

      const price = (await cfg.publicClient.readContract({
        address: cfg.launchpad, abi: LAUNCHPAD_ABI, functionName: "getPrice", args: [address],
      })) as bigint;
      const slip = a.slippageBps !== undefined ? BigInt(a.slippageBps) : cfg.slippageBps;
      const expectedEth = (amount * price) / 10n ** 18n;
      const minEth = applySlippage(expectedEth, slip);

      const hash = await cfg.walletClient.writeContract({
        address: cfg.launchpad, abi: LAUNCHPAD_ABI, functionName: "sell",
        args: [address, amount, minEth], account: cfg.account, chain: cfg.walletClient.chain,
      });
      const receipt = await cfg.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") return fail(`Sell reverted. ${explorerTx(hash)}`);
      return ok(`Sold ${(Number(amount) / 1e18).toLocaleString()} ${label} (~${fmtEth(expectedEth)}).\n${explorerTx(hash)}`);
    } catch (e: any) {
      return fail(`Couldn't sell: ${e?.shortMessage || e?.message || String(e)}`);
    }
  },
);

server.registerTool(
  "cook4fun_claim",
  {
    title: "Claim rewards",
    description: "Claim the wallet's share of a reward-sharing coin's accrued fees.",
    inputSchema: { token: z.string().describe("Coin address (0x…) or $TICKER") },
  },
  async (a) => {
    try {
      const cfg = getConfig();
      requireWallet(cfg);
      const { address, label } = await resolveToken(cfg.publicClient, cfg.launchpad, a.token);
      const claimable = (await cfg.publicClient.readContract({
        address: cfg.launchpad, abi: LAUNCHPAD_ABI, functionName: "getClaimable",
        args: [address, cfg.account.address],
      })) as bigint;
      if (claimable <= 0n) return fail(`Nothing to claim on ${label}.`);
      const hash = await cfg.walletClient.writeContract({
        address: cfg.launchpad, abi: LAUNCHPAD_ABI, functionName: "claimRewards",
        args: [address], account: cfg.account, chain: cfg.walletClient.chain,
      });
      const receipt = await cfg.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") return fail(`Claim reverted. ${explorerTx(hash)}`);
      return ok(`Claimed ~${fmtEth(claimable)} from ${label}.\n${explorerTx(hash)}`);
    } catch (e: any) {
      return fail(`Couldn't claim: ${e?.shortMessage || e?.message || String(e)}`);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio servers must not write to stdout; log to stderr only.
  console.error("cook4fun-mcp running on stdio");
}

main().catch((err) => {
  console.error("cook4fun-mcp fatal:", err);
  process.exit(1);
});
