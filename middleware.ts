import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/auth",
  "/pay",
  "/api",
  "/_next",
  "/favicon.ico",
  "/terms",
  "/privacy",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // First-touch signup attribution: when a visitor arrives with UTM params or from an
  // external referrer, remember it for 30 days; createBusiness stores it on signup.
  // First touch wins — never overwritten by later visits.
  if (!request.cookies.get("pp_attr") && !pathname.startsWith("/api")) {
    const params = request.nextUrl.searchParams;
    const referer = request.headers.get("referer");
    let externalRef: string | null = null;
    try {
      if (referer && new URL(referer).host !== request.nextUrl.host) externalRef = referer;
    } catch {
      // unparseable referer — ignore
    }
    const hasUtm = ["utm_source", "utm_medium", "utm_campaign"].some((k) => params.get(k));
    if (hasUtm || externalRef) {
      response.cookies.set(
        "pp_attr",
        JSON.stringify({
          utm_source: params.get("utm_source"),
          utm_medium: params.get("utm_medium"),
          utm_campaign: params.get("utm_campaign"),
          referrer: externalRef,
          landing: pathname,
          at: new Date().toISOString(),
        }),
        { maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true, path: "/" }
      );
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
