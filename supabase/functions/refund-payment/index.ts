// Swissquote Padel Club: an organiser refunds an online payment (money goes back to the player).
// Secrets needed: STRIPE_SECRET_KEY. Only accounts listed in the admins table can use it.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
export async function handle(req, env, fetchFn = fetch) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401);
    const adm = await fetchFn(`${env.SUPABASE_URL}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth, "Content-Type": "application/json" }, body: "{}" });
    if (!adm.ok || (await adm.json()) !== true) return json({ error: "Organisers only." }, 403);
    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.bookingId || "");
    const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
    const rows = await (await fetchFn(`${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&select=data`, { headers: svc })).json();
    const cur = rows && rows[0] && rows[0].data;
    if (!cur) return json({ error: "Booking not found." }, 404);
    if (cur.payment === "refunded") return json({ ok: true, already: true });
    if (!cur.stripePaymentIntent) return json({ error: "This booking was not paid online." }, 400);
    const p = new URLSearchParams();
    p.append("payment_intent", cur.stripePaymentIntent);
    p.append("metadata[booking_id]", bookingId);
    const r = await fetchFn("https://api.stripe.com/v1/refunds", { method: "POST", headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() });
    const out = await r.json();
    if (!r.ok) return json({ error: (out.error && out.error.message) || "Refund failed." }, 502);
    const next = { ...cur, payment: "refunded", refundedAt: new Date().toISOString(), refundDue: false };
    await fetchFn(`${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}`, { method: "PATCH", headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ data: next, updated_at: new Date().toISOString() }) });
    return json({ ok: true });
  } catch (e) {
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}
if (typeof Deno !== "undefined") Deno.serve((req) => handle(req, Deno.env.toObject()));
