"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Header({ email }: { email?: string | null }) {
  const router = useRouter();

  async function sair() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topo">
      <Link href="/" className="marca">
        <span className="marca-ponto" aria-hidden />
        Monitor de Sensores
      </Link>
      <div className="topo-dir">
        {email && <span className="topo-email">{email}</span>}
        <button className="botao botao-sec" onClick={sair}>
          Sair
        </button>
      </div>
    </header>
  );
}
