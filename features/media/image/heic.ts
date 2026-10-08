/**
 * HEIC no navegador que não abre HEIC (D-183).
 *
 * O Chrome não decodifica HEIC em plataforma nenhuma, e a câmera do Samsung
 * grava nesse formato quando "Imagens de alta eficiência" está ligada. Para
 * quem tem essa opção ligada, a escada de `browser-runtime.ts` esgotava os três
 * decodificadores do navegador e a foto não subia — o arquivo era bom, o
 * navegador é que não tinha como lê-lo.
 *
 * Aqui entra a libheif, que decodifica no próprio aparelho. O resultado vai
 * para o mesmo reencode de sempre, então o EXIF — e com ele o GPS — continua
 * sem sair do celular (D-051).
 *
 * **Carregada só quando precisa.** A biblioteca tem cerca de 3 MB. O `import()`
 * dinâmico a deixa fora do bundle de toda página: só quem escolhe uma foto HEIC
 * a baixa, e uma vez.
 *
 * **Por que `heic-to/csp`.** As outras variantes do pacote usam `eval`, que a
 * CSP do projeto não permite. Nesta, a libheif é JavaScript puro, sem `eval` e
 * sem WebAssembly. A única concessão é o worker que a biblioteca cria a partir
 * de `blob:`, aceito em `worker-src` pelo `proxy.ts`.
 */

/**
 * As marcas de um contêiner HEIF, lidas da caixa `ftyp`.
 *
 * `mif1` e `msf1` são as genéricas — o exemplo da própria libheif usa `mif1`
 * como principal, com `heic` só entre as compatíveis. AVIF também pode declarar
 * `mif1`, mas o Chrome abre AVIF sozinho e por isso nunca chega até aqui.
 */
const MARCAS_HEIF = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/** HEIC pelo tipo declarado ou pela extensão — o que o sistema diz do arquivo. */
export function isDeclaredHeic(file: File): boolean {
  const tipo = file.type.toLowerCase();
  if (tipo === "image/heic" || tipo === "image/heif") return true;

  return /\.(heic|heif)$/i.test(file.name);
}

/**
 * HEIC pelo conteúdo, quando o sistema não disse.
 *
 * O `type` que o Android entrega não é confiável (ver `tipoRecusadoDeCara` em
 * `process-image.ts`), e um arquivo vindo de outro app pode chegar sem
 * extensão. Num HEIF, os bytes 4–8 são `ftyp` e os 8–12 a marca principal:
 * doze bytes respondem, sem ler a foto inteira.
 */
export async function hasHeifBrand(file: Blob): Promise<boolean> {
  const cabecalho = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (cabecalho.length < 12) return false;

  const ascii = (inicio: number) =>
    String.fromCharCode(...cabecalho.subarray(inicio, inicio + 4));

  return ascii(4) === "ftyp" && MARCAS_HEIF.has(ascii(8));
}

/**
 * Decodifica pela libheif. A rotação gravada no contêiner já vem aplicada: a
 * libheif a aplica por padrão, e a largura e a altura que ela informa são as de
 * depois da rotação.
 */
export async function decodeHeic(file: Blob): Promise<ImageBitmap> {
  const { heicTo } = await import("heic-to/csp");
  return heicTo({ blob: file, type: "bitmap" });
}
