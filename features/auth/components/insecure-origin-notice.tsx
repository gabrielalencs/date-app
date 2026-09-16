import { headers } from "next/headers";
import { TriangleAlert } from "lucide-react";

import { originAllowsSessionCookie } from "@/lib/auth/config";

/**
 * Aviso de desenvolvimento: a origem não guarda o cookie de sessão.
 *
 * O `@neondatabase/auth` fixa `secure: true` e o prefixo `__Secure-`, sem opção
 * de desligar. O navegador então **descarta o cookie em silêncio** fora de
 * HTTPS, `localhost` ou loopback — e o sintoma é cruel: o login aceita a senha,
 * a Home chega a renderizar, e a navegação seguinte volta para /login sem erro
 * nenhum na tela. Indistinguível de sessão quebrada.
 *
 * A armadilha tem nome: é o endereço que o próprio `next dev` imprime como
 * "Network", `http://192.168.x.x:3000`, que funciona para todo o resto do app e
 * só falha na sessão.
 *
 * O aviso mora aqui, e não num `console.warn` do proxy, por um motivo medido: a
 * saída de console do proxy não aparece de forma confiável no terminal do Next
 * 16 com Turbopack. Quem está preso no laço de login vê **esta** tela, sempre.
 *
 * Não renderiza nada em produção.
 */
export async function InsecureOriginNotice() {
  if (process.env.NODE_ENV === "production") return null;

  const lista = await headers();
  const host = lista.get("host");
  if (!host) return null;

  const protocolo = lista.get("x-forwarded-proto") ?? "http";
  const origem = `${protocolo}://${host}`;

  if (originAllowsSessionCookie(origem)) return null;

  return (
    <aside
      role="alert"
      data-insecure-origin={origem}
      className="border-danger/40 bg-blush-soft text-text flex gap-3 rounded-md border p-4"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-2">
        <p className="type-body-s font-medium">
          A sessão não vai durar neste endereço.
        </p>
        <p className="type-meta text-text-muted">
          Você abriu o app em <code className="tnum">{origem}</code>. O cookie de
          sessão é <code>__Secure-</code> e o navegador o descarta fora de
          HTTPS, <code>localhost</code> ou <code>127.0.0.1</code>. O login vai
          parecer que funcionou e a próxima página vai devolver você para cá.
        </p>
        <p className="type-meta text-text-muted">
          Abra <code>http://localhost:3000</code> e faça login de novo.
        </p>
      </div>
    </aside>
  );
}
