// Edge Function "notify": sends the registration / payment e-mails (through Brevo).
// Secrets needed: BREVO_API_KEY, MAIL_FROM (an address verified as a sender in Brevo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const T: Record<string, Record<string, string>> = {
  fr: {
    regSub: "Inscription reçue", regHi: "Salut", regIn: "Ta place est réservée pour",
    regPay: "Pour la confirmer, il reste à payer", regVenue: "Tu as choisi de payer sur place : règle le montant à l’hôte le jour J.",
    regTwint: "Tu as choisi TWINT : envoie le montant au", regBank: "Tu as choisi le virement : IBAN",
    regRef: "Message / référence à indiquer", regAfter: "Dès que les organisateurs ont reçu ton paiement, tu reçois un e-mail de confirmation.",
    paidSub: "Paiement reçu · tu es confirmé", paidBody: "Nous avons bien reçu ton paiement. Tu es confirmé pour", paidBye: "À bientôt sur le court !",
    open: "Ouvrir mon inscription",
  },
  de: {
    regSub: "Anmeldung erhalten", regHi: "Hallo", regIn: "Dein Platz ist reserviert für",
    regPay: "Zur Bestätigung ist noch zu zahlen", regVenue: "Du zahlst vor Ort: bezahle den Betrag am Eventtag beim Gastgeber.",
    regTwint: "Du hast TWINT gewählt: sende den Betrag an", regBank: "Du hast Überweisung gewählt: IBAN",
    regRef: "Mitteilung / Referenz", regAfter: "Sobald die Organisatoren deine Zahlung erhalten haben, bekommst du eine Bestätigungs-E-Mail.",
    paidSub: "Zahlung erhalten · du bist bestätigt", paidBody: "Wir haben deine Zahlung erhalten. Du bist bestätigt für", paidBye: "Bis bald auf dem Court!",
    open: "Meine Anmeldung öffnen",
  },
  en: {
    regSub: "Registration received", regHi: "Hi", regIn: "Your spot is reserved for",
    regPay: "To confirm it, you still need to pay", regVenue: "You chose to pay on site: give the amount to the host on the day.",
    regTwint: "You chose TWINT: send the amount to", regBank: "You chose bank transfer: IBAN",
    regRef: "Message / reference to write", regAfter: "As soon as the organisers have received your payment, you will get a confirmation e-mail.",
    paidSub: "Payment received · you’re confirmed", paidBody: "We have received your payment. You are confirmed for", paidBye: "See you on court!",
    open: "Open my registration",
  },
};
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { id, kind, lang, url } = await req.json();
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const SU = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(SU, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ures } = await admin.auth.getUser(jwt);
    const caller = ures?.user;
    if (!caller) return json({ error: "not signed in" }, 401);

    const { data: row } = await admin.from("bookings").select("data").eq("id", id).maybeSingle();
    const b = row?.data;
    if (!b) return json({ error: "booking not found" }, 404);

    if (kind === "registered") {
      if (caller.id !== b.uid) return json({ error: "forbidden" }, 403);
    } else if (kind === "paid") {
      const asUser = createClient(SU, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + jwt } } });
      const { data: isAdmin } = await asUser.rpc("is_admin");
      if (!isAdmin || b.payment !== "paid") return json({ error: "forbidden" }, 403);
    } else return json({ error: "bad kind" }, 400);

    const { data: club } = await admin.from("club").select("data").eq("id", "state").maybeSingle();
    const st = club?.data || {};
    const ev = (st.events || []).find((e: any) => e.id === b.eventId) || {};
    const pay = (st.settings && st.settings.pay) || {};
    const { data: owner } = await admin.auth.admin.getUserById(b.uid);
    const to = owner?.user?.email;
    if (!to) return json({ error: "no email" }, 404);

    const t = T[lang] || T.en;
    const when = `${ev.date || ""} · ${ev.start || ""}`;
    const title = ev.title || "Swissquote Padel Club";
    const ref = `${title} · ${ev.date || ""} · ${b.first || ""} ${b.last || ""}`.trim();
    let body = "";
    let subject = "";
    if (kind === "registered") {
      subject = `${t.regSub} · ${title}`;
      const k = String(b.payMethod || "");
      const how = k === "At the venue" ? `<p>${t.regVenue}</p>`
        : k === "TWINT to organiser" ? `<p>${t.regTwint} <b>${esc(pay.twint?.phone)}</b>.<br>${t.regRef}: <b>${esc(ref)}</b></p>`
        : k === "Bank transfer" ? `<p>${t.regBank} <b>${esc(pay.bank?.iban)}</b> (${esc(pay.bank?.holder)}).<br>${t.regRef}: <b>${esc(ref)}</b></p>` : "";
      body = `<p>${t.regHi} ${esc(b.first)},</p><p>${t.regIn} <b>${esc(title)}</b> (${esc(when)}).</p><p>${t.regPay}: <b>CHF ${esc(b.total)}</b></p>${how}<p>${t.regAfter}</p>`;
    } else {
      subject = `${t.paidSub} · ${title}`;
      body = `<p>${t.regHi} ${esc(b.first)},</p><p>${t.paidBody} <b>${esc(title)}</b> (${esc(when)}).</p><p>${t.paidBye}</p>`;
    }
    body += url ? `<p><a href="${esc(url)}">${t.open}</a></p>` : "";
    const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b1b1b;max-width:520px">${body}<p style="color:#777;font-size:13px">Swissquote Padel Club</p></div>`;

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": Deno.env.get("BREVO_API_KEY")!, "content-type": "application/json" },
      body: JSON.stringify({ sender: { name: "Swissquote Padel Club", email: Deno.env.get("MAIL_FROM")! }, to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!r.ok) return json({ error: "mail provider", detail: await r.text() }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
