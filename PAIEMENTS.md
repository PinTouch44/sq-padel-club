# Activer les vrais paiements (TWINT + carte) — guide pas à pas

Le code est déjà dans ce dépôt. Rien n'est actif tant que `payments: "stripe"` n'est pas mis dans `config.js`.
Commence **toujours en mode test Stripe** (aucun vrai argent), puis passe en réel.

## Avant de commencer: une décision
Le compte Stripe doit appartenir à l'entité qui **encaisse l'argent** (Swissquote, une association du club, etc.) et demandera
les informations légales et un IBAN. Choisis-la avant de créer le compte. Pour TWINT, le compte Stripe doit être dans un pays où TWINT est proposé (Suisse comprise).

## A. Compte Stripe (mode test)
1. Crée un compte sur **stripe.com**. Reste en **Mode test** (interrupteur en haut).
2. **Développeurs → Clés API** : note la **Clé secrète** `sk_test_…` (ne l'envoie à personne, pas même à Claude).
3. **Paramètres → Moyens de paiement** : active **Cartes** et **TWINT**.

## B. Les 3 fonctions dans Supabase
Pour chacune des 3 : **Supabase → Edge Functions → Deploy a new function → Via Editor**, nom exact, colle le code, **Deploy**.
Le code est dans ce dépôt : `supabase/functions/<nom>/index.ts` (sur github.com: ouvre le fichier → *Copy raw file*).

| Nom exact | Rôle | Réglage |
|---|---|---|
| `create-checkout` | ouvre la page de paiement Stripe | laisser « Verify JWT » activé |
| `refund-payment` | rembourse (organisateurs uniquement) | laisser « Verify JWT » activé |
| `stripe-webhook` | Stripe confirme le paiement | **désactiver « Verify JWT »** (Détails de la fonction) |

## C. Secrets
**Supabase → Edge Functions → Secrets** : ajoute `STRIPE_SECRET_KEY` = ta clé `sk_test_…`.

## D. Webhook Stripe
1. **Stripe → Développeurs → Webhooks → Ajouter un endpoint.**
2. URL : `https://ssklafnvhasaeptbmjss.supabase.co/functions/v1/stripe-webhook`
3. Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`.
4. Copie la **clé de signature** `whsec_…` et ajoute-la dans Supabase : secret `STRIPE_WEBHOOK_SECRET`.

## E. Activer
1. Dis à Claude « paiements prêts » : il met `payments: "stripe"` dans `config.js`.
2. Exécute `payments-lockdown.sql` dans **SQL Editor** (verrouille prix et paiements côté serveur).

## F. Tester (mode test)
- Réserve avec un compte joueur → **Pay · TWINT or card** → carte de test `4242 4242 4242 4242`, date future, CVC quelconque.
- Au retour dans l'app, la réservation passe à **Paid**. Vérifie aussi dans Stripe → Paiements.
- Console admin → Players → **Refund** : rembourse réellement le paiement (en mode test aussi).

## G. Passer en réel
Stripe en **mode réel** : nouvelle clé `sk_live_…`, nouveau webhook (même URL, mode réel) et son `whsec_…` ; remplace les 2 secrets dans Supabase.

## Sécurité (déjà en place)
- Le prix est **recalculé côté serveur** à partir de la grille tarifaire : un joueur ne peut pas payer moins.
- Un joueur ne peut pas se marquer « payé » ni « pointé » (verrouillé en base).
- Les paiements ne sont validés que par le webhook signé de Stripe.
- Les numéros de carte ne passent jamais par l'app.
