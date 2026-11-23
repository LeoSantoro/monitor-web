import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return new NextResponse(
      "Configuração ausente: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "nas Environment Variables do Vercel e faça Redeploy.",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    return NextResponse.redirect(destino);
  }

  if (user && isLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    return NextResponse.redirect(destino);
  }

  return response;
}

export const config = {
  // /api/* fica fora: a rota do ESP32 usa token próprio, não sessão.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
