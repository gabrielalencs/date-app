import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "@/app/(private)/page";

describe("rota raiz", () => {
  it("renderiza o título da Início sem lançar", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain("<h1");
    expect(markup).toContain("type-display-l");
    expect(markup).toContain("Início");
  });
});
