// Temporary: signs a throwaway test account in on the live site from a US runner, clicks Buy on /pricing and reads what
// Razorpay's window offers. Nothing is paid; the window is left without choosing a method. Removed right after.
// The repository is public, so the log shows no address, code or cookie.
const { chromium } = require("playwright");
const { randomBytes } = require("crypto");
const SITE = "https://heyroamly.com", MAIL = "https://api.mail.tm";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const redact = s => String(s).replace(/[\w.+-]+@[\w.-]+/g, "[email]").replace(/\d{6,}/g, "[number]");
async function mail(path, init = {}) {
  const r = await fetch(MAIL + path, init), t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: {} }; }
}

(async () => {
  const domain = (await mail("/domains")).body["hydra:member"]?.[0]?.domain;
  if (!domain) throw new Error("no throwaway inbox available");
  const address = `roamly-checkout-test-${randomBytes(4).toString("hex")}@${domain}`, password = randomBytes(12).toString("hex");
  const json = { "Content-Type": "application/json" };
  const made = await mail("/accounts", { method: "POST", headers: json, body: JSON.stringify({ address, password }) });
  if (made.status >= 300) throw new Error("inbox not created: " + made.status);
  const token = (await mail("/token", { method: "POST", headers: json, body: JSON.stringify({ address, password }) })).body.token;
  const inbox = { Authorization: "Bearer " + token };
  console.log(`test account: roamly-checkout-test-…@${domain}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: "en-US" });
  const api = (path, data) => context.request.post(SITE + path, { headers: { Origin: SITE, "X-Roamly-Client": "web", ...json }, data });
  try {
    let r = await api("/api/auth/email", { email: address });
    console.log("sign-in code sent:", r.status());
    if (!r.ok()) throw new Error(redact(await r.text()));
    let code;
    for (let i = 0; i < 24 && !code; i++) {
      await sleep(5000);
      for (const m of (await mail("/messages", { headers: inbox })).body["hydra:member"] ?? []) {
        const full = (await mail("/messages/" + m.id, { headers: inbox })).body;
        code ??= `${full.text ?? ""} ${[].concat(full.html ?? []).join(" ")}`.match(/\b(\d{6,8})\b/)?.[1];
      }
    }
    if (!code) throw new Error("the sign-in email never arrived");
    r = await api("/api/auth/verify", { email: address, token: code });
    console.log("signed in:", r.status());
    if (!r.ok()) throw new Error(redact(await r.text()));

    const page = await context.newPage();
    await page.goto(SITE + "/pricing", { waitUntil: "networkidle" });
    const buy = page.locator("button.primary", { hasText: /Get Plus|Add 30 days/ });
    await buy.waitFor({ timeout: 20000 });
    await page.waitForFunction(() => [...document.querySelectorAll("button.primary")].some(b => /Get Plus|Add 30 days/.test(b.textContent) && !b.disabled), null, { timeout: 20000 });
    console.log("button:", await buy.textContent());
    console.log("payment line:", await page.getByText("30-day pass paid once").first().textContent().catch(() => "(not found)"));

    const answer = page.waitForResponse(res => res.url().endsWith("/api/billing/checkout"), { timeout: 30000 });
    await buy.click();
    const res = await answer, order = await res.json().catch(() => ({}));
    console.log("checkout:", res.status(), JSON.stringify({ provider: order.provider, currency: order.currency, amount: order.amount, error: order.error }));

    let frame;
    for (let i = 0; i < 30 && !frame; i++) { await sleep(1000); frame = page.frames().find(f => /api\.razorpay\.com/.test(f.url())); }
    if (!frame) console.log("Razorpay's window did not open. Page says:", redact(await page.locator("[role=alert], .error, .notice").allTextContents().catch(() => [])));
    else {
      await sleep(10000);
      const text = await frame.locator("body").innerText().catch(e => "unreadable: " + e.message);
      for (const w of ["PayPal", "Card", "UPI", "Netbanking", "Wallet", "$", "USD", "₹"]) console.log((text.includes(w) ? "shown:     " : "not shown: ") + w);
      console.log("--- Razorpay window ---\n" + redact(text).slice(0, 1500));
    }
  } finally {
    await api("/api/auth/logout", {}).catch(() => {});
    await browser.close();
  }
})().catch(e => { console.error("FAILED:", redact(e?.message ?? e)); process.exit(1); });
