"use client";

import { useState } from "react";

/**
 * Beehiiv Newsletter Subscribe Form — CampRally "Stay Trail-Ready"
 *
 * Uses Beehiiv's public subscribe URL directly from the browser.
 * The publishable key is safe to expose client-side — it only allows
 * creating free subscriptions, nothing else.
 *
 * Setup:
 * 1. Beehiiv publication: https://camp-rally.beehiiv.com
 * 2. Publishable key (pk_live_...) — safe for client use
 */

const BEEHIIV_SUBSCRIBE_URL = "https://camp-rally.beehiiv.com/subscribe";
const BEEHIIV_PUBLISHABLE_KEY = "xDG26YxedOSbEMOEdWV81PC2dirHCLMhFYXnMRPvkGmobnAcP2D3XhfWmOBbS6BK";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      // Post directly to Beehiiv's public subscribe endpoint
      const res = await fetch(
        `${BEEHIIV_SUBSCRIBE_URL}/subscribe/post?mailingId=${BEEHIIV_PUBLISHABLE_KEY}&email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      // Beehiiv returns 200 on success, 400 on already subscribed, etc.
      if (res.ok || res.redirected) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again.");
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
        <p className="text-white/70 mt-1">Check your inbox for a welcome email from Beehiiv.</p>
      </div>
    );
  }

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
      <p className="mt-2 text-xs text-white/40">
        Free camping tips. No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
