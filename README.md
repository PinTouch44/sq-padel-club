# Swissquote Padel Club — app 2027

Application web (joueurs + console admin) du Swissquote Padel Club.

- `index.html` : l'app
- `config.js` : adresse et clé publique Supabase (synchronisation en direct)
- `supabase-setup.sql` : création des tables (à exécuter une fois dans Supabase)

## E-mails de confirmation (v0.20)

L'app appelle la fonction `notify` quand quelqu'un s'inscrit et quand l'admin marque un paiement comme payé.
Sans cette fonction, tout marche quand même, simplement aucun e-mail n'est envoyé.

1. Créer un compte gratuit sur Brevo, puis *Senders* → ajouter et vérifier l'adresse d'envoi (une adresse Gmail suffit).
2. Brevo → *SMTP & API* → créer une clé API.
3. Supabase → *Edge Functions* → *Deploy a new function* → nom `notify` → coller `supabase/functions/notify/index.ts`.
4. Supabase → *Edge Functions* → *Secrets* → ajouter `BREVO_API_KEY` (la clé) et `MAIL_FROM` (l'adresse vérifiée).
