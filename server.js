// ═══════════════════════════════════════════════════════════
//  HardCore Academy — Backend Stripe
//  Node.js + Express + Stripe
// ═══════════════════════════════════════════════════════════
const express    = require('express');
const Stripe     = require('stripe');
const cors       = require('cors');
const bodyParser = require('body-parser');
const fs         = require('fs');
const path       = require('path');

const app    = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ─── CORS ───────────────────────────────────────────────────
app.use(cors({ origin: '*' }));

// ─── DB JSON simple (fichier plat) ─────────────────────────
// En prod, remplacer par MongoDB/Supabase
const DB_PATH = path.join(__dirname, 'db.json');
function getDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }));
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

// ─── WEBHOOK Stripe (raw body OBLIGATOIRE) ──────────────────
app.post('/api/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ─── Paiement réussi ─────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email   = session.customer_email || session.customer_details?.email;
    const amount  = session.amount_total; // en centimes

    if (email) {
      const db  = getDB();
      const idx = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());

      if (idx > -1) {
        db.users[idx].premium      = true;
        db.users[idx].premiumSince = new Date().toISOString();
        db.users[idx].stripeSession = session.id;
      } else {
        // Compte pas encore créé → on pré-marque pour quand il s'inscrira
        db.users.push({
          email:         email.toLowerCase(),
          premium:       true,
          premiumSince:  new Date().toISOString(),
          stripeSession: session.id,
          preRegistered: true
        });
      }

      // ─── Log des paiements ──────────────────────────────
      if (!db.payments) db.payments = [];
      db.payments.push({
        id:        session.id,
        email,
        amount:    amount / 100,
        currency:  session.currency.toUpperCase(),
        date:      new Date().toISOString(),
        status:    'paid'
      });

      saveDB(db);
      console.log(`✅ Premium activé pour ${email} — ${amount/100}€`);
    }
  }

  res.json({ received: true });
});

// ─── JSON body pour les autres routes ───────────────────────
app.use(express.json());

// ─── Créer une session Stripe Checkout ──────────────────────
app.post('/api/create-checkout', async (req, res) => {
  const { email, userName } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email:       email,
      line_items: [{
        price_data: {
          currency:     'eur',
          unit_amount:  299, // 2,99€ en centimes
          product_data: {
            name:        'HardCore Academy — Accès Premium',
            description: 'Accès illimité à vie à toutes les leçons',
            images:      [], // optionnel : URL d'une image produit
          }
        },
        quantity: 1
      }],
      mode:        'payment',
      success_url: `${process.env.SITE_URL}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.SITE_URL}?payment=cancelled`,
      metadata: { userName: userName || '' }
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Vérifier statut paiement (polling après retour) ────────
app.get('/api/check-premium/:email', (req, res) => {
  const email = req.params.email.toLowerCase();
  const db    = getDB();
  const user  = db.users.find(u => u.email.toLowerCase() === email);
  res.json({ premium: user?.premium || false });
});

// ─── Inscription / Login (sync avec db.json) ─────────────────
app.post('/api/register', (req, res) => {
  const { name, email, pwd } = req.body;
  if (!name || !email || !pwd) return res.status(400).json({ error: 'Champs manquants' });

  const db  = getDB();
  const idx = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());

  if (idx > -1 && !db.users[idx].preRegistered) {
    return res.status(409).json({ error: 'Email déjà utilisé' });
  }

  const newUser = {
    name,
    email:      email.toLowerCase(),
    pwd,
    role:       'member',
    premium:    db.users[idx]?.premium || false,
    createdAt:  new Date().toLocaleDateString('fr-FR'),
    preRegistered: false
  };

  if (idx > -1) { db.users[idx] = { ...db.users[idx], ...newUser }; }
  else { db.users.push(newUser); }

  saveDB(db);
  res.json({ ok: true, user: { ...newUser, pwd: undefined } });
});

app.post('/api/login', (req, res) => {
  const { email, pwd } = req.body;
  const db   = getDB();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.pwd === pwd);
  if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
  res.json({ ok: true, user: { ...user, pwd: undefined } });
});

// ─── ADMIN : stats + paiements ──────────────────────────────
app.get('/api/admin/stats', (req, res) => {
  const { key } = req.query;
  if (key !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Accès refusé' });

  const db       = getDB();
  const payments = db.payments || [];
  const total    = payments.reduce((s, p) => s + p.amount, 0);

  res.json({
    members:  db.users.length,
    premium:  db.users.filter(u => u.premium).length,
    revenue:  total.toFixed(2),
    payments: payments.sort((a,b) => new Date(b.date) - new Date(a.date))
  });
});

// ─── ADMIN : accorder/retirer premium manuellement ──────────
app.post('/api/admin/grant-premium', (req, res) => {
  const { key, email, grant } = req.body;
  if (key !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Accès refusé' });

  const db  = getDB();
  const idx = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable' });

  db.users[idx].premium = grant !== false;
  saveDB(db);
  res.json({ ok: true });
});

// ─── Servir le frontend ──────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 HardCore Academy backend — port ${PORT}`));
