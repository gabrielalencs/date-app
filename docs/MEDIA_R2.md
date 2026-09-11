# DATE — Mídia e Cloudflare R2

Substitui a referência a `docs/07_MEDIA_R2.md`. Normativo.

---

## 1. Princípio

Fotografia é protagonista no DATE, e as fotos são de duas pessoas específicas, tiradas nos lugares onde elas estiveram. Nenhuma delas pode ser alcançável por quem não está no workspace, em nenhum momento, nem por URL vazada.

Três consequências:

1. Os buckets permanecem privados. Nunca há domínio `r2.dev`, nunca há objeto público.
2. **O browser nunca vê o endereço do R2 na leitura.** A imagem chega por uma rota nossa, autenticada a cada requisição.
3. A imagem é reprocessada no cliente antes de subir, o que descarta o EXIF. Foto de celular carrega coordenada de GPS; um álbum de dates é um mapa da casa do casal.

---

## 2. Por que o upload não passa pelo servidor

Server Action da Vercel tem limite de corpo baixo — da ordem de 1 MB por padrão. Foto de celular tem entre 3 e 8 MB. Subir pelo servidor significaria levantar o limite, segurar o arquivo inteiro em memória de função e pagar duração por foto.

Então o fluxo é **PUT assinado direto do browser para o R2**:

```text
cliente reduz e reencoda a imagem
        ↓
pede ao servidor uma URL assinada
        ↓
servidor gera a object key e assina (expira em minutos)
        ↓
browser faz PUT direto no R2
        ↓
cliente avisa o servidor que terminou
        ↓
servidor confirma o objeto no R2 e só então grava a linha em media
```

A URL assinada expõe o host do R2 e o access key id na query string. Isso é inerente à assinatura e aceitável: ela vale para **um** método, **uma** object key e poucos minutos. É a única situação em que o endereço do bucket aparece no cliente.

---

## 3. Processamento no cliente

Antes de qualquer upload, no browser:

- decodificar com `createImageBitmap`; se falhar, recusar com mensagem clara em vez de subir lixo;
- redimensionar para no máximo **2000px** no maior lado, preservando proporção;
- reencodar em **WebP**, qualidade em torno de 0.82;
- gerar também uma miniatura de **640px** no maior lado.

Duas saídas por foto: `full` e `thumb`. A miniatura existe porque uma grade de vinte ideias servindo a imagem cheia é inviável no celular.

Reencodar descarta EXIF por construção — não existe etapa separada de limpeza de metadado, e não deve existir, porque etapa separada é etapa que alguém esquece.

**HEIC.** O iOS costuma converter para JPEG no envio por formulário, mas não é garantido, e o Chrome não decodifica HEIC. Se `createImageBitmap` falhar, a mensagem diz o que fazer em vez de estourar.

O servidor **não** processa imagem. O `sharp: false` do `pnpm-workspace.yaml`, marcado no B0 para reavaliação aqui, permanece como está.

---

## 4. Object key

Sempre gerada no servidor, nunca aceita do cliente, para leitura, escrita ou remoção.

```text
{workspace_id}/{plan_id}/{uuid}/full.webp
{workspace_id}/{plan_id}/{uuid}/thumb.webp
```

O `workspace_id` no prefixo torna colisão entre workspaces impossível e deixa qualquer chave auditável a olho.

`media.object_key` guarda a chave do `full`. A do `thumb` ganha coluna própria, `thumb_object_key` — é a primeira migration incremental do projeto desde o B2, e provar o ciclo `generate → ler o SQL → aplicar em development` num caso pequeno vale antes de o B6 precisar dele num caso grande.

---

## 5. Validação no servidor

Na assinatura:

- MIME permitido: `image/webp`, `image/jpeg`, `image/png`. Nada mais;
- teto declarado: 2 MB para `full`, 400 KB para `thumb`;
- a assinatura fixa o content-type. Se o SDK instalado também permitir assinar o tamanho, use — confirme na versão instalada em vez de presumir.

Na confirmação, **antes** de gravar a linha:

- `HeadObject` no R2, e o `media` grava o tamanho e o content-type **que o R2 reporta**, nunca os que o cliente declarou. Sem isso, o cliente declara 1 MB e sobe 500 MB;
- se o objeto não existir, a confirmação falha e nenhuma linha é criada.

---

## 6. Leitura

Rota própria: `/api/media/[id]`.

A cada requisição ela resolve o `AuthorizedContext`, busca a linha escopada por workspace e só então lê o objeto do R2 e devolve os bytes. Media de outro workspace responde "não encontrado" (D-038).

Não se usa URL assinada de leitura. Uma URL assinada continua válida depois que a pessoa fecha a aba, é compartilhável por acidente, e muda a cada render — o que destrói cache e complica o `next/image`.

A rota aceita `?v=thumb` para a miniatura. Cabeçalho `Cache-Control: private, max-age=31536000, immutable`: a chave é um uuid e o conteúdo nunca muda, e `private` impede cache compartilhado.

`next/image` com `unoptimized`, porque as dimensões já foram decididas no cliente e o otimizador da Vercel não carrega o cookie da pessoa ao buscar a origem. Sem `remotePatterns` — o host do R2 não precisa ser conhecido pelo browser.

---

## 7. Remoção

O cliente envia `mediaId`. Nunca uma object key.

Ordem: apagar a linha do banco primeiro, dentro da transação, e o objeto do R2 depois. Se o R2 falhar, sobra um objeto órfão — que custa alguns kilobytes e nada mais. A ordem inversa deixaria uma linha apontando para um objeto que não existe, e isso é imagem quebrada na tela.

Se a mídia removida for a capa do plano, `cover_media_id` vira nulo na mesma transação.

Objeto órfão é problema de faxina futura, não de correção. Não escreva o coletor agora.

---

## 8. Ambiente

| | Bucket |
|---|---|
| Desenvolvimento | `date-media-dev` |
| Produção | `date-media-prod` |

Guarda espelhando a do banco: se `NEON_BRANCH` for `development` e o bucket configurado não for `date-media-dev`, **aborta**. Imprime bucket e endpoint, nunca credencial.

O token de desenvolvimento é limitado ao bucket de desenvolvimento. O de produção só existe no B12.

CORS do bucket restrito às origens reais — `http://localhost:3000` e, no B12, o domínio do DATE. Nunca `*`, nem temporariamente, nem "só para testar".

Variáveis, todas server-only:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_ENDPOINT
```

---

## 9. Onde a mídia aparece na V1

`purpose`: `cover` e `gallery`, ligadas a um plano.

`avatar` e `memory` existem no enum mas não são usadas aqui — memória é B9, avatar é depois. Não implemente por estarem no enum.

Sem foto, a capa do card continua tipográfica (D-041). Isso deixa de ser contorno e passa a ser o estado vazio definitivo: um plano sem foto tem uma capa que parece intencional, não um retângulo esperando conteúdo.
