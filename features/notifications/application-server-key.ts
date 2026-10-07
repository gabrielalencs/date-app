/**
 * A chave pública VAPID do lado do navegador.
 *
 * Fora do componente do Perfil para caber na suíte de unidade: é a comparação
 * daqui que decide trocar a inscrição de um aparelho (D-181), e errar para o
 * lado do "diferente" reinscreveria todo aparelho a cada visita ao Perfil.
 */

/**
 * Base64 URL-safe → `ArrayBuffer`, que é o que `applicationServerKey` aceita.
 *
 * Devolve o buffer, e não a view: o tipo do DOM pede `BufferSource` com
 * `ArrayBuffer` concreto, e um `Uint8Array` genérico não satisfaz por causa da
 * possibilidade de `SharedArrayBuffer`.
 */
export function applicationServerKeyBytes(base64: string): ArrayBuffer {
  const preenchido = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const normal = preenchido.replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(normal);
  const buffer = new ArrayBuffer(bruto.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bruto.length; i += 1) {
    bytes[i] = bruto.charCodeAt(i);
  }
  return buffer;
}

/**
 * Esta subscription foi feita com uma chave diferente da que o servidor usa?
 *
 * Só responde "sim" quando sabe. Navegador que não expõe a chave usada fica de
 * fora da troca: reinscrever a cada visita por falta de informação trocaria um
 * defeito raro por um custo certo.
 */
export function isSubscribedWithOtherKey(
  subscription: Pick<PushSubscription, "options">,
  key: ArrayBuffer,
): boolean {
  const usada = subscription.options?.applicationServerKey;
  if (!usada) return false;

  const a = new Uint8Array(usada);
  const b = new Uint8Array(key);
  return a.length !== b.length || a.some((byte, i) => byte !== b[i]);
}
