import { expect, test } from "./harness.ts";

test("Select DATE: teclado, Escape, foco, serialização, reset e disabled", async ({
  page,
}) => {
  await page.goto("/kitchen-sink");
  const trigger = page.getByRole("combobox", {
    name: "Categoria",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Gastronomia", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "Outro", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("Outro");
  await expect(trigger).toBeFocused();
  expect(
    await page
      .getByTestId("select-demo-form")
      .evaluate((form) =>
        new FormData(form as HTMLFormElement).get("category"),
      ),
  ).toBe("outro");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Restaurar seleção" }).click();
  await expect(trigger).toContainText("Gastronomia");
  await trigger.click();
  await expect(
    page.getByRole("option", { name: "Gastronomia", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("v");
  await expect(
    page.getByRole("option", { name: "Viagem", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("Viagem");
  await expect(
    page.getByRole("combobox", { name: "Categoria indisponível" }),
  ).toBeDisabled();
  const invalid = page.getByRole("combobox", { name: "Categoria com erro" });
  await expect(invalid).toHaveAttribute("aria-invalid", "true");
  await expect(invalid).toHaveAccessibleDescription("Escolha uma categoria.");
  const all = page.getByRole("combobox", { name: "Todas as categorias" });
  await all.click();
  await page.getByRole("option", { name: "Viagem", exact: true }).click();
  await all.click();
  await page.getByRole("option", { name: "Todas", exact: true }).click();
  expect(
    await page
      .getByTestId("select-demo-form")
      .evaluate((form) => new FormData(form as HTMLFormElement).get("filter")),
  ).toBe("");
});

for (const width of [320, 390, 1280]) {
  test(`Select, sheet e dialog em ${width}px com reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/kitchen-sink");
    const trigger = page.getByRole("combobox", {
      name: "Categoria",
      exact: true,
    });
    await trigger.click();
    const box = await page.getByRole("listbox").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.getByRole("option", { name: "Viagem", exact: true }).click();
    await expect(trigger).toContainText("Viagem");
    const frame = await trigger.boundingBox();
    expect(frame!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const name of ["Abrir sheet", "Abrir dialog"]) {
      const opener = page.getByRole("button", { name, exact: true });
      await opener.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCSS(
        "animation-name",
        "none",
      );
      await expect(page.getByRole("dialog")).toHaveCSS(
        "transition-duration",
        "0.1s",
      );
      await page.keyboard.press("Tab");
      expect(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
      await page.screenshot({
        path: `screenshots/r1/${name === "Abrir sheet" ? "sheet" : "dialog"}-${width}-light.png`,
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
  });
}
