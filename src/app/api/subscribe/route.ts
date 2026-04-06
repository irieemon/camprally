import { NextRequest, NextResponse } from "next/server";

/**
 * Beehiiv Subscription API Route
 * Uses Beehiiv's API to subscribe emails directly.
 * Docs: https://developers.beehiiv.com/api-reference/subscriptions
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_BEEHIIV_PUBLISHABLE_KEY;
    const publicationId = process.env.BEECIIV_PUBLICATION_ID;
    const subscribeUrl = process.env.NEXT_PUBLIC_BEEHIIV_SUBSCRIBE_URL;

    if (!apiKey || !publicationId) {
      console.error("Beehiiv not configured — missing API key or publication ID");
      return NextResponse.json(
        { error: "Newsletter signup is not configured. Please try again later." },
        { status: 500 }
      );
    }

    // Try Beehiiv API first
    const beehiivRes = await fetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscribers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ email, double_opt_in: false }),
      }
    );

    if (beehiivRes.ok) {
      return NextResponse.json({ message: "Subscribed!", subscribed: true });
    }

    // If API fails (e.g. email already subscribed), fall back to Beehiiv's hosted subscribe page
    if (subscribeUrl) {
      const fallbackRes = await fetch(`${subscribeUrl}?email=${encodeURIComponent(email)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (fallbackRes.ok) {
        return NextResponse.json({ message: "Subscribed!", subscribed: true });
      }
    }

    let errorMessage = "Failed to subscribe";
    try {
      const errorData = await beehiivRes.json();
      if (errorData?.error) errorMessage = errorData.error;
    } catch { /* ignore */ }

    return NextResponse.json(
      { error: errorMessage },
      { status: beehiivRes.status >= 500 ? 502 : 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Subscribe API error:", message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
