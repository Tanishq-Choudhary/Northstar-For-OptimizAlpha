const BASE = import.meta.env.VITE_API_URL ?? "";

export interface User {
  id: string;
  email: string;
  tenantId: string;
  tenantName: string;
}

export interface AssetClassSlice {
  assetClass: string;
  marketValue: string;
  positions: number;
}

export interface PortfolioSummary {
  hasData: boolean;
  startDate: string | null;
  endDate: string | null;
  startMarketValue: string | null;
  endMarketValue: string | null;
  periodReturn: string | null;
  byAssetClass: AssetClassSlice[];
}

export interface UploadIssue {
  line: number;
  column: string | null;
  code: string;
  message: string;
}

export interface UploadResult {
  accepted: true;
  rowsIngested: number;
  rowsSkipped: number;
  skipped: UploadIssue[];
  startDate: string;
  endDate: string;
  assetClasses: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: UploadIssue[] = [],
    readonly truncated = false,
    readonly canSkipInvalidRows = false,
    readonly validRowCount = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, { credentials: "include", ...init });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check that the API is running.");
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details?.issues ?? [],
      Boolean(error?.details?.truncated),
      Boolean(error?.details?.canSkipInvalidRows),
      Number(error?.details?.validRowCount ?? 0),
    );
  }

  return payload as T;
}

export const api = {
  me: () => request<{ user: User }>("/api/auth/me").then((data) => data.user),

  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((data) => data.user),

  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  summary: () => request<PortfolioSummary>("/api/portfolio/summary"),

  clearHoldings: () =>
    request<{ deleted: number }>("/api/holdings", { method: "DELETE" }).then((data) => data.deleted),

  upload: (file: File, skipInvalidRows = false) => {
    const form = new FormData();
    form.append("file", file);
    const query = skipInvalidRows ? "?mode=skip-invalid" : "";
    return request<UploadResult>(`/api/holdings/upload${query}`, { method: "POST", body: form });
  },
};