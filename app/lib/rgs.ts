// RGS backend client for hilo.
//
// At build time NEXT_PUBLIC_RGS_API_BASE is empty by default → same-origin
// (nginx proxies /api/* to the RGS). For local dev, set it to the RGS URL.

const API_BASE = process.env.NEXT_PUBLIC_RGS_API_BASE ?? "";
const GAME_UUID = process.env.NEXT_PUBLIC_HILO_GAME_UUID ?? "hilo_965";

export const HILO_GAME_UUID = GAME_UUID;

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
}

export function getToken(): string | null {
  return token;
}

interface ApiOpts {
  method?: string;
  body?: unknown;
}

interface ApiError extends Error {
  errorCode?: string;
  errorDescription?: string;
}

async function call<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(API_BASE + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown> & T;

  if (typeof data === "object" && data && "error_code" in data) {
    const err: ApiError = new Error(
      (data as { error_description?: string }).error_description ||
        String((data as { error_code?: string }).error_code)
    );
    err.errorCode = (data as { error_code?: string }).error_code;
    err.errorDescription = (data as { error_description?: string }).error_description;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return data as T;
}

// --- Concrete endpoints ---

export interface InitDemoResponse {
  url: string;
}

export interface RankInfo {
  rank: string;
  value: number;
  higher_multiplier: string;
  lower_multiplier: string;
  higher_probability: string;
  lower_probability: string;
}

export interface HiloGameData {
  ranks: string[];
  suits: string[];
  rank_info: RankInfo[];
  max_skips: number;
  house_edge: string;
  rtp: string;
}

export interface StateResponse {
  balance: string;
  currency: string;
  config: {
    min_bet: string;
    max_bet: string;
    rtp: string;
    max_payout?: string;
  };
  game_data?: HiloGameData;
  next_seed_hash: string;
  client_seed?: string;
  active_round_id?: string;
}

export interface BetResponse {
  round_id: string;
  outcome: string; // "active" | "bust" | "cashout"
  finished: boolean;
  total_cost: string;
  total_payout: string;
  profit: string;
  balance: string;
  currency: string;
  multiplier?: string;
  seed_hash: string;
  client_seed: string;
  next_seed_hash: string;
  server_seed?: string;
  game_data: Record<string, unknown>;
}

export async function initDemo(): Promise<string> {
  const r = await call<InitDemoResponse>("/api/v1/init-demo", {
    method: "POST",
    body: { game_uuid: GAME_UUID },
  });
  const u = new URL(r.url, "http://x");
  const t = u.searchParams.get("token");
  if (!t) throw new Error("init-demo: missing token in url");
  setToken(t);
  return t;
}

export function getState(): Promise<StateResponse> {
  return call<StateResponse>("/api/v1/state");
}

export function placeBet(amount: number): Promise<BetResponse> {
  return call<BetResponse>("/api/v1/bet", {
    method: "POST",
    body: { amount: amount.toFixed(2) },
  });
}

export function actGuess(roundId: string, direction: "higher" | "lower"): Promise<BetResponse> {
  return call<BetResponse>(`/api/v1/round/${roundId}/action`, {
    method: "POST",
    body: { type: "guess", direction },
  });
}

export function actSkip(roundId: string): Promise<BetResponse> {
  return call<BetResponse>(`/api/v1/round/${roundId}/action`, {
    method: "POST",
    body: { type: "skip" },
  });
}

export function cashout(roundId: string): Promise<BetResponse> {
  return call<BetResponse>(`/api/v1/round/${roundId}/cashout`, {
    method: "POST",
    body: {},
  });
}
