// Edge Function "notify": sends the club e-mails (through Brevo) and deletes accounts.
// Secrets needed: BREVO_API_KEY, MAIL_FROM (an address verified as a sender in Brevo).
// Kinds: welcome | registered | paid | delete
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LOGO = "https://pintouch44.github.io/sq-padel-club/icon-192.png";
const ACCENT = "#C8532B";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const T: Record<string, Record<string, string>> = {
  fr: {
    hi: "Salut", open: "Ouvrir l’app", team: "L’équipe du Swissquote Padel Club",
    wSub: "Bienvenue au Swissquote Padel Club", wTitle: "Bienvenue !", wBody: "Ton compte est créé. Tu peux maintenant réserver ta place pour les prochains événements, inviter des amis et suivre tes inscriptions.",
    rSub: "Inscription reçue, en attente de paiement", rTitle: "Inscription reçue", rState: "Ta place est réservée, mais elle n’est <b>pas encore confirmée</b> : elle le sera dès que ton paiement sera validé.",
    rFor: "Événement", rAmount: "Montant à payer",
    rVenue: "Tu as choisi de payer sur place : règle le montant à l’hôte le jour J.",
    rTwint: "Tu as choisi TWINT : envoie le montant au", rBank: "Tu as choisi le virement. IBAN", rHolder: "Titulaire", rRef: "Message / référence à indiquer",
    rAfter: "Dès que les organisateurs ont reçu ton paiement, tu reçois un e-mail de confirmation.",
    pSub: "Inscription confirmée", pTitle: "Inscription confirmée", pBody: "Nous avons bien reçu ton paiement. Tu es confirmé pour", pBye: "À bientôt sur le court !",
    dSub: "Ton compte a été supprimé", dTitle: "Compte supprimé", dBody: "Ton compte et toutes tes données (profil et réservations) ont été effacés définitivement. Si tu n’es pas à l’origine de cette suppression, réponds à ce message.",
  },
  de: {
    hi: "Hallo", open: "App öffnen", team: "Das Team des Swissquote Padel Club",
    wSub: "Willkommen im Swissquote Padel Club", wTitle: "Willkommen!", wBody: "Dein Konto ist erstellt. Du kannst dich jetzt für die nächsten Events anmelden, Freunde einladen und deine Anmeldungen verfolgen.",
    rSub: "Anmeldung erhalten, Zahlung ausstehend", rTitle: "Anmeldung erhalten", rState: "Dein Platz ist reserviert, aber <b>noch nicht bestätigt</b>: Er wird bestätigt, sobald deine Zahlung geprüft ist.",
    rFor: "Event", rAmount: "Zu zahlender Betrag",
    rVenue: "Du zahlst vor Ort: bezahle den Betrag am Eventtag beim Gastgeber.",
    rTwint: "Du hast TWINT gewählt: sende den Betrag an", rBank: "Du hast Überweisung gewählt. IBAN", rHolder: "Kontoinhaber", rRef: "Mitteilung / Referenz",
    rAfter: "Sobald die Organisatoren deine Zahlung erhalten haben, bekommst du eine Bestätigungs-E-Mail.",
    pSub: "Anmeldung bestätigt", pTitle: "Anmeldung bestätigt", pBody: "Wir haben deine Zahlung erhalten. Du bist bestätigt für", pBye: "Bis bald auf dem Court!",
    dSub: "Dein Konto wurde gelöscht", dTitle: "Konto gelöscht", dBody: "Dein Konto und alle deine Daten (Profil und Buchungen) wurden endgültig gelöscht. Falls du das nicht warst, antworte auf diese Nachricht.",
  },
  en: {
    hi: "Hi", open: "Open the app", team: "The Swissquote Padel Club team",
    wSub: "Welcome to the Swissquote Padel Club", wTitle: "Welcome!", wBody: "Your account is ready. You can now book your spot at the next events, invite friends and follow your registrations.",
    rSub: "Registration received, payment pending", rTitle: "Registration received", rState: "Your spot is reserved but <b>not confirmed yet</b>: it will be confirmed as soon as your payment is validated.",
    rFor: "Event", rAmount: "Amount to pay",
    rVenue: "You chose to pay on site: give the amount to the host on the day.",
    rTwint: "You chose TWINT: send the amount to", rBank: "You chose bank transfer. IBAN", rHolder: "Account holder", rRef: "Message / reference to write",
    rAfter: "As soon as the organisers have received your payment, you will get a confirmation e-mail.",
    pSub: "Registration confirmed", pTitle: "Registration confirmed", pBody: "We have received your payment. You are confirmed for", pBye: "See you on court!",
    dSub: "Your account has been deleted", dTitle: "Account deleted", dBody: "Your account and all your data (profile and bookings) have been permanently erased. If you did not ask for this, reply to this message.",
  },
};

function layout(title: string, inner: string, t: Record<string, string>, url?: string) {
  const btn = url
    ? `<p style="margin:24px 0 0"><a href="${esc(url)}" style="background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:12px;display:inline-block">${t.open}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F3F1EE"><div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1b1b">
<div style="text-align:center;padding:8px 0 18px"><img src="${LOGO}" width="64" height="64" alt="Swissquote Padel Club" style="border-radius:16px"></div>
<div style="background:#fff;border-radius:18px;padding:28px 24px;font-size:16px;line-height:1.55">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25">${title}</h1>${inner}${btn}</div>
<p style="text-align:center;color:#8a8a8a;font-size:13px;margin:16px 0 0">${t.team}</p></div></body></html>`;
}

async function sendMail(to: string, subject: string, html: string) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": Deno.env.get("BREVO_API_KEY") || "", "content-type": "application/json" },
    body: JSON.stringify({ sender: { name: "Swissquote Padel Club", email: Deno.env.get("MAIL_FROM") }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!r.ok) throw new Error("mail provider: " + (await r.text()));
}

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
    const t = T[lang] || T.en;
    const md = caller.user_metadata || {};

    const asUser = createClient(SU, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + jwt } } });
    const isAdmin = async () => ((await asUser.rpc("is_admin")).data === true);

    // ---- account deletion: erase everything, then say goodbye (the mail is best effort)
    if (kind === "delete") {
      if (await isAdmin()) return json({ error: "admin accounts cannot be deleted here" }, 403);
      const email = caller.email;
      const first = md.first || "";
      const d1 = await admin.from("bookings").delete().filter("data->>uid", "eq", caller.id);
      if (d1.error) return json({ error: String(d1.error.message) }, 500);
      const d2 = await admin.auth.admin.deleteUser(caller.id);
      if (d2.error) return json({ error: String(d2.error.message) }, 500);
      try {
        if (email) await sendMail(email, t.dSub, layout(t.dTitle, `<p>${t.hi} ${esc(first)},</p><p>${t.dBody}</p>`, t));
      } catch (_) { /* deletion already done */ }
      return json({ ok: true });
    }

    // ---- welcome mail
    if (kind === "welcome") {
      if (!caller.email) return json({ error: "no email" }, 404);
      await sendMail(caller.email, t.wSub, layout(t.wTitle, `<p>${t.hi} ${esc(md.first)},</p><p>${t.wBody}</p>`, t, url));
      return json({ ok: true });
    }

    // ---- booking mails
    const { data: row } = await admin.from("bookings").select("data").eq("id", id).maybeSingle();
    const b = row?.data;
    if (!b) return json({ error: "booking not found" }, 404);
    if (kind === "registered") {
      if (caller.id !== b.uid) return json({ error: "forbidden" }, 403);
    } else if (kind === "paid") {
      if (!(await isAdmin()) || b.payment !== "paid") return json({ error: "forbidden" }, 403);
    } else return json({ error: "bad kind" }, 400);

    const { data: club } = await admin.from("club").select("data").eq("id", "state").maybeSingle();
    const st = club?.data || {};
    const ev = (st.events || []).find((e: any) => e.id === b.eventId) || {};
    const pay = (st.settings && st.settings.pay) || {};
    const { data: owner } = await admin.auth.admin.getUserById(b.uid);
    const to = owner?.user?.email;
    if (!to) return json({ error: "no email" }, 404);

    const title = ev.title || "Swissquote Padel Club";
    const when = [ev.date, ev.start].filter(Boolean).join(" · ");
    const ref = `${title} · ${ev.date || ""} · ${b.first || ""} ${b.last || ""}`.trim();
    const eventBox = `<div style="background:#F6F4F1;border-radius:12px;padding:14px 16px;margin:14px 0"><b>${esc(title)}</b><br><span style="color:#666">${esc(when)}${ev.venue ? " · " + esc(ev.venue) : ""}</span></div>`;
    if (kind === "registered") {
      const k = String(b.payMethod || "");
      const how = k === "At the venue" ? `<p>${t.rVenue}</p>`
        : k === "TWINT to organiser" ? `<p>${t.rTwint} <b>${esc(pay.twint?.phone)}</b>.<br>${t.rRef}: <b>${esc(ref)}</b></p>`
        : k === "Bank transfer" ? `<p>${t.rBank}: <b>${esc(pay.bank?.iban)}</b><br>${t.rHolder}: ${esc(pay.bank?.holder)}<br>${t.rRef}: <b>${esc(ref)}</b></p>` : "";
      const inner = `<p>${t.hi} ${esc(b.first)},</p><p>${t.rState}</p>${eventBox}<p>${t.rAmount}: <b>CHF ${esc(b.total)}</b></p>${how}<p style="color:#666">${t.rAfter}</p>`;
      await sendMail(to, `${t.rSub} · ${title}`, layout(t.rTitle, inner, t, url));
    } else {
      const inner = `<p>${t.hi} ${esc(b.first)},</p><p>${t.pBody}</p>${eventBox}<p>${t.pBye}</p>`;
      await sendMail(to, `${t.pSub} · ${title}`, layout(t.pTitle, inner, t, url));
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
