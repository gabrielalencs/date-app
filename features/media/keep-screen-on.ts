/**
 * Converter um minuto de vídeo, ou reduzir uma fila de fotos, leva tempo — e o
 * Android apaga a tela e congela a aba nesse meio-tempo. Pedir a tela acesa
 * durante o trabalho é o que deixa a pessoa largar o celular na mesa. Sem
 * suporte, segue sem.
 *
 * O navegador solta a trava sozinho quando a aba some — trocar de app,
 * bloquear o celular. Ao voltar, o trabalho continua de onde parou, então a
 * trava é pedida de novo, até quem a pediu soltar.
 *
 * Devolve a função que solta a trava; chamá-la mais de uma vez não faz mal.
 */
export async function manterTelaAcesa(): Promise<() => void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    return () => {};
  }

  let trava: WakeLockSentinel | null = null;
  let solta = false;

  async function pedir() {
    try {
      const nova = await navigator.wakeLock.request("screen");
      /* Soltaram enquanto o pedido estava no ar: a trava que chegou atrasada
         não pode ficar presa. */
      if (solta) {
        void nova.release().catch(() => {});
        return;
      }
      trava = nova;
    } catch {
      // Recusada (aba escondida, economia de bateria): segue sem.
    }
  }

  function aoVoltar() {
    if (!solta && document.visibilityState === "visible") {
      void pedir();
    }
  }

  await pedir();
  document.addEventListener("visibilitychange", aoVoltar);

  return () => {
    if (solta) return;
    solta = true;
    document.removeEventListener("visibilitychange", aoVoltar);
    void trava?.release().catch(() => {});
    trava = null;
  };
}
