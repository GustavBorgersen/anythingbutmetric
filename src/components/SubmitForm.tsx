"use client";
import { useState, useRef } from "react";

interface Props { onSuccess?: () => void; }
type Status = "idle" | "loading" | "success" | "error";

export default function SubmitForm({ onSuccess }: Props) {
  const [url, setUrl] = useState("");
  const [notRobot, setNotRobot] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const trapRef = useRef<HTMLInputElement>(null);

  const canSubmit = url.trim().length > 0 && notRobot && status !== "loading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), notRobot, _trap: trapRef.current?.value ?? "" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) { setStatus("success"); onSuccess?.(); }
      else { setStatus("error"); setErrorMsg(data.error ?? "Submission failed."); }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg bg-emerald-900/30 border border-emerald-700 p-3 text-sm text-emerald-300">
        Submitted! The scraper will check the article shortly. If comparisons are found,
        a pull request will be opened for review.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input ref={trapRef} type="text" name="website"
             tabIndex={-1} autoComplete="off" aria-hidden="true"
             style={{ display: "none" }} />
      <div>
        <label htmlFor="submit-url" className="block text-xs text-zinc-400 mb-1">
          Article URL
        </label>
        <input id="submit-url" type="url" value={url}
               onChange={(e) => setUrl(e.target.value)}
               placeholder="https://www.bbc.co.uk/news/…"
               className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm
                          text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1
                          focus:ring-amber-500"
               required disabled={status === "loading"} />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-400 select-none cursor-pointer">
        <input type="checkbox" checked={notRobot}
               onChange={(e) => setNotRobot(e.target.checked)}
               disabled={status === "loading"}
               className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
        I&apos;m not a robot
      </label>
      {status === "error" && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-2 text-xs text-red-300">
          {errorMsg}
        </div>
      )}
      <button type="submit" disabled={!canSubmit}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40
                         disabled:cursor-not-allowed text-zinc-900 font-semibold text-sm
                         px-4 py-2 transition-colors">
        {status === "loading" ? "Submitting…" : "Submit article"}
      </button>
    </form>
  );
}
