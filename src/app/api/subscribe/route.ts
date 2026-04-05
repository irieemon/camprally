import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Use /tmp for ephemeral storage on Vercel serverless
    // Note: Data is lost on cold start / new instance
    const filePath = join("/tmp", "camprally-subscribers.json");

    let subscribers: string[] = [];

    if (existsSync(filePath)) {
      try {
        const data = readFileSync(filePath, "utf-8");
        subscribers = JSON.parse(data);
      } catch {
        subscribers = [];
      }
    }

    if (subscribers.includes(email)) {
      return NextResponse.json({ message: "Already subscribed!", subscribed: true });
    }

    subscribers.push(email);
    writeFileSync(filePath, JSON.stringify(subscribers, null, 2));

    return NextResponse.json({ 
      message: "Subscribed!", 
      subscribed: true,
      count: subscribers.length 
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Subscribe API error:", message);
    return NextResponse.json({ error: "Server error", detail: message }, { status: 500 });
  }
}
