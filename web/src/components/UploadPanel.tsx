import { useRef, useState } from "react";
import { ApiError, api, type UploadIssue, type UploadResult } from "../api/client";

const MAX_BYTES = 5 * 1024 * 1024;

const TEMPLATE = [
  "date,ticker,asset_class,quantity,price",
  "2026-01-01,AAPL,Equity,100,180.00",
  "2026-01-01,BND,Bond,200,70.00",
  "2026-06-30,AAPL,Equity,100,195.00",
  "2026-06-30,BND,Bond,200,69.00",
  "",
].join("\n");

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "holdings-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "done"; name: string; result: UploadResult }
  | {
      kind: "failed";
      name: string;
      message: string;
      issues: UploadIssue[];
      truncated: boolean;
      canSkip: boolean;
      validRowCount: number;
    };

function IssueTable({ issues }: { issues: UploadIssue[] }) {
  return (
    <table className="w-full min-w-[380px] text-[12px]">
      <thead>
        <tr className="text-muted">
          <th className="w-14 px-4 py-1.5 text-left font-medium">Line</th>
          <th className="w-24 px-4 py-1.5 text-left font-medium">Field</th>
          <th className="px-4 py-1.5 text-left font-medium">Problem</th>
        </tr>
      </thead>
      <tbody>
        {issues.map((issue, index) => (
          <tr key={`${issue.line}-${issue.code}-${index}`} className="align-top">
            <td className="num px-4 py-1.5 text-ink-soft">{issue.line}</td>
            <td className="px-4 py-1.5 text-ink-soft">{issue.column ?? "row"}</td>
            <td className="px-4 py-1.5 text-ink-soft">{issue.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (file: File, skipInvalidRows = false) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setStatus({
        kind: "failed",
        name: file.name,
        message: "Only .csv files are accepted.",
        issues: [],
        truncated: false,
        canSkip: false,
        validRowCount: 0,
      });
      return;
    }

    if (file.size > MAX_BYTES) {
      setStatus({
        kind: "failed",
        name: file.name,
        message: "That file is larger than the 5 MB limit.",
        issues: [],
        truncated: false,
        canSkip: false,
        validRowCount: 0,
      });
      return;
    }

    setPending(file);
    setStatus({ kind: "uploading", name: file.name });

    try {
      const result = await api.upload(file, skipInvalidRows);
      setStatus({ kind: "done", name: file.name, result });
      onUploaded();
    } catch (error) {
      const failure = error as ApiError;
      setStatus({
        kind: "failed",
        name: file.name,
        message: failure.message,
        issues: failure.issues ?? [],
        truncated: failure.truncated ?? false,
        canSkip: failure.canSkipInvalidRows ?? false,
        validRowCount: failure.validRowCount ?? 0,
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const busy = status.kind === "uploading";

  return (
    <div className="px-4 py-5 sm:px-5">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void submit(file);
        }}
        className={`rounded-sm border border-dashed transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface/50"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full px-6 pt-8 pb-2 text-center disabled:opacity-50"
        >
          <span className="block text-[13px] text-ink-soft">
            Drop a holdings CSV here, or{" "}
            <span className="font-medium text-accent underline underline-offset-2">choose a file</span>
          </span>
          <span className="mt-1.5 block text-[12px] text-muted">
            Columns: date, ticker, asset_class, quantity, price · up to 5 MB
          </span>
        </button>
        <div className="px-6 pb-7 text-center">
          <button
            type="button"
            onClick={downloadTemplate}
            className="text-[12px] text-muted underline underline-offset-2 hover:text-accent"
          >
            Download a template
          </button>
        </div>
        <input
          ref={inputRef}
          id="holdings-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void submit(file);
          }}
        />
      </div>

      {status.kind === "uploading" ? (
        <p className="mt-3 text-[13px] text-muted">Checking {status.name}…</p>
      ) : null}

      {status.kind === "done" ? (
        <div className="mt-3 rounded-sm border border-line bg-surface/50 px-4 py-3">
          <p className="text-[13px] text-up">
            Imported {status.result.rowsIngested} rows from {status.name}, covering{" "}
            {status.result.startDate} to {status.result.endDate}.
          </p>
          {status.result.rowsSkipped > 0 ? (
            <p className="mt-1 text-[12px] text-muted">
              {status.result.rowsSkipped} problem row(s) were left out.
            </p>
          ) : null}
        </div>
      ) : null}

      {status.kind === "failed" ? (
        <div className="mt-3 rounded-sm border border-down/25 bg-down-soft">
          <p className="border-b border-down/15 px-4 py-2.5 text-[13px] font-medium text-down">
            {status.name} was not imported — {status.message}
          </p>

          {status.issues.length > 0 ? (
            <div className="overflow-x-auto">
              <IssueTable issues={status.issues} />
            </div>
          ) : null}

          {status.truncated ? (
            <p className="px-4 py-1.5 text-[12px] text-muted">Only the first 100 problems are listed.</p>
          ) : null}

          {status.canSkip && pending ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-down/15 px-4 py-2.5">
              <p className="text-[12px] text-ink-soft">
                Fix the file and upload again, or import the {status.validRowCount} valid rows without
                these.
              </p>
              <button
                type="button"
                onClick={() => void submit(pending, true)}
                className="ml-auto rounded-sm border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-accent hover:text-accent"
              >
                Import {status.validRowCount} valid rows
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}