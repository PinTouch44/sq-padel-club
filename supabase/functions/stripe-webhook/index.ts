// Swissquote Padel Club: Stripe tells us a payment succeeded; we mark the booking as paid.
// Secrets needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Turn OFF "Verify JWT" for this function (Stripe has no Supabase login).
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function verifySignature(raw, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i).trim(), kv.slice(i + 1)]; }));
  const t = parts.t;
  const sigs = header.split(",").filter((x) => x.trim().startsWith("v1=")).map((x) => x.trim().slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(nowSec - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = toHex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`)));
  return sigs.some((s) => s.length === mac.length && s === mac);
}
export async function handle(req, env, fetchFn = fetch) {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) return new Response("bad signature", { status: 400 });
  let event;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const type = event.type;
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") return new Response("ignored", { status: 200 });
  const session = event.data && event.data.object;
  if (!session || session.payment_status !== "paid") return new Response("not paid yet", { status: 200 });
  const bookingId = (session.metadata && session.metadata.booking_id) || session.client_reference_id;
  if (!bookingId) return new Response("no booking", { status: 200 });
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  let method = "Online";
  try {
    if (session.payment_intent) {
      const pi = await (await fetchFn(`https://api.stripe.com/v1/payment_intents/${session.payment_intent}?expand[]=latest_charge`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } })).json();
      const d = pi && pi.latest_charge && pi.latest_charge.payment_method_details;
      if (d && d.type === "twint") method = "TWINT";
      else if (d && d.type === "card") method = `Card ···· ${(d.card && d.card.last4) || ""}`.trim();
    }
  } catch { /* keep generic label */ }
  const bRes = await fetchFn(`${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&select=data`, { headers: svc });
  const rows = await bRes.json();
  const cur = rows && rows[0] && rows[0].data;
  if (!cur) return new Response("booking not found", { status: 200 });
  if (cur.payment === "paid") return new Response("already paid", { status: 200 });
  const next = { ...cur, payment: "paid", payMethod: method, paidAt: new Date().toISOString(), stripePaymentIntent: session.payment_intent || "" };
  const up = await fetchFn(`${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}`, {
    method: "PATCH", headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ data: next, updated_at: new Date().toISOString() }),
  });
  if (!up.ok) return new Response("update failed", { status: 500 });
  return new Response("ok", { status: 200 });
}
if (typeof Deno !== "undefined") Deno.serve((req) => handle(req, Deno.env.toObject()));
