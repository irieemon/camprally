"use client";

import { useState } from "react";

/**
 * Beehiiv Newsletter Subscribe Form — CampRally "Stay Trail-Ready"
 *
 * Uses Beehiiv's API directly from the browser.
 * The publishable key is safe client-side — only allows creating free subscriptions.
 */

const BEEHIIV_API_KEY = "xDG26YxedOSbEMOEdWV81PC2dirHCLMhFYXnMRPvkGmobnAcP2D3XhfWmOBbS6BK";
const BEEHIIV_PUB_ID = "pub_f458a1a4-a8f2-475e-815f-c0a1738a19a2";

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
      const res = await fetch(
        `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB_ID}/subscriptions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${BEEHIIV_API_KEY}`,
          },
          body: JSON.stringify({ email, double_opt_in: false }),
        }
      );

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else if (res.status === 400) {
        // Email already subscribed — treat as success
        setStatus("success");
        setEmail("");
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setErrorMsg((data as { error?: string }).error || "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Connection failed. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-lg bg-white/10 border border-white/20 p-4 text-sm text-white">
        <p className="font-semibold text-white">🎉 You&apos;re in!</p>
        <p className="text-white/70 mt-1">Check your inbox — welcome to CampRally!</p>
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
