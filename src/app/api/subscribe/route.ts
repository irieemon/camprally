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

    const apiKey = process.env.BEEHIIV_API_KEY;
    const publicationId = process.env.BEEHIIV_PUBLICATION_ID;

    if (!apiKey || !publicationId) {
      console.error("Beehiiv not configured — missing API key or publication ID");
      return NextResponse.json(
        { error: "Newsletter signup is not configured. Please try again later." },
        { status: 500 }
      );
    }

    const beehiivRes = await fetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
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
