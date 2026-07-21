// Minimal ABIs for the cook4.fun launchpad + ERC20, covering exactly the
// functions this plugin calls. The full launchpad has more surface area; we
// keep only what we use so the bundle stays small and the types stay tight.

export const LAUNCHPAD_ABI = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "nm", type: "string" },
      { name: "sy", type: "string" },
      { name: "ds", type: "string" },
      { name: "im", type: "string" },
      { name: "tw", type: "string" },
      { name: "tg", type: "string" },
      { name: "ws", type: "string" },
      { name: "_distribute", type: "bool" },
      { name: "_firstBuy", type: "uint256" },
      { name: "md", type: "string" },
      { name: "salt", type: "bytes32" },
      {
        name: "sp",
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "bps", type: "uint16" },
        ],
      },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "ta", type: "address" },
      { name: "minOut", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ta", type: "address" },
      { name: "amt", type: "uint256" },
      { name: "minEth", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimRewards",
    stateMutability: "nonpayable",
    inputs: [{ name: "ta", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getClaimable",
    stateMutability: "view",
    inputs: [
      { name: "ta", type: "address" },
      { name: "holder", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [{ name: "ta", type: "address" }],
    // (ETH per whole token) * 1e18
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getMCAP",
    stateMutability: "view",
    inputs: [{ name: "ta", type: "address" }],
    // market cap in wei ETH
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "creationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTokenCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTokens",
    stateMutability: "view",
    inputs: [
      { name: "o", type: "uint256" },
      { name: "l", type: "uint256" },
    ],
    outputs: [
      {
        name: "r",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "creator", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "description", type: "string" },
          { name: "imageUrl", type: "string" },
          { name: "twitter", type: "string" },
          { name: "telegram", type: "string" },
          { name: "website", type: "string" },
          { name: "createdAt", type: "uint256" },
          { name: "poolId", type: "bytes32" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "liquidity", type: "uint128" },
          { name: "distribute", type: "bool" },
          { name: "hfp", type: "uint256" },
          { name: "fpta", type: "uint256" },
        ],
      },
      { name: "t", type: "uint256" },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// Live V4-native launchpad (Uniswap V4 + EIP-1167 clone tokens). New launches go here.
export const DEFAULT_LAUNCHPAD_ADDRESS =
  "0xcdC8D6C3DdA334730262Fd7D7f0Ee5E86bA4Ff47" as const;

// The LaunchpadToken implementation every coin is a clone of. Used to derive a
// coin's CREATE2 address off-chain when grinding a c00c vanity salt.
export const DEFAULT_TOKEN_IMPLEMENTATION =
  "0x4CcfcAad121f7082cee86ee76D76f24F7Cd35720" as const;

// Robinhood chain.
export const DEFAULT_CHAIN_ID = 4663;
export const DEFAULT_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
