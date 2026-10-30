import { NextResponse } from "next/server";
import { handleSendEmail } from "@/lib/emailDispatcher";

export async function POST(request: Request) {
  return handleSendEmail(request);
}