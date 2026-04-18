import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Derive origin from the incoming request so the redirect works on
  // any deployed host (vercel.app, custom domain, localhost) without
  // depending on NEXT_PUBLIC_SITE_URL being set. Status 303 forces the
  // browser to follow the redirect as GET — without it, the form POST
  // method carries over to /login and breaks.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
