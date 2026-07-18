import { describe, it, expect } from "vitest";
import {
  extractPersistentAlts,
  buildCompoundChainConfig,
} from "../loader";
import type { CompoundDeployment } from "../types";

// alts.json as it lives in the registry (chains/<id>-<slug>/alts.json): a
// { chain_id, tables[] } blob where each table carries a tier + optional dapp.
// The two PERSISTENT tables the Solana lane attaches are the chain-tier table
// and the comet dApp table; any other dApp table (e.g. romedefi-240) is ignored.
const HADRIAN_ALTS = {
  chain_id: "200010-hadrian",
  tables: [
    {
      pubkey: "9DswaXsjcqozpbUUnL24wRqteqZTZH1UqCpFcsYWcgQP",
      tier: "chain",
      authority_kind: "operator-keypair",
      frozen: false,
      contents_hash: "107464c86698d393afb30c83f06000a48210830f8348d9e324a85357f6afd764",
    },
    {
      pubkey: "458nSqg6qzcsgYr1DiDrs59UBJD8VRsvpiiHP7rQ3MVk",
      tier: "dapp",
      dapp: "comet",
      authority_kind: "operator-keypair",
      frozen: false,
      contents_hash: "b760fffce775ff0dd35cfaa1a8eac2ba72d5f7cbeff53c737e86dd5dbd8794a3",
    },
    {
      pubkey: "7drY6cBpTUpKF7joWb1STkqySASA9UNrwTBW192Vs6fg",
      tier: "dapp",
      dapp: "romedefi-240",
      authority_kind: "operator-keypair",
      frozen: false,
      contents_hash: "b3b302a8b3eb0dba314a643bc83563172295d9812ce39d0b2e7a257faa844521",
    },
  ],
};

// The exact pubkeys the Solana lane must attach to every DoTxUnsigned v0 tx on
// chain 200010 — comet dApp ALT first, then the chain ALT.
const COMET_ALT = "458nSqg6qzcsgYr1DiDrs59UBJD8VRsvpiiHP7rQ3MVk";
const CHAIN_ALT = "9DswaXsjcqozpbUUnL24wRqteqZTZH1UqCpFcsYWcgQP";

describe("extractPersistentAlts — comet dApp + chain tier from alts.json", () => {
  it("returns the comet ALT then the chain ALT, ignoring other dApp tables", () => {
    expect(extractPersistentAlts(HADRIAN_ALTS)).toEqual([COMET_ALT, CHAIN_ALT]);
  });

  it("returns [] when alts.json is absent (undefined)", () => {
    expect(extractPersistentAlts(undefined)).toEqual([]);
  });

  it("returns [] when there are no comet/chain tables", () => {
    expect(
      extractPersistentAlts({
        chain_id: "x",
        tables: [{ pubkey: "X", tier: "dapp", dapp: "romedefi-240" }],
      }),
    ).toEqual([]);
  });

  it("tolerates a malformed blob (no tables array)", () => {
    expect(extractPersistentAlts({})).toEqual([]);
    expect(extractPersistentAlts({ tables: "nope" })).toEqual([]);
  });
});

function hadrianEntry(overrides: Partial<CompoundDeployment> = {}): CompoundDeployment {
  return {
    schemaVersion: "1",
    chainId: 200010,
    chainSlug: "hadrian",
    compoundVersion: "v3-0.16.0",
    baseAsset: {
      type: "wrapper",
      address: "0xc1418f71Fdd16F8010382da1F796C2C90c6508b0",
      displaySymbol: "wUSDC",
      sourceRef: "rome-solidity@b662123",
    },
    comets: [
      {
        label: "canonical",
        address: "0xfc322489D4089AdCC79074C8058Fd257c63622D8",
        extensionDelegate: "0x0448b1c8d4bD6259588B5B936AE09DA180aC03a0",
        implementation: "0xE45E740053f1E245303f36dEDd3fCA65D64bA8Cb",
        proxyAdmin: "0x36aB36d5E48fDd3440b1C2EbEa360F3b76d0B2EF",
        collateralAssets: [],
      },
    ],
    bulker: "0xD896ECe11fBAE90255c8010e4c5c5BD6DBb4A874",
    collateralAssets: [],
    baseTokenPriceFeed: "0x061434caB7F8e6F7E396231Ae9b277a5e14c6254",
    baseTokenPriceFeedKind: "simple",
    jito: { enabled: false },
    ux: { singleTxFlows: ["supply"], bundleFlows: [], fallbackFlows: ["sequentialNTx"] },
    demoUrl: "https://compound.testnet.romeprotocol.xyz",
    rpcRef: "chains/200010-hadrian/chain.json#rpcUrl",
    deployedAt: "2026-05-17T09:11:00Z",
    sourceCommits: {},
    status: "live",
    ...overrides,
  };
}

const CHAIN_JSON = {
  chainId: 200010,
  name: "Rome Hadrian",
  network: "devnet",
  rpcUrl: "https://hadrian.testnet.romeprotocol.xyz/",
  status: "live",
};

describe("buildCompoundChainConfig threads persistentAlts from alts.json", () => {
  it("surfaces the comet + chain ALTs on cfg.persistentAlts", () => {
    const cfg = buildCompoundChainConfig(hadrianEntry(), CHAIN_JSON, undefined, HADRIAN_ALTS);
    expect(cfg.persistentAlts).toEqual([COMET_ALT, CHAIN_ALT]);
  });

  it("defaults persistentAlts to [] when no alts.json is provided", () => {
    const cfg = buildCompoundChainConfig(hadrianEntry(), CHAIN_JSON);
    expect(cfg.persistentAlts).toEqual([]);
  });
});
