import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Forward to Formspree
    const formspreeRes = await fetch("https://formspree.io/f/xnjoljgl", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        _subject: "New Camp Rally Lead — Newsletter",
        source: "camprally.co",
      }),
    });

    if (formspreeRes.ok) {
      return NextResponse.json({ message: "Subscribed!", subscribed: true });
    } else {
      const data = await formspreeRes.json();
      return NextResponse.json(
        { error: data.error || "Failed to subscribe" },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Subscribe API error:", message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
