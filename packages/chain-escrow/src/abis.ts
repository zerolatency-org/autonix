/** Minimal ABI fragments for exactly the functions/events this client calls.
 * Hand-written rather than imported from Foundry's build output, so this
 * package has no path dependency on where `contracts/out` happens to live. */

export const agentIdentityAbi = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "profileURI", type: "string" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isRetired",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "activeJobsOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "AgentMinted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "profileURI", type: "string", indexed: false },
    ],
  },
] as const;

export const jobEscrowAbi = [
  {
    type: "function",
    name: "createJob",
    inputs: [
      { name: "providerTokenId", type: "uint256" },
      { name: "criteriaHash", type: "bytes32" },
      { name: "acceptDeadline", type: "uint64" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "accept",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "commitDelivery",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "resultHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settle",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "pass", type: "bool" },
      { name: "score", type: "uint8" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimTimeout",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balances",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "jobs",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "providerTokenId", type: "uint256" },
      { name: "providerOwnerAtAccept", type: "address" },
      { name: "criteriaHash", type: "bytes32" },
      { name: "resultHash", type: "bytes32" },
      { name: "amountWei", type: "uint256" },
      { name: "acceptDeadline", type: "uint64" },
      { name: "deliverDeadline", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "providerTokenId", type: "uint256", indexed: true },
      { name: "criteriaHash", type: "bytes32", indexed: false },
      { name: "amountWei", type: "uint256", indexed: false },
      { name: "acceptDeadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobSettled",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "pass", type: "bool", indexed: false },
      { name: "score", type: "uint8", indexed: false },
    ],
  },
] as const;
