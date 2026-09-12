import { readFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:4000";
const PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  [${passed ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function sessionCookie(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  const entry = raw.find((value) => value.startsWith("northstar_session="));
  return entry ? { raw: entry, value: entry.split(";")[0] } : null;
}

async function call(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload, response };
}

async function login(email) {
  return call("/api/auth/login", { method: "POST", body: { email, password: PASSWORD } });
}

async function uploadCsv(cookie, content, filename) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/csv" }), filename);
  const response = await fetch(`${API}/api/holdings/upload`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  return { status: response.status, payload: await response.json().catch(() => null) };
}

async function main() {
  console.log(`\nNorthstar verification against ${API}\n`);

  const ready = await call("/readyz");
  if (ready.status !== 200) {
    console.error(`API is not ready (${ready.status}). Start it with: docker compose up --build`);
    process.exit(1);
  }

  console.log("Authentication");

  const anonymous = await call("/api/auth/me");
  record("unauthenticated /me is rejected", anonymous.status === 401, `status ${anonymous.status}`);

  const wrongPassword = await call("/api/auth/login", {
    method: "POST",
    body: { email: "tenant_a@example.com", password: "not-the-password" },
  });
  record("wrong password is rejected", wrongPassword.status === 401, `status ${wrongPassword.status}`);

  const unknownEmail = await call("/api/auth/login", {
    method: "POST",
    body: { email: "nobody@example.com", password: PASSWORD },
  });
  record(
    "unknown email is indistinguishable from a wrong password",
    unknownEmail.status === 401 &&
      unknownEmail.payload?.error?.message === wrongPassword.payload?.error?.message,
    "no account enumeration",
  );

  const alpha = await login("tenant_a@example.com");
  const alphaCookie = sessionCookie(alpha.response);
  record("tenant A can log in", alpha.status === 200, alpha.payload?.user?.tenantName ?? "");

  record(
    "session cookie is HttpOnly and SameSite-scoped",
    Boolean(
      alphaCookie?.raw.toLowerCase().includes("httponly") &&
        alphaCookie?.raw.toLowerCase().includes("samesite"),
    ),
    alphaCookie?.raw.split(";").slice(1).join(";").trim(),
  );

  const beta = await login("tenant_b@example.com");
  const betaCookie = sessionCookie(beta.response);
  record("tenant B can log in", beta.status === 200, beta.payload?.user?.tenantName ?? "");

  const alphaMe = await call("/api/auth/me", { cookie: alphaCookie?.value });
  const betaMe = await call("/api/auth/me", { cookie: betaCookie?.value });
  record(
    "sessions resolve to different tenants",
    alphaMe.payload?.user?.tenantName === "Alpha Capital" &&
      betaMe.payload?.user?.tenantName === "Beacon Advisors",
    `${alphaMe.payload?.user?.tenantId} vs ${betaMe.payload?.user?.tenantId}`,
  );

  console.log("\nSession integrity");

  const [cookieName, token] = (alphaCookie?.value ?? "=").split("=");
  const segments = token.split(".");
  segments[1] = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(segments[1], "base64url").toString()), tid: "2" }),
  ).toString("base64url");
  const forged = await call("/api/auth/me", { cookie: `${cookieName}=${segments.join(".")}` });
  record("a re-signed tenant claim is rejected", forged.status === 401, `status ${forged.status}`);

  const garbage = await call("/api/auth/me", { cookie: "northstar_session=not-a-token" });
  record("a malformed session is rejected", garbage.status === 401, `status ${garbage.status}`);

  console.log("\nCSV ingestion");

  const good = readFileSync(new URL("../data/sample_good.csv", import.meta.url));
  const dirty = readFileSync(new URL("../data/sample_dirty.csv", import.meta.url));

  const goodUpload = await uploadCsv(alphaCookie.value, good, "sample_good.csv");
  record(
    "sample_good.csv is accepted",
    goodUpload.status === 201 && goodUpload.payload?.rowsIngested === 18,
    `${goodUpload.payload?.rowsIngested} rows`,
  );

  const dirtyUpload = await uploadCsv(alphaCookie.value, dirty, "sample_dirty.csv");
  const issue = dirtyUpload.payload?.error?.details?.issues?.[0];
  record(
    "sample_dirty.csv is rejected with a located reason",
    dirtyUpload.status === 422 && issue?.code === "DUPLICATE_ROW",
    issue ? `line ${issue.line}: ${issue.message}` : `status ${dirtyUpload.status}`,
  );

  const reupload = await uploadCsv(alphaCookie.value, good, "sample_good.csv");
  record("re-uploading the same file is idempotent", reupload.status === 201);

  const broken = await uploadCsv(alphaCookie.value, "not,a,valid\nheader\n", "broken.csv");
  record(
    "a malformed file fails without crashing",
    broken.status === 422 || broken.status === 400,
    `status ${broken.status}`,
  );

  console.log("\nComputed values");

  const alphaSummary = await call("/api/portfolio/summary", { cookie: alphaCookie.value });
  const summary = alphaSummary.payload;

  record(
    "start market value is 92600.00",
    summary?.startMarketValue === "92600.00",
    String(summary?.startMarketValue),
  );
  record(
    "end market value is 96400.00",
    summary?.endMarketValue === "96400.00",
    String(summary?.endMarketValue),
  );
  record(
    "period return is 4.1037%",
    Number(summary?.periodReturn).toFixed(6) === "0.041037",
    `${(Number(summary?.periodReturn) * 100).toFixed(4)}%`,
  );
  record(
    "the duplicate did not inflate the totals",
    summary?.endMarketValue !== "115900.00",
    "an unchecked duplicate would give 115900.00 and 25.16%",
  );

  const equity = summary?.byAssetClass?.find((entry) => entry.assetClass === "Equity");
  record(
    "asset classes break down correctly",
    summary?.byAssetClass?.length === 3 && equity?.marketValue === "55850.00",
    summary?.byAssetClass?.map((entry) => `${entry.assetClass} ${entry.marketValue}`).join(", "),
  );

  console.log("\nTenant isolation");

  await uploadCsv(
    betaCookie.value,
    "date,ticker,asset_class,quantity,price\n2026-03-01,TSLA,Equity,10,250.00\n",
    "beacon.csv",
  );

  const betaSummary = await call("/api/portfolio/summary", { cookie: betaCookie.value });
  record(
    "tenant B sees only its own holdings",
    betaSummary.payload?.endMarketValue === "2500.00",
    `${betaSummary.payload?.endMarketValue} vs tenant A's ${summary?.endMarketValue}`,
  );

  const injected = await call("/api/portfolio/summary?tenantId=2&tenant_id=2", {
    cookie: alphaCookie.value,
  });
  record(
    "a crafted tenantId query parameter is ignored",
    injected.payload?.endMarketValue === "96400.00",
    `still ${injected.payload?.endMarketValue}`,
  );

  const noSession = await call("/api/portfolio/summary");
  record("summary requires a session", noSession.status === 401, `status ${noSession.status}`);

  const redirectForm = new FormData();
  redirectForm.append(
    "file",
    new Blob(["date,ticker,asset_class,quantity,price\n2026-04-01,XYZ,Equity,1,1.00\n"], {
      type: "text/csv",
    }),
    "x.csv",
  );
  redirectForm.append("tenantId", "2");
  const crossUpload = await fetch(`${API}/api/holdings/upload`, {
    method: "POST",
    headers: { cookie: alphaCookie.value },
    body: redirectForm,
  });

  const betaAfter = await call("/api/portfolio/summary", { cookie: betaCookie.value });
  record(
    "an upload cannot be redirected at another tenant",
    betaAfter.payload?.endMarketValue === "2500.00",
    `tenant B unchanged (upload returned ${crossUpload.status})`,
  );

    const cleared = await call("/api/holdings", { method: "DELETE", cookie: alphaCookie.value });
  const alphaAfterClear = await call("/api/portfolio/summary", { cookie: alphaCookie.value });
  const betaAfterClear = await call("/api/portfolio/summary", { cookie: betaCookie.value });
  record(
    "clearing holdings only removes the caller's own rows",
    alphaAfterClear.payload?.hasData === false && betaAfterClear.payload?.endMarketValue === "2500.00",
    `tenant A cleared ${cleared.payload?.deleted} rows, tenant B still ${betaAfterClear.payload?.endMarketValue}`,
  );

  const loggedOut = await call("/api/auth/logout", { method: "POST", cookie: alphaCookie.value });
  record("logout succeeds", loggedOut.status === 204, `status ${loggedOut.status}`);

  const failed = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nverification could not run:", error.message);
  process.exit(1);
});