/**
 * Gera `tests/e2e/fixtures/video-65s.mp4` (D-184).
 *
 *   node tests/e2e/fixtures/gerar-video.mjs
 *
 * O repositório não tem ffmpeg, e o vídeo de teste precisa ter três coisas
 * que um vídeo de celular tem e que o teste prova que somem ou sobrevivem:
 *
 * 1. **mais de um minuto** (65 s), para a gaveta abrir com o trecho no teto;
 * 2. **rotação no contêiner**: quadros gravados deitados (320×180) com a
 *    matriz de 90°, como o Android grava um vídeo em pé — o vídeo convertido
 *    precisa sair em pé (180×320);
 * 3. **coordenada de GPS** num átomo `©xyz` dentro de `moov/udta`, onde o
 *    Android a grava. O teste confere que ela não chega ao bucket.
 *
 * É a Mediabunny gerando o arquivo no Chromium do Playwright, que codifica
 * H.264 e AAC. Cada segundo tem uma cor e o número do segundo desenhado, para
 * a capa de um trecho ser distinguível a olho da de outro.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

export const MARCADOR_GPS = "+19.4326-099.1332/";

const RAIZ = new URL("../../../", import.meta.url);
const BUNDLE = new URL(
  "node_modules/mediabunny/dist/bundles/mediabunny.mjs",
  RAIZ,
);
const SAIDA = fileURLToPath(new URL("video-65s.mp4", import.meta.url));

const PAGINA = `<!doctype html><meta charset="utf-8"><title>gerador</title>
<script type="module">
import * as mb from "/mediabunny.mjs";

window.gerar = async (marcador) => {
  const LARGURA = 320, ALTURA = 180, QPS = 10, SEGUNDOS = 65, TAXA = 48000;

  const canvas = new OffscreenCanvas(LARGURA, ALTURA);
  const ctx = canvas.getContext("2d");

  const target = new mb.BufferTarget();
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory", metadataFormat: "udta" }),
    target,
  });

  const video = new mb.CanvasSource(canvas, {
    codec: "avc",
    quality: new mb.Quality({ bitrate: 60000 }),
    keyFrameInterval: 1,
  });
  output.addVideoTrack(video, { rotation: 90, frameRate: QPS });

  const audio = new mb.AudioBufferSource({
    codec: "aac",
    quality: new mb.Quality({ bitrate: 96000 }),
  });
  output.addAudioTrack(audio);

  output.setMetadataTags({ raw: { "©xyz": marcador } });

  await output.start();

  for (let quadro = 0; quadro < SEGUNDOS * QPS; quadro += 1) {
    const segundo = Math.floor(quadro / QPS);
    ctx.fillStyle = "hsl(" + ((segundo * 37) % 360) + " 45% 42%)";
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 96px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(segundo), LARGURA / 2, ALTURA / 2);
    await video.add(quadro / QPS, 1 / QPS);
  }
  video.close();

  for (let segundo = 0; segundo < SEGUNDOS; segundo += 1) {
    const buffer = new AudioBuffer({ length: TAXA, numberOfChannels: 1, sampleRate: TAXA });
    const canal = buffer.getChannelData(0);
    const frequencia = 220 + (segundo % 5) * 55;
    for (let i = 0; i < TAXA; i += 1) {
      canal[i] = 0.2 * Math.sin((2 * Math.PI * frequencia * (segundo * TAXA + i)) / TAXA);
    }
    await audio.add(buffer);
  }
  audio.close();

  await output.finalize();

  const bytes = new Uint8Array(target.buffer);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
};
window.pronto = true;
</script>`;

async function main() {
  const bundle = await readFile(BUNDLE);

  const servidor = createServer((pedido, resposta) => {
    if (pedido.url === "/mediabunny.mjs") {
      resposta.setHeader("content-type", "text/javascript");
      resposta.end(bundle);
      return;
    }
    resposta.setHeader("content-type", "text/html; charset=utf-8");
    resposta.end(PAGINA);
  });
  await new Promise((pronto) => servidor.listen(0, "localhost", pronto));
  const endereco = servidor.address();
  const porta = typeof endereco === "object" && endereco ? endereco.port : 0;

  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    // localhost é contexto seguro: sem isso não existe WebCodecs.
    await pagina.goto(`http://localhost:${porta}/`);
    await pagina.waitForFunction(() => window.pronto === true);

    const base64 = await pagina.evaluate(
      (marcador) => window.gerar(marcador),
      MARCADOR_GPS,
    );
    const bytes = Buffer.from(base64, "base64");

    if (!bytes.includes(Buffer.from(MARCADOR_GPS))) {
      throw new Error("O marcador de GPS não foi gravado no arquivo.");
    }

    await writeFile(SAIDA, bytes);
    console.log(`${SAIDA}: ${bytes.length} bytes`);
  } finally {
    await navegador.close();
    servidor.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
