import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const filePath = join(process.cwd(), "subscribers.json");
    let subscribers: string[] = [];

    if (existsSync(filePath)) {
      const data = readFileSync(filePath, "utf-8");
      subscribers = JSON.parse(data);
    }

    if (subscribers.includes(email)) {
      return NextResponse.json({ message: "Already subscribed!" });
    }

    subscribers.push(email);
    writeFileSync(filePath, JSON.stringify(subscribers, null, 2));

    return NextResponse.json({ message: "Subscribed!", count: subscribers.length });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
