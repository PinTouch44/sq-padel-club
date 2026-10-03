// Swissquote Padel Club: creates a Stripe Checkout page (TWINT / card) for one booking.
// Secrets needed: STRIPE_SECRET_KEY. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export function zurichToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
// same rule as the app: the tier valid on the booking date; before the first tier, the first tier applies
export function tierFor(event, d) {
  const st = [...(event.tiers || [])].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return st.find((t) => t.from <= d && d <= t.until) || (st.length && d < st[0].from ? st[0] : null);
}
export function expectedAmount(booking, club) {
  const event = ((club && club.events) || []).find((e) => e.id === booking.eventId);
  if (!event) return { error: "Event not found. Ask the organiser to open the admin console once." };
  const tier = tierFor(event, booking.createdAt || zurichToday());
  if (!tier) return { error: "No price available for this booking date." };
  const guests = Array.isArray(booking.guests) ? booking.guests.length : 0;
  return { event, tier, amount: Number(tier.emp) + Number(tier.guest) * guests };
}

export async function handle(req, env, fetchFn = fetch) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401);
    const who = await fetchFn(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth } });
    if (!who.ok) return json({ error: "Sign in again." }, 401);
    const user = await who.json();
    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.bookingId || "");
    if (!bookingId) return json({ error: "Missing booking." }, 400);
    const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
    const bRes = await fetchFn(`${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&select=data`, { headers: svc });
    const rows = await bRes.json();
    const booking = rows && rows[0] && rows[0].data;
    if (!booking) return json({ error: "Booking not found. Try again in a few seconds." }, 404);
    if (booking.uid !== user.id) return json({ error: "This booking belongs to another account." }, 403);
    if (booking.status === "cancelled") return json({ error: "This booking is cancelled." }, 400);
    if (booking.payment === "paid") return json({ error: "This booking is already paid." }, 400);
    const cRes = await fetchFn(`${env.SUPABASE_URL}/rest/v1/club?id=eq.state&select=data`, { headers: svc });
    const cRows = await cRes.json();
    const club = cRows && cRows[0] && cRows[0].data;
    const exp = expectedAmount(booking, club);
    if (exp.error) return json({ error: exp.error }, 400);
    if (!(exp.amount > 0)) return json({ error: "Nothing to pay for this booking." }, 400);
    if (Math.round(Number(booking.total) * 100) !== Math.round(exp.amount * 100)) return json({ error: "The price of this booking does not match the current price list. Contact the organiser." }, 400);
    const origin = String(body.returnUrl || "").split("#")[0];
    if (!/^https:\/\//.test(origin)) return json({ error: "Invalid return address." }, 400);
    const p = new URLSearchParams();
    p.append("mode", "payment");
    p.append("client_reference_id", bookingId);
    if (user.email) p.append("customer_email", user.email);
    p.append("success_url", `${origin}#paid-${bookingId}`);
    p.append("cancel_url", `${origin}#paycancel-${bookingId}`);
    p.append("line_items[0][quantity]", "1");
    p.append("line_items[0][price_data][currency]", "chf");
    p.append("line_items[0][price_data][unit_amount]", String(Math.round(exp.amount * 100)));
    const n = 1 + (Array.isArray(booking.guests) ? booking.guests.length : 0);
    p.append("line_items[0][price_data][product_data][name]", `Swissquote Padel Club: ${exp.event.title} (${n} player${n > 1 ? "s" : ""})`);
    p.append("metadata[booking_id]", bookingId);
    p.append("payment_intent_data[metadata][booking_id]", bookingId);
    const sRes = await fetchFn("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString(),
    });
    const session = await sRes.json();
    if (!sRes.ok || !session.url) return json({ error: (session.error && session.error.message) || "Payment provider error." }, 502);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}
if (typeof Deno !== "undefined") Deno.serve((req) => handle(req, Deno.env.toObject()));
