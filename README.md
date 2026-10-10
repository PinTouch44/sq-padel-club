# Swissquote Padel Club — app 2027

Application web (joueurs + console admin) du Swissquote Padel Club.

- `index.html` : l'app
- `config.js` : adresse et clé publique Supabase (synchronisation en direct)
- `supabase-setup.sql` : création des tables (à exécuter une fois dans Supabase)
- `supabase-sports.sql` : administrateurs par sport (v0.25, à exécuter une fois après `supabase-setup.sql`, sans risque de le relancer)

## E-mails de confirmation (v0.20)

L'app appelle la fonction `notify` quand quelqu'un s'inscrit et quand l'admin marque un paiement comme payé.
Sans cette fonction, tout marche quand même, simplement aucun e-mail n'est envoyé.

1. Créer un compte gratuit sur Brevo, puis *Senders* → ajouter et vérifier l'adresse d'envoi (une adresse Gmail suffit).
2. Brevo → *SMTP & API* → créer une clé API.
3. Supabase → *Edge Functions* → *Deploy a new function* → nom `notify` → coller `supabase/functions/notify/index.ts`.
4. Supabase → *Edge Functions* → *Secrets* → ajouter `BREVO_API_KEY` (la clé) et `MAIL_FROM` (l'adresse vérifiée).

## Mot de passe oublié et suppression de compte (v0.21)

1. Supabase → *SQL Editor* → coller et lancer le bloc « 6. Suppression de compte » de `supabase-setup.sql` (une seule fois).
2. Supabase → *Authentication* → *URL Configuration* → mettre **Site URL** = `https://pintouch44.github.io/sq-padel-club/` et ajouter la même adresse dans **Redirect URLs**.
3. Supabase → *Authentication* → *SMTP Settings* (recommandé) : brancher Brevo pour que les mails « mot de passe oublié » partent de ton adresse et sans limite horaire serrée.

## Communauté (v0.22)

- Bouton « Inviter un ami » (WhatsApp) sur chaque événement et après l'inscription: rien à configurer.
- Bouton « Rejoindre le groupe WhatsApp » sur l'accueil: coller le lien d'invitation du groupe dans Admin → Réglages → Communauté.
- « Qui joue »: chaque joueur peut masquer son nom dans Profil.

## E-mails (v0.23)

Cinq e-mails avec logo: bienvenue, inscription en attente de paiement, inscription confirmée, compte supprimé (et données effacées), mot de passe oublié.
Les quatre premiers partent de la fonction `notify` (voir plus haut, secrets `BREVO_API_KEY` et `MAIL_FROM`).
Le mail « mot de passe oublié » envoie un code à 6 chiffres (pas de lien, car Brevo transforme les liens). Il se règle dans Supabase → Authentication → Email Templates → Reset Password: coller `supabase/email-templates/reset-password.html`.
