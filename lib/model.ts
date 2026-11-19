// The token radar's model (radar-2): one sealed snapshot of the protocol universe in, one ranked
// board of pre-token protocols out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) plus every
// other rankable pre-token protocol the snapshot carries: the early rows the radar exists to find.
// A protocol is pre-token when its entry records no token (no market cap, no CoinGecko id, no
// symbol). Protocols that already trade are kept apart and shown at the market's own values.
// Candidacy follows the watchlist's own rule at every size: a wrapped, staked or bridged product
// of a token that already trades is not a launch candidate, however large it is.
//
// Implied value follows only from the snapshot's own figures. The anchor is a peer multiple: the
// median market-cap/TVL ratio of the token-bearing protocols in the same category — what the
// market actually pays per dollar of TVL for that kind of protocol. Thin categories (fewer than
// five token peers) are shrunk toward the global median so one outlier cannot set a price.
//
//   multiple  = median(mcap / tvl) over token peers in the category, shrunk and clamped
//   base      = tvl_usd x multiple
//   momentum  = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturity  = 0.6 + min(age_days, 1095) / 1095 x 0.4    (age unknown: 365 days)
//   breadth   = 1 + 0.03 x min(chains - 1, 5)
//   implied   = max(1, round(base x momentum x maturity x breadth))
//   pool      = round(implied x alloc share of the category family)
//   pool/$    = round(pool / plan cost): the board's cost-effectiveness figure, pool per $1 of gas
//
// No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the data carries it. */
export const MODEL_VERSION = 'radar-2';

/** Peer-multiple constants: the clamp, the full-weight peer count and the shrinkage weight. */
export const MULTIPLE_FLOOR = 0.03;
export const MULTIPLE_CAP = 1.25;
export const MIN_PEERS_FULL = 5;
export const SHRINK_WEIGHT = 8;

/** Momentum constants: the 7-day change is clamped, then weighted. */
export const MOMENTUM_FLOOR_PCT = -60;
export const MOMENTUM_CAP_PCT = 120;
export const MOMENTUM_WEIGHT = 0.5;

/** Maturity constants: a protocol earns the full factor at three years of tracked history. */
export const MATURITY_FLOOR = 0.6;
export const MATURITY_RANGE = 0.4;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;

/** Breadth constants: each extra chain past the first adds a small factor, up to five. */
export const BREADTH_PER_CHAIN = 0.03;
export const BREADTH_MAX_EXTRA_CHAINS = 5;

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The gate's ceiling on one row's implied value. */
export const IMPLIED_CAP = 1e14;

/** The model's constants and plain-words description, as the dashboard states them. */
export interface ModelInfo {
  name: string;
  summary: string;
  peer_multiple: string;
  global_peer_multiple: number;
  multiple_floor: number;
  multiple_cap: number;
  min_peers_full: number;
  shrink_weight: number;
  momentum: string;
  momentum_floor_pct: number;
  momentum_cap_pct: number;
  momentum_weight: number;
  maturity: string;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth: string;
  breadth_per_chain: number;
  breadth_max_extra_chains: number;
  alloc_share: Record<string, number>;
}

/** One row of board.json: the ranked board's row, with the model's working shown. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  airdrop_pool_usd: number;
  plan_cost_usd: number;
  pool_per_cost_usd: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    base_usd: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: everything the page renders, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_usd: number;
  peer_multiple: number;
  peer_count: number;
  momentum_mult: number;
  maturity_mult: number;
  breadth_mult: number;
  airdrop_pool_usd: number;
  plan_cost_usd: number;
  pool_per_cost_usd: number;
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the page shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelInfo;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const bySlugAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * The categories that are never a launch candidate: bridges and staking wrappers are products of
 * a token that already trades, and an exchange is not a protocol awaiting a launch of its own.
 * This is the snapshot watchlist's own exclusion list, applied here at every size.
 */
const WRAPPER_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Whole words that mark a wrapped or staked product of a token that already trades. */
const WRAPPER_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name is that exchange's own product, not a candidate. */
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?=\s|$)/i;

/**
 * Whether a protocol is one the board may rank: the watchlist's candidacy rule at every size.
 * Pre-token, in no wrapper category, carrying no wrapped/staked/staking whole word in its name,
 * not an exchange's own product, and not a versioned pool of another protocol.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    (p.category === null || !WRAPPER_CATEGORIES.has(p.category)) &&
    !WRAPPER_WORD.test(p.name) &&
    !EXCHANGE_NAME.test(p.name) &&
    !VERSIONED.test(p.name)
  );
}

/** The peer evidence: the global median multiple and each category's median and peer count. */
export interface PeerStats {
  globalMedian: number;
  byCategory: Map<string | null, { median: number; count: number }>;
}

/** The multiples the token-bearing protocols set: every protocol with a market cap and TVL above zero. */
export function peerStats(snapshot: Snapshot): PeerStats {
  const bearing = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const globalMedian = bearing.length > 0 ? median(bearing.map((p) => p.mcap_usd! / p.tvl_usd)) : 0;
  const groups = new Map<string | null, number[]>();
  for (const p of bearing) {
    const list = groups.get(p.category) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    groups.set(p.category, list);
  }
  const byCategory = new Map<string | null, { median: number; count: number }>();
  for (const [category, ratios] of groups) byCategory.set(category, { median: median(ratios), count: ratios.length });
  return { globalMedian, byCategory };
}

/**
 * The multiple one category gets: its own median when at least five token peers set it, otherwise
 * the median shrunk toward the global median with weight SHRINK_WEIGHT, clamped to the band.
 */
export function peerMultiple(category: string | null, stats: PeerStats): { multiple: number; count: number } {
  const group = stats.byCategory.get(category);
  const count = group?.count ?? 0;
  const categoryMedian = group?.median ?? stats.globalMedian;
  const raw = count >= MIN_PEERS_FULL ? categoryMedian : (categoryMedian * count + stats.globalMedian * SHRINK_WEIGHT) / (count + SHRINK_WEIGHT);
  return { multiple: clamp(raw, MULTIPLE_FLOOR, MULTIPLE_CAP), count };
}

/** The category families the farm plan and the airdrop share are written against. */
export type Family = 'lending' | 'dex' | 'bridge' | 'staking' | 'derivatives' | 'yield' | 'rwa' | 'insurance' | 'stablecoin' | 'default';

const FAMILIES: Record<string, Family> = {
  Lending: 'lending',
  CDP: 'lending',
  'CDP Manager': 'lending',
  'Uncollateralized Lending': 'lending',
  Dexs: 'dex',
  Bridge: 'bridge',
  'Canonical Bridge': 'bridge',
  'Cross Chain Bridge': 'bridge',
  'Liquid Staking': 'staking',
  'Staking Pool': 'staking',
  Restaking: 'staking',
  'Liquid Restaking': 'staking',
  'Restaked BTC': 'staking',
  Derivatives: 'derivatives',
  'Interest Rate Derivatives': 'derivatives',
  Yield: 'yield',
  'Yield Aggregator': 'yield',
  'Risk Curators': 'yield',
  'Onchain Capital Allocator': 'yield',
  'Liquidity Manager': 'yield',
  RWA: 'rwa',
  Insurance: 'insurance',
  'Dual-Token Stablecoin': 'stablecoin',
  'Algo-Stables': 'stablecoin',
  'Stablecoin Issuer': 'stablecoin',
  'Stablecoin Wrapper': 'stablecoin',
};

/** A protocol's category family, from its DefiLlama category alone. */
export function familyOf(category: string | null): Family {
  if (category === null) return 'default';
  return FAMILIES[category] ?? 'default';
}

/** The share of implied value a launch typically puts in early users' hands, by category family. */
export const ALLOC_SHARE: Record<Family, number> = {
  lending: 0.12,
  dex: 0.12,
  bridge: 0.08,
  derivatives: 0.1,
  yield: 0.1,
  staking: 0.06,
  rwa: 0.1,
  insurance: 0.1,
  stablecoin: 0.1,
  default: 0.1,
};

/** The gas class of a chain, for cost language and the plan-cost lookup. */
type ChainClass = 'l1' | 'l2' | 'solana' | 'other';

const L2_CHAINS = new Set(['Arbitrum', 'Base', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Unichain']);

function chainClass(chain: string): ChainClass {
  if (chain === 'Ethereum') return 'l1';
  if (chain === 'Solana') return 'solana';
  if (L2_CHAINS.has(chain)) return 'l2';
  return 'other';
}

/** What one transaction costs on a chain, in the words the plan uses. */
export function gasPhrase(chain: string): string {
  const cls = chainClass(chain);
  if (cls === 'l1') return 'about $12 of mainnet gas';
  if (cls === 'l2') return 'under $1 of gas';
  if (cls === 'solana') return 'under $0.05 of fees';
  if (chain === 'Binance' || chain === 'BSC' || chain === 'BNB Chain') return 'about $0.30 of fees';
  return 'about $0.50 of fees';
}

/** Setup-plus-core gas and weekly gas, in dollars, by chain class: the plan-cost lookup. */
const PLAN_COST: Record<ChainClass, [number, number]> = {
  l1: [24, 3],
  l2: [1, 0.5],
  solana: [1, 0.25],
  other: [2, 0.5],
};

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL tier. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(ageDaysEffective: number): number {
  if (ageDaysEffective < 180) return 60;
  if (ageDaysEffective < 365) return 45;
  return 30;
}

/** The category family's core action, in the words a farmer can follow. */
function coreAction(family: Family, p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  switch (family) {
    case 'lending':
      return `Supply $${capital} of USDC to ${name} on ${chain} and borrow a smaller amount against it once, keeping the loan well inside its limit`;
    case 'dex':
      return `Add $${capital} of liquidity to ${name}'s main pool on ${chain} and route a few swaps through that pool so the position earns fees`;
    case 'bridge': {
      // A plan may only name chains from the protocol's own list: a second chain is chains[1]
      // when there is one. A single-chain bridge is farmed with a return crossing on its own
      // chain — never with a crossing to a chain the protocol does not list.
      if (p.chains.length > 1) {
        const dest = p.chains[1]!;
        return `Bridge $${capital} of USDC from ${chain} to ${dest} through ${name} and put the bridged funds to work in an app on ${dest}`;
      }
      return `Bridge $${capital} of USDC across ${name} on ${chain} and back in a second crossing, then put the funds to work in an app on ${chain}`;
    }
    case 'staking':
      return `Stake $${capital} worth of ${chain}'s asset through ${name} and hold the receipt token in the farm wallet`;
    case 'derivatives':
      return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and hold one small hedged position, long and short legs of a similar size`;
    case 'yield':
      return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares in the farm wallet`;
    case 'rwa':
      return `Mint or buy $${capital} of ${name}'s yield asset on ${chain} and hold it in the farm wallet`;
    case 'insurance':
      return `Buy $${capital} of cover from ${name} on ${chain} for the farm wallet's main position and keep the policy in force`;
    case 'stablecoin':
      return `Mint $${capital} of ${name}'s stable asset against USDC collateral on ${chain} and hold the minted asset in the farm wallet`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
  }
}

/** The family's second action: the move that turns one transaction into a pattern of use. */
function secondAction(family: Family, p: SnapshotProtocol): string {
  const name = p.name;
  switch (family) {
    case 'lending':
      return `Borrow against the position a second time and re-supply the proceeds — one careful loop that raises the supplied balance without risking liquidation`;
    case 'dex':
      return `Vote with the position if ${name} runs gauges, and route one more swap through the pool on a different day of the week`;
    case 'bridge':
      return `Make a second crossing with ${name} in the opposite direction, so the wallet shows history both ways instead of a single hop`;
    case 'staking':
      return `Move the receipt token into a second ${name} product, or restake it once, and keep the new receipt in the farm wallet`;
    case 'derivatives':
      return `Roll the hedged position once: close both legs and reopen them at a similar size, so the margin account shows continued use`;
    case 'yield':
      return `Add a second, smaller deposit to a different ${name} vault, so the wallet holds shares in more than one strategy`;
    case 'rwa':
      return `Add a second holding of the yield asset on a later date, so the position builds over time instead of landing in one transaction`;
    case 'insurance':
      return `Renew or extend the cover once before it lapses, so the policy stays in force for the whole holding period`;
    case 'stablecoin':
      return `Repay part of the minted amount and mint again once, so the position shows both directions of use`;
    default:
      return `Make a second deposit on a different day, smaller than the first, so the position grows in more than one transaction`;
  }
}

/** One farm step as one string: the action, then its cost and time. */
function step(action: string, cost: string, time: string): string {
  return `${action}. Cost: ${cost}. Time: ${time}.`;
}

/**
 * A protocol's farm plan: six steps generated from its own record (category family, chains, TVL
 * tier, age), and the plan's estimated cost in dollars — gas and fees only, capital excluded.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: string[]; plan_cost_usd: number } {
  const family = familyOf(p.category);
  const chain = chainOf(p);
  const gas = gasPhrase(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age ?? UNKNOWN_AGE_DAYS);
  let second = secondAction(family, p);
  if (family !== 'bridge' && p.chains.length > 1) {
    second += `. Repeat the position on ${p.chains[1]!}, the second chain ${p.name} lists`;
  }
  const steps = [
    step(
      `Create a fresh wallet for this farm, fund it on ${chain} and keep its seed phrase offline; use this wallet for ${p.name} and nothing else`,
      gas,
      '10 minutes',
    ),
    step(coreAction(family, p, capital, chain), `$${capital} of capital, which stays in the position, plus ${gas}`, '20 minutes to set up'),
    step(second, gas, '15 minutes'),
    step(
      `Repeat one small qualifying action every week — a top-up deposit, a borrow, a swap or a vote — on ${chain}, and record it in the farm log`,
      `${gas} a week`,
      '10 minutes a week',
    ),
    step(
      `Hold the position for at least ${hold} days, so the activity spans several weekly snapshots instead of a single day`,
      'no fee; the capital stays in the position',
      `${hold} days`,
    ),
    step(
      `Before withdrawing, check ${p.name}'s own points or rewards page and claim only from links that page publishes — never from messages, comments or search ads — then write the wallet, the dates and every transaction in the farm log`,
      'nothing to check, and never pay a fee to claim',
      '10 minutes',
    ),
  ];
  const [setupCore, weekly] = PLAN_COST[chainClass(chain)];
  const plan_cost_usd = Math.max(2, Math.ceil(setupCore + weekly * Math.ceil(hold / 7)));
  return { steps, plan_cost_usd };
}

/** One protocol's score under the model: every factor, the implied value and its airdrop pool. */
export interface Scored {
  age: number | null;
  multiple: number;
  peerCount: number;
  base: number;
  momentumMult: number;
  maturityMult: number;
  breadthMult: number;
  implied: number;
  pool: number;
}

/** Score one protocol from the snapshot's own figures. */
export function score(p: SnapshotProtocol, asOf: string, stats: PeerStats): Scored {
  const age = ageDays(asOf, p.listed_at);
  const { multiple, count } = peerMultiple(p.category, stats);
  const base = p.tvl_usd * multiple;
  const momentumMult = 1 + (clamp(p.change_7d ?? 0, MOMENTUM_FLOOR_PCT, MOMENTUM_CAP_PCT) / 100) * MOMENTUM_WEIGHT;
  const maturityMult = MATURITY_FLOOR + (Math.min(age ?? UNKNOWN_AGE_DAYS, MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const breadthMult = 1 + BREADTH_PER_CHAIN * Math.min(p.chains.length - 1, BREADTH_MAX_EXTRA_CHAINS);
  const implied = Math.max(1, Math.round(base * momentumMult * maturityMult * breadthMult));
  const pool = Math.round(implied * ALLOC_SHARE[familyOf(p.category)]);
  return { age, multiple, peerCount: count, base, momentumMult, maturityMult, breadthMult, implied, pool };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const stats = peerStats(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is on the board, whatever the filters say.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, s: score(p, snapshot.as_of, stats), plan: farmPlan(p, ageDays(snapshot.as_of, p.listed_at)) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || bySlugAsc(a.p.slug, b.p.slug));
  return scored.map(({ p, s, plan }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    airdrop_pool_usd: s.pool,
    plan_cost_usd: plan.plan_cost_usd,
    pool_per_cost_usd: Math.round(s.pool / Math.max(1, plan.plan_cost_usd)),
    model: {
      peer_multiple: round4(s.multiple),
      peer_count: s.peerCount,
      base_usd: Math.round(s.base),
      momentum_multiplier: round4(s.momentumMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: plan.steps,
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || bySlugAsc(a.slug, b.slug))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The model's constants and description, with the global median this snapshot produced. */
export function modelInfo(stats: PeerStats): ModelInfo {
  return {
    name: 'Peer-multiple implied value (radar-2)',
    summary:
      'Each pre-token protocol is priced off the market itself: the median market-cap/TVL multiple of the token-bearing protocols in its own category, applied to its TVL, then adjusted for 7-day momentum, maturity and chain breadth. The airdrop pool is the category family\u2019s usual community share of that value.',
    peer_multiple:
      'Median of mcap_usd / tvl_usd over token-bearing protocols in the same category. A category with fewer than 5 token peers is shrunk toward the global median with weight 8; the result is clamped to [0.03, 1.25].',
    global_peer_multiple: round4(stats.globalMedian),
    multiple_floor: MULTIPLE_FLOOR,
    multiple_cap: MULTIPLE_CAP,
    min_peers_full: MIN_PEERS_FULL,
    shrink_weight: SHRINK_WEIGHT,
    momentum: '1 + clamp(change_7d, -60, 120) / 100 x 0.5; a missing change counts as 0.',
    momentum_floor_pct: MOMENTUM_FLOOR_PCT,
    momentum_cap_pct: MOMENTUM_CAP_PCT,
    momentum_weight: MOMENTUM_WEIGHT,
    maturity: '0.6 + min(age_days, 1095) / 1095 x 0.4; an unknown listing date counts as 365 days.',
    maturity_floor: MATURITY_FLOOR,
    maturity_range: MATURITY_RANGE,
    maturity_days: MATURITY_DAYS,
    unknown_age_days: UNKNOWN_AGE_DAYS,
    breadth: '1 + 0.03 x min(chains - 1, 5).',
    breadth_per_chain: BREADTH_PER_CHAIN,
    breadth_max_extra_chains: BREADTH_MAX_EXTRA_CHAINS,
    alloc_share: {
      'lending, CDP and Dexs': ALLOC_SHARE.lending,
      'bridges': ALLOC_SHARE.bridge,
      'derivatives': ALLOC_SHARE.derivatives,
      'yield, curators and allocators': ALLOC_SHARE.yield,
      'staking and restaking': ALLOC_SHARE.staking,
      'everything else': ALLOC_SHARE.default,
    },
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const stats = peerStats(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: modelInfo(stats),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      base_usd: r.model.base_usd,
      peer_multiple: r.model.peer_multiple,
      peer_count: r.model.peer_count,
      momentum_mult: r.model.momentum_multiplier,
      maturity_mult: r.model.maturity_multiplier,
      breadth_mult: r.model.breadth_multiplier,
      airdrop_pool_usd: r.airdrop_pool_usd,
      plan_cost_usd: r.plan_cost_usd,
      pool_per_cost_usd: r.pool_per_cost_usd,
      watchlist: watch.has(r.slug),
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps, value cap. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const len = s.trim().length;
      if (len < 20 || len > 600) return `${r.slug} has a farm step of ${len} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > IMPLIED_CAP) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
