import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("rota raiz", () => {
  it("renderiza markup sem lançar", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain("<main>");
    expect(markup).toContain("Hello world!");
  });
});
