# DATE — Assets de marca do R1

## Logos e referências

`public/brand/logos/date-logo.svg` e `date-logo-on-dark.svg` são os assets oficiais recebidos no repositório. Wordmark usa esses arquivos sem redesenhar o símbolo ou digitar uma assinatura substituta. A prancha existente em `public/brand/reference/date-brand-board.png` e os mockups fornecidos pelo proprietário orientaram hierarquia, paleta e atmosfera. As versões luminosas fornecidas não foram usadas na interface.

## Fotografias editoriais

Geradas em 11/09/2026 com a ferramenta ImageGen do ambiente Codex. Imagens novas de marca, sem upload de dados de usuários a um gerador. A skill imagegen foi lida e aplicada. As saídas foram abertas para inspeção antes da integração. Conversão/compressão local com Sharp; nenhum novo serviço de imagens ou dependência de runtime adicionada para isso.

| Asset | Dimensões | Bytes | Uso |
| --- | --- | --- | --- |
| `public/brand/photos/coast.webp` | 1536 × 1024 | 115240 | Login, Home, Perfil e contexto editorial |
| `public/brand/photos/table.webp` | 1400 × 933 | 154668 | Nova ideia e composições editoriais |

Direção de geração de `coast`: fotografia natural de um casal adulto de costas, em roupas de linho, no terço direito de um mirante costeiro no Rio ao entardecer; viagem editorial, texturas reais, cores navy/sage/peach moderadas; sem texto, logo ou elementos gráficos. Saída original: `exec-74f2b004-2da7-4201-84da-4079644111dc.png`.

Direção de geração de `table`: fotografia natural de uma mesa de madeira em terraço com dois lugares, taças de vinho e vela, baía e montanhas ao anoitecer; navy/sage/peach moderados; sem pessoas, texto, logo ou elementos gráficos. Saída original: `exec-f7ee30a7-f808-4088-b734-e465e6b70e81.png`.

Originais locais da geração: pasta `01a09166-250d-7d40-a900-d8b7857ac9ac` do diretório de imagens geradas do ambiente. Os WebPs versionados bastam para executar a aplicação.

## Regras de uso

- São inspiração de marca, sem alegação de serem registros do casal, reservas, locais visitados ou memórias reais.
- Não atribuir automaticamente essas fotos a entidades do banco. Nos testes de captura, uploads acontecem somente em planos temporários próprios, limpos ao terminar.
- Capa e galeria do usuário continuam privadas, entregues pela rota de mídia autenticada já existente.
- Preservar proporção e assunto ao recortar com object-fit. O scrim serve apenas à legibilidade do texto.
- PhotoStory serve o WebP local já comprimido na resolução original; isso evita ampliar uma variante calculada só pela largura em heroes verticais. Coast ancora o recorte à direita, preservando as duas pessoas.
- Fotografia nunca passa por filtro de inversão no tema escuro. Não adicionar glow, néon, vidro ou gradiente decorativo.
