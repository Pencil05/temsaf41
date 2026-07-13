import { NextResponse } from "next/server";
import { createSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { authenticateUser } from "@/lib/google-sheets";

export async function POST(request: Request) {
  try {
    const { email, password } = (await request.json()) as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
    }

    const user = await authenticateUser(email, password);

    if (!user) {
      return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    }

    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE_NAME, createSessionValue(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    console.error("TEMS login failed", error);
    return NextResponse.json(
      { error: "Unable to sign in. Check the Google Sheets configuration and try again." },
      { status: 503 },
    );
  }
}
