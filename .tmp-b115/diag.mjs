import { chromium } from "@playwright/test";
const BASE = "http://localhost:3212";
const creds = process.env.DATE_DEV_USER_CREDENTIALS.split(",")[0].split(":");
const b = await chromium.launch();
const ctx = await b.newContext({ baseURL: BASE, permissions: ["notifications"] });
const p = await ctx.newPage();
p.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));
p.on("pageerror", (e) => console.log("[pageerror]", e.message));

await p.goto(BASE + "/login");
await p.fill('input[name="email"]', creds[0]);
await p.fill('input[name="password"]', creds.slice(1).join(":"));
await p.getByRole("button", { name: "Entrar" }).click();
await p.waitForURL((u) => new URL(u).pathname === "/", { timeout: 60000 });
await p.goto(BASE + "/perfil");
await p.waitForLoadState("networkidle");

console.log("tem heading Notificações:", await p.getByRole("heading", { name: "Notificações" }).count());
console.log("texto da seção:", (await p.locator("section:has(h2:text('Notificações'))").innerText().catch(() => "(não achou)")).slice(0, 300));
console.log("capacidades:", await p.evaluate(() => ({
  sw: "serviceWorker" in navigator,
  push: "PushManager" in window,
  notif: "Notification" in window,
  perm: typeof Notification !== "undefined" ? Notification.permission : "n/a",
})));

// push via CDP
const cdp = await ctx.newCDPSession(p);
let regId = null;
cdp.on("ServiceWorker.workerVersionUpdated", (e) => {
  for (const v of e.versions) if (v.registrationId) regId = v.registrationId;
});
await cdp.send("ServiceWorker.enable");
await p.goto(BASE + "/login");
await p.evaluate(() => navigator.serviceWorker.ready);
for (let i = 0; i < 40 && !regId; i++) await new Promise((r) => setTimeout(r, 100));
console.log("registrationId:", regId);
try {
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: BASE,
    registrationId: regId,
    data: JSON.stringify({ title: "Agora tem data", body: "corpo", url: "/planos/x", kind: "date_confirmed" }),
  });
  console.log("deliverPushMessage: ok");
} catch (e) {
  console.log("deliverPushMessage FALHOU:", e.message.slice(0, 200));
}
await new Promise((r) => setTimeout(r, 1500));
console.log("notificações:", await p.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  return (await r.getNotifications()).map((n) => n.title);
}));
await b.close();
