import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Use a persistent data directory
    const dataDir = join(process.cwd(), "data");
    const filePath = join(dataDir, "subscribers.json");

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

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
    
    try {
      writeFileSync(filePath, JSON.stringify(subscribers, null, 2));
    } catch (writeErr) {
      console.error("Failed to write subscribers file:", writeErr);
      // Continue anyway - email was still received
    }

    return NextResponse.json({ 
      message: "Subscribed!", 
      subscribed: true,
      count: subscribers.length 
    });
  } catch (err) {
    console.error("Subscribe API error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
