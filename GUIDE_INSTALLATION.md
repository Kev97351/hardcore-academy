# 🚀 Guide d'installation — HardCore Academy + Stripe

## Ce que tu vas obtenir
- Paiements Stripe **réels et sécurisés** (carte bancaire, Apple Pay, Google Pay)
- Déblocage premium **automatique** après paiement (via webhook)
- Panel admin avec **récupération des revenus** en temps réel

---

## Étape 1 — Créer un compte Stripe

1. Va sur **https://stripe.com** → Créer un compte
2. Complète la vérification d'identité (obligatoire pour encaisser)
3. Active ton compte en mode **Live** (pas Test) pour les vrais paiements

---

## Étape 2 — Récupérer tes clés Stripe

Dans le **Dashboard Stripe** → Developers → API Keys :

```
STRIPE_SECRET_KEY = sk_live_xxxxx   (clé secrète — NE JAMAIS la mettre dans le HTML)
```

---

## Étape 3 — Installer le backend en local

```bash
# 1. Aller dans le dossier
cd hardcore-academy

# 2. Installer les dépendances
npm install

# 3. Copier le fichier .env
cp .env.example .env

# 4. Modifier .env avec tes vraies valeurs
nano .env

# 5. Lancer le serveur
npm start
```

---

## Étape 4 — Configurer le Webhook Stripe (CRUCIAL)

Le webhook permet à Stripe d'informer ton serveur qu'un paiement a réussi.

### En local (pour tester) :

```bash
# Installer Stripe CLI
# https://stripe.com/docs/stripe-cli

stripe login
stripe listen --forward-to localhost:3000/api/webhook
```

→ Copie le secret `whsec_xxxx` dans ton `.env` : `STRIPE_WEBHOOK_SECRET=whsec_xxxx`

### En production (Vercel) :

1. Dashboard Stripe → Developers → Webhooks → **Add endpoint**
2. URL : `https://ton-site.vercel.app/api/webhook`
3. Événements à écouter : `checkout.session.completed`
4. Copie le **Signing secret** → `STRIPE_WEBHOOK_SECRET` dans Vercel

---

## Étape 5 — Déployer sur Vercel (gratuit)

```bash
# 1. Installer Vercel CLI
npm install -g vercel

# 2. Se connecter
vercel login

# 3. Déployer
vercel --prod
```

**Ajouter les variables d'environnement dans Vercel :**
- Dashboard Vercel → ton projet → Settings → Environment Variables
- Ajouter : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`, `ADMIN_KEY`

---

## Étape 6 — Configurer le HTML

Dans `public/index.html`, modifier la section CONFIG :

```javascript
const CONFIG = {
  API_URL: 'https://ton-site.vercel.app',  // ← ton URL Vercel
  ADMIN_KEY: 'ta_cle_admin_secrete'         // ← même valeur que dans .env
};
```

---

## Flux complet du paiement

```
Utilisateur clique "Payer 2,99€"
         ↓
Frontend appelle POST /api/create-checkout
         ↓
Backend crée une session Stripe Checkout
         ↓
Utilisateur est redirigé vers stripe.com
         ↓
Utilisateur paie (carte, Apple Pay, etc.)
         ↓
Stripe envoie un webhook POST /api/webhook
         ↓
Backend marque l'utilisateur comme premium
         ↓
Utilisateur revient sur le site (success_url)
         ↓
Frontend poll /api/check-premium toutes les 2s
         ↓
✅ Accès Premium activé instantanément !
```

---

## Récupérer tes fonds

### Virements automatiques
Stripe vire automatiquement les fonds sur ton compte bancaire selon le calendrier configuré (ex: tous les 7 jours).

### Tableau de bord admin
- Connecte-toi avec le compte admin
- Clique sur **⚙ Admin**
- Section **💰 Revenus & Paiements Stripe**
- Bouton **🔗 Dashboard Stripe** → accès direct à ton tableau de bord Stripe

### Lancer un virement manuel
Dashboard Stripe → Balance → **Payout** → choisir le montant

---

## Sécurité

- ✅ Clé secrète Stripe **jamais** dans le HTML
- ✅ Webhook vérifié par signature cryptographique
- ✅ ADMIN_KEY protège les routes admin
- ✅ PCI-DSS géré par Stripe (tu ne touches jamais aux données bancaires)

---

## Support

- Stripe docs : https://stripe.com/docs
- Vercel docs : https://vercel.com/docs
