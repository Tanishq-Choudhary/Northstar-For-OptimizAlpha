import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseHoldingsCsv } from "../src/csv/holdings-csv.js";

const OPTIONS = { maxRows: 50_000, today: "2026-09-12" };
const HEADER = "date,ticker,asset_class,quantity,price";

const read = (name: string) => readFileSync(new URL(`../../data/${name}`, import.meta.url));
const build = (...rows: string[]) => Buffer.from([HEADER, ...rows, ""].join("\n"));

test("accepts the clean sample in full", async () => {
  const result = await parseHoldingsCsv(read("sample_good.csv"), OPTIONS);

  assert.equal(result.fatal, false);
  assert.equal(result.issues.length, 0);
  assert.equal(result.rows.length, 18);
});

test("locates the duplicate in the dirty sample without discarding the good rows", async () => {
  const result = await parseHoldingsCsv(read("sample_dirty.csv"), OPTIONS);

  assert.equal(result.fatal, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]?.code, "DUPLICATE_ROW");
  assert.equal(result.issues[0]?.line, 20);
  assert.equal(result.rows.length, 18);
});

test("distinguishes an exact duplicate from a contradicting one", async () => {
  const result = await parseHoldingsCsv(
    build("2026-01-01,AAPL,Equity,100,180.00", "2026-01-01,AAPL,Equity,100,999.00"),
    OPTIONS,
  );

  assert.equal(result.issues[0]?.code, "CONFLICTING_DUPLICATE");
  assert.equal(result.rows.length, 1);
});

test("rejects impossible calendar dates and future dates", async () => {
  const impossible = await parseHoldingsCsv(build("2026-02-30,AAPL,Equity,1,1.00"), OPTIONS);
  assert.equal(impossible.issues[0]?.code, "INVALID_DATE");

  const future = await parseHoldingsCsv(build("2027-01-01,AAPL,Equity,1,1.00"), OPTIONS);
  assert.equal(future.issues[0]?.code, "FUTURE_DATE");
});

test("rejects missing, negative and non-numeric values", async () => {
  const missing = await parseHoldingsCsv(build("2026-01-01,,Equity,1,1.00"), OPTIONS);
  assert.equal(missing.issues[0]?.code, "MISSING_VALUE");

  const negative = await parseHoldingsCsv(build("2026-01-01,AAPL,Equity,-1,1.00"), OPTIONS);
  assert.equal(negative.issues[0]?.code, "NEGATIVE_VALUE");

  const text = await parseHoldingsCsv(build("2026-01-01,AAPL,Equity,abc,1.00"), OPTIONS);
  assert.equal(text.issues[0]?.code, "INVALID_NUMBER");
});

test("treats structural damage as fatal so partial import is never offered", async () => {
  const noColumn = await parseHoldingsCsv(
    Buffer.from("date,ticker,quantity,price\n2026-01-01,AAPL,1,1.00\n"),
    OPTIONS,
  );
  assert.equal(noColumn.fatal, true);
  assert.equal(noColumn.issues[0]?.code, "MISSING_COLUMNS");

  const ragged = await parseHoldingsCsv(build("2026-01-01,AAPL,Equity,1"), OPTIONS);
  assert.equal(ragged.fatal, true);

  const empty = await parseHoldingsCsv(Buffer.from(`${HEADER}\n`), OPTIONS);
  assert.equal(empty.fatal, true);
  assert.equal(empty.issues[0]?.code, "EMPTY_FILE");
});

test("survives a byte order mark, CRLF endings and untidy headers", async () => {
  const result = await parseHoldingsCsv(
    Buffer.from("\uFEFF Date ,TICKER, Asset Class ,Quantity,Price\r\n2026-01-01,aapl, Equity ,100,180.00\r\n"),
    OPTIONS,
  );

  assert.equal(result.issues.length, 0);
  assert.equal(result.rows[0]?.ticker, "AAPL");
  assert.equal(result.rows[0]?.assetClass, "Equity");
});

test("preserves decimal values as strings so no float rounding occurs", async () => {
  const result = await parseHoldingsCsv(build("2026-01-01,AAPL,Equity,3,0.10000001"), OPTIONS);

  assert.equal(result.rows[0]?.price, "0.10000001");
  assert.equal(typeof result.rows[0]?.quantity, "string");
});