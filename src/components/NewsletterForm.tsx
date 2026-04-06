"use client";

import { useState, useEffect } from "react";

/**
 * Beehiiv Newsletter Subscribe Form — CampRally "Stay Trail-Ready"
 *
 * This form embeds Beehiiv's hosted subscribe page in an iframe.
 * Setup:
 * 1. Set up Beehiiv (app.beehiiv.com) with publication name "camp-rally"
 *    → your subscribe URL will be: https://camp-rally.beehiiv.com/subscribe
 * 2. Copy .env.local.example → .env.local and fill in your Beehiiv values
 * 3. The form below will load the Beehiiv embed automatically once configured.
 */

const BEEHIIV_SUBSCRIBE_URL = process.env.NEXT_PUBLIC_BEEHIIV_SUBSCRIBE_URL || "";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [useIframe, setUseIframe] = useState(false);

  // If Beehiiv URL is configured, use the iframe embed approach
  // Otherwise fall back to API route
  useEffect(() => {
    if (BEEHIIV_SUBSCRIBE_URL) {
      setUseIframe(true);
    }
  }, []);

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
        setErrorMsg(data.error || "Something went wrong");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Connection failed. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-lg bg-white/10 border border-white/20 p-4 text-sm text-white">
        <p className="font-semibold text-white">🎉 You're in!</p>
        <p className="text-white/70 mt-1">Check your inbox for a welcome email.</p>
      </div>
    );
  }

  // Beehiiv iframe embed — loads Beehiiv's hosted subscribe form directly
  // No API key needed; Beehiiv hosts the form
  if (useIframe) {
    return (
      <div className="w-full">
        <iframe
          src={`${BEEHIIV_SUBSCRIBE_URL}`}
          width="100%"
          height={useIframe ? 180 : 0}
          style={{ border: "none", background: "transparent" }}
          title="Subscribe to Stay Trail-Ready"
          allow="clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          onLoad={() => setUseIframe(true)}
        />
        {/* Fallback link if iframe is blocked */}
        <noscript>
          <a
            href={BEEHIIV_SUBSCRIBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-2 text-sm text-white/60 hover:text-white text-center"
          >
            Subscribe on Beehiiv →
          </a>
        </noscript>
      </div>
    );
  }

  // API-based form (before Beehiiv is configured, or as fallback)
  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          disabled={status === "loading"}
          className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-lg bg-camp-orange px-5 py-2 text-sm font-semibold text-white transition hover:bg-camp-orange/90 disabled:opacity-50"
        >
          {status === "loading" ? "..." : "→"}
        </button>
      </form>
      {status === "error" && errorMsg && (
        <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
