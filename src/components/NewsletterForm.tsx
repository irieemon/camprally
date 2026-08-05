"use client";

import { useState } from "react";

/**
 * `tone` exists because this form appears on two very different surfaces: the
 * deep-green newsletter band and the white article sidebar. It was styled for
 * white-on-dark only, so in the sidebar the input label, placeholder and
 * confirmation text were white on a near-white card — invisible.
 */
type Tone = "dark" | "light";

const STYLES: Record<Tone, {
  input: string;
  note: string;
  panel: string;
  panelTitle: string;
  panelBody: string;
  error: string;
}> = {
  dark: {
    input:
      "border-white/25 bg-white/10 text-white placeholder:text-white/50 focus:border-white/60 focus:ring-white/25",
    note: "text-white/55",
    panel: "border-white/20 bg-white/10",
    panelTitle: "text-white",
    panelBody: "text-white/75",
    error: "text-red-300",
  },
  light: {
    input:
      "border-camp-stone bg-background text-foreground placeholder:text-muted-foreground focus:border-camp-green focus:ring-camp-green/20",
    note: "text-muted-foreground",
    panel: "border-camp-green/25 bg-camp-green/5",
    panelTitle: "text-camp-green",
    panelBody: "text-muted-foreground",
    error: "text-destructive",
  },
};

export default function NewsletterForm({ tone = "dark" }: { tone?: Tone }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const s = STYLES[tone];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Connection failed. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className={`border p-4 text-sm ${s.panel}`}>
        <p className={`font-semibold ${s.panelTitle}`}>You&apos;re in.</p>
        <p className={`mt-1 ${s.panelBody}`}>
          Check your inbox — welcome to CampRally.
        </p>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          disabled={status === "loading"}
          className={`h-12 flex-1 border px-4 text-[0.9375rem] transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 ${s.input}`}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="h-12 shrink-0 bg-camp-ember px-6 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-camp-ember-deep disabled:opacity-50"
        >
          {status === "loading" ? "Joining…" : "Sign up"}
        </button>
      </form>
      {status === "error" && errorMsg && (
        <p className={`mt-2 text-xs ${s.error}`}>{errorMsg}</p>
      )}
      <p className={`mt-3 text-xs ${s.note}`}>
        Free camping tips. No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
