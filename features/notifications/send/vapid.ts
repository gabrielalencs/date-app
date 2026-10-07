import "server-only";

import { createECDH } from "node:crypto";

/**
 * A chave privada gera a pública? (D-181)
 *
 * O `web-push` confere o formato de cada chave, mas não confere se as duas são
 * do mesmo par. Com um par trocado — a pública de uma geração e a privada de
 * outra, que é o que sobra de uma rotação feita pela metade —, o navegador se
 * inscreve com uma chave, o servidor assina com outra e todo push volta
 * recusado: 403 do FCM, `VapidPkHashMismatch` da Apple. Para quem usa, o
 * sintoma é idêntico ao de uma subscription ausente: nada chega, e o Perfil diz
 * que está tudo bem.
 *
 * Em P-256 a pública é o ponto que a privada gera, então recalcular responde a
 * pergunta com uma operação de curva e nenhuma rede.
 */
export function vapidPairMatches(
  publicKey: string,
  privateKey: string,
): boolean {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    return ecdh.getPublicKey().equals(Buffer.from(publicKey, "base64url"));
  } catch {
    /* Chave que não decodifica ou fora da curva: não é par de nada. */
    return false;
  }
}
