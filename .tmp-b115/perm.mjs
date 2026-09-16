import { chromium } from "@playwright/test";
const BASE = "http://localhost:3212";
for (const modo of ["contexto", "origem", "headed-flag"]) {
  const b = await chromium.launch(
    modo === "headed-flag" ? { args: ["--enable-features=NotificationTriggers"] } : {},
  );
  const ctx = await b.newContext(
    modo === "contexto" ? { baseURL: BASE, permissions: ["notifications"] } : { baseURL: BASE },
  );
  if (modo !== "contexto") await ctx.grantPermissions(["notifications"], { origin: BASE });
  const p = await ctx.newPage();
  await p.goto(BASE + "/login");
  const perm = await p.evaluate(() => Notification.permission);
  console.log(modo, "→ Notification.permission =", perm);
  await b.close();
}
