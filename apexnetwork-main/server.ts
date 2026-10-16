import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[FATAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // ============================================
  // SUPABASE PERSISTENCE LAYER
  // ============================================

  const TABLE_PROFILES = "profiles";
  const TABLE_PAYMENT_SETTINGS = "payment_settings";
  const TABLE_MESSAGES = "messages";
  const TABLE_ASSETS = "assets";

  /* ---------- Profiles (users) ---------- */

  const loadUsers = async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from(TABLE_PROFILES)
      .select("*");
    if (error) {
      console.error("[DB] Failed to load profiles:", error);
      return [];
    }
    return data || [];
  };

  const saveUsers = async (users: any[]): Promise<void> => {
    for (const user of users) {
      const { error } = await supabase
        .from(TABLE_PROFILES)
        .upsert(user, { onConflict: "id" });
      if (error) {
        console.error("[DB] Failed to upsert user:", user.id, error);
      }
    }
  };

  /* ---------- Payment settings (singleton) ---------- */

  const defaultPaymentSettings = {
    cryptoAddresses: [
      { id: '1', label: 'BTC Settlement Ledger', value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', type: 'BTC' },
      { id: '2', label: 'ETH Settlement Ledger', value: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', type: 'ETH' }
    ],
    eWallets: [
      { id: 'e1', label: 'PayPal Operational', value: 'payments@apex.financial', type: 'PAYPAL' },
      { id: 'e2', label: 'Skrill Global', value: 'skrill-id-99281', type: 'SKRILL' }
    ],
    bankDetails: {
      bankName: 'Apex Capital Reserve',
      accountNumber: 'APX-7700-4421-001',
      swiftCode: 'APXGB2L',
      holderName: 'Apex Financial Group'
    },
    bonusAmount: 10000,
    depositEnabled: true,
    whatsappUrl: 'https://wa.me/19453879820'
  };

  const loadPaymentSettings = async (): Promise<any> => {
    const { data, error } = await supabase
      .from(TABLE_PAYMENT_SETTINGS)
      .select("*")
      .eq("id", 1)
      .single();
    if (error) {
      console.error("[DB] Failed to load payment_settings:", error);
      return defaultPaymentSettings;
    }
    return data || defaultPaymentSettings;
  };

  const savePaymentSettings = async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from(TABLE_PAYMENT_SETTINGS)
      .upsert({ id: 1, ...settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) {
      console.error("[DB] Failed to save payment_settings:", error);
    }
  };

  /* ---------- Assets (market simulation) ---------- */

  const loadAssets = async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from(TABLE_ASSETS)
      .select("*");
    if (error) {
      console.error("[DB] Failed to load assets:", error);
      return [];
    }
    return data || [];
  };

  const saveAssets = async (assets: any[]): Promise<void> => {
    for (const asset of assets) {
      const { error } = await supabase
        .from(TABLE_ASSETS)
        .upsert({ ...asset, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) {
        console.error("[DB] Failed to upsert asset:", asset.id, error);
      }
    }
  };

  /* ---------- Messages (support chat) ---------- */

  const loadMessages = async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from(TABLE_MESSAGES)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[DB] Failed to load messages:", error);
      return [];
    }
    return data || [];
  };

  const saveMessage = async (message: any): Promise<void> => {
    const { error } = await supabase
      .from(TABLE_MESSAGES)
      .insert(message);
    if (error) {
      console.error("[DB] Failed to insert message:", error);
    }
  };

  // ============================================
  // INITIALIZE SERVER STATE FROM SUPABASE
  // ============================================

  const savedUsers = await loadUsers();
  const defaultUsers = [
    {
      id: 'ADMIN_CHIEF',
      name: 'System Administrator',
      email: 'admin1234@gmail.com',
      password: 'admin1234',
      balance: 10450.75,
      status: 'Active',
      verified: true,
      joined: '2024-01-12',
      isAdmin: true,
      cards: [{ id: 'c1', brand: 'Visa', last4: '8421', expiry: '12/26' }],
      portfolio: [],
      trades: [],
      bonusClaimed: false,
    },
  ];

  // Ensure admin exists in Supabase
  const adminExists = savedUsers.find(u => u.email === 'admin1234@gmail.com');
  if (!adminExists) {
    await supabase.from(TABLE_PROFILES).upsert(defaultUsers[0], { onConflict: "email" });
    savedUsers.push(defaultUsers[0]);
  }

  let serverUsers = savedUsers;

  let serverAssetsRaw = await loadAssets();
  let serverAssets: any[] = [];

  if (serverAssetsRaw.length === 0) {
    serverAssets = [
      { id: 'eurusd', name: 'EUR/USD', symbol: 'EUR/USD', price: 1.0824, change24h: 0.15, sparkline: [], trend: 'RANDOM', trendRate: 2 },
      { id: 'gbpusd', name: 'GBP/USD', symbol: 'GBP/USD', price: 1.2654, change24h: -0.22, sparkline: [], trend: 'RANDOM', trendRate: 2 },
      { id: 'usdjpy', name: 'USD/JPY', symbol: 'USD/JPY', price: 151.42, change24h: 0.45, sparkline: [], trend: 'RANDOM', trendRate: 2 },
      { id: 'xauusd', name: 'Gold', symbol: 'GOLD', price: 2355.20, change24h: 1.12, sparkline: [], trend: 'RANDOM', trendRate: 2 },
      { id: 'btcusd', name: 'Bitcoin', symbol: 'BTC/USD', price: 64250.00, change24h: -2.45, sparkline: [], trend: 'RANDOM', trendRate: 2 },
    ];
    // Seed assets into Supabase
    for (const a of serverAssets) {
      await supabase.from(TABLE_ASSETS).upsert({ ...a, updated_at: new Date().toISOString() }, { onConflict: "id" });
    }
  } else {
    serverAssets = serverAssetsRaw;
  }

  let paymentSettings = await loadPaymentSettings();

  // Initialize sparklines with proper OHLC data for candlesticks
  serverAssets = serverAssets.map((a) => {
    let currentPrice = a.price;
    const history = Array.from({ length: 100 }, (_, i) => {
      const open = currentPrice;
      const volatility = (a.symbol.includes('GOLD') || a.symbol.includes('BTC')) ? 0.005 : 0.001;
      const close = open * (1 + (Math.random() - 0.5) * volatility);
      const high = Math.max(open, close) * (1 + Math.random() * (volatility * 0.5));
      const low = Math.min(open, close) * (1 - Math.random() * (volatility * 0.5));
      currentPrice = close;
      return {
        time: `${i}:00`,
        open,
        high,
        low,
        close,
        value: close,
      };
    });
    return { ...a, price: currentPrice, sparkline: history };
  });

  // Simple Session Store (in-memory; clears on server restart)
  const sessions = new Map<string, any>();

  // Middleware to verify session (Security Guarantee)
  const authMiddleware = (req: any, res: any, next: any) => {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).json({ error: "Unauthorized Access" });
    }
    const userId = sessions.get(sessionId);
    req.user = serverUsers.find((u) => u.id === userId);
    next();
  };

  // Admin Security Layer — ONLY admin1234@gmail.com
  const adminMiddleware = (req: any, res: any, next: any) => {
    if (!req.user || !req.user.isAdmin || req.user.email !== 'admin1234@gmail.com') {
      return res.status(403).json({ error: "Access Denied: High Privilege Required" });
    }
    next();
  };

  // ============================================
  // API ROUTES
  // ============================================

  app.get("/api/payment-settings", async (req, res) => {
    res.json(paymentSettings);
  });

  app.post("/api/admin/update-payment-settings", authMiddleware, adminMiddleware, async (req, res) => {
    paymentSettings = req.body;
    await savePaymentSettings(paymentSettings);
    res.json(paymentSettings);
  });

  app.post("/api/auth/register", async (req, res) => {
    const { name, email, password, phone, country } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Missing identity data" });

    const cleanEmail = email.trim().toLowerCase();

    const users = await loadUsers();
    if (users.find((u) => u.email.toLowerCase() === cleanEmail)) {
      console.log(`[AUTH] Registration failed: Terminal ID ${cleanEmail} already commissioned`);
      return res.status(400).json({ error: "This Terminal ID is already commissioned. Please use the 'Sign In' tab if you already have an account." });
    }

    const newUser = {
      id: 'u' + Date.now(),
      name,
      email: cleanEmail,
      password,
      phone: phone || 'N/A',
      country: country || 'N/A',
      balance: 0,
      status: 'Active',
      verified: true,
      joined: new Date().toISOString().split('T')[0],
      isAdmin: false,
      cards: [],
      portfolio: [],
      trades: [],
      bonusClaimed: false,
    };

    const { error } = await supabase.from(TABLE_PROFILES).insert(newUser);
    if (error) {
      console.error("[DB] Failed to insert user:", error);
      return res.status(500).json({ error: "Registration failed" });
    }

    serverUsers.push(newUser);

    const sessionId = Math.random().toString(36).substring(7);
    sessions.set(sessionId, newUser.id);

    console.log(`[AUTH] New user registered: ${email}`);
    res.json({ user: newUser, sessionId });
  });

  app.post("/api/user/claim-bonus", authMiddleware, async (req: any, res) => {
    const userId = req.user.id;
    const users = await loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if ((user as any).bonusClaimed) {
      return res.status(400).json({ error: "Bonus already extracted" });
    }

    const bonusAmount = (paymentSettings as any).bonusAmount || 10000;
    user.balance += bonusAmount;
    (user as any).bonusClaimed = true;

    await supabase.from(TABLE_PROFILES).upsert(user, { onConflict: "id" });

    // Refresh local cache
    serverUsers = await loadUsers();

    res.json({ success: true, balance: user.balance });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const users = await loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail && u.password === password);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const sessionId = Math.random().toString(36).substring(7);
    sessions.set(sessionId, user.id);
    console.log(`[AUTH] User logged in: ${cleanEmail}`);
    res.json({ user, sessionId });
  });

  app.get("/api/assets", async (req, res) => {
    res.json(serverAssets);
  });

  app.get("/api/user/me", authMiddleware, (req: any, res) => {
    res.json(req.user);
  });

  app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
    const users = await loadUsers();
    res.json(users);
  });

  app.post("/api/admin/adjust-balance", authMiddleware, adminMiddleware, async (req, res) => {
    const { userId, amount } = req.body;
    const users = await loadUsers();
    const userIdx = users.findIndex((u) => u.id === userId);
    if (userIdx === -1) return res.status(404).json({ error: "User not found" });

    users[userIdx].balance = Math.max(0, users[userIdx].balance + amount);
    await supabase.from(TABLE_PROFILES).upsert(users[userIdx], { onConflict: "id" });

    serverUsers = await loadUsers();
    res.json(users[userIdx]);
  });

  app.post("/api/admin/set-trend", authMiddleware, adminMiddleware, async (req, res) => {
    const { assetId, trend, trendRate } = req.body;
    const assetIdx = serverAssets.findIndex((a) => a.id === assetId);
    if (assetIdx === -1) return res.status(404).json({ error: "Asset not found" });

    serverAssets[assetIdx].trend = trend;
    if (trendRate !== undefined) serverAssets[assetIdx].trendRate = trendRate;

    await supabase.from(TABLE_ASSETS).upsert(serverAssets[assetIdx], { onConflict: "id" });
    res.json(serverAssets[assetIdx]);
  });

  // Message persistence for CS
  app.get("/api/messages", authMiddleware, async (req, res) => {
    const messages = await loadMessages();
    res.json(messages);
  });

  app.post("/api/messages/send", authMiddleware, async (req: any, res) => {
    const { text, sender } = req.body;
    const newMsg = {
      id: Date.now(),
      sender: sender || 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      userName: req.user.name,
      userId: req.user.id,
    };

    await saveMessage(newMsg);
    res.json(newMsg);
  });

  app.post("/api/admin/update-user-status", authMiddleware, adminMiddleware, async (req, res) => {
    const { userId, status, verified } = req.body;
    const users = await loadUsers();
    const userIdx = users.findIndex((u) => u.id === userId);
    if (userIdx === -1) return res.status(404).json({ error: "User not found" });

    if (status) users[userIdx].status = status;
    if (verified !== undefined) users[userIdx].verified = verified;

    await supabase.from(TABLE_PROFILES).upsert(users[userIdx], { onConflict: "id" });
    serverUsers = await loadUsers();
    res.json(users[userIdx]);
  });

  app.post("/api/user/update-profile", authMiddleware, async (req: any, res) => {
    const { name, phone, country } = req.body;
    const users = await loadUsers();
    const userIdx = users.findIndex((u) => u.id === req.user.id);
    if (userIdx === -1) return res.status(404).json({ error: "User not found" });

    if (name) users[userIdx].name = name;
    if (phone !== undefined) users[userIdx].phone = phone;
    if (country !== undefined) users[userIdx].country = country;

    await supabase.from(TABLE_PROFILES).upsert(users[userIdx], { onConflict: "id" });
    serverUsers = await loadUsers();
    res.json(users[userIdx]);
  });

  // Simulation loop on server — writes back to Supabase every cycle
  setInterval(async () => {
    serverAssets = serverAssets.map((asset) => {
      const isVolatile = asset.symbol.includes('GOLD') || asset.symbol.includes('BTC');
      const defaultVolatility = isVolatile ? 0.002 : 0.0004;

      const open = asset.price;
      const rate = asset.trendRate || 2;
      const intervalFraction = 2000 / 60000;
      const ratePerInterval = (rate / 100) * intervalFraction;

      let bias = 0;
      if (asset.trend === 'PUMP') bias = ratePerInterval;
      if (asset.trend === 'DUMP') bias = -ratePerInterval;
      if (asset.trend === 'STABLE') bias = (Math.random() - 0.5) * (defaultVolatility * 0.1);

      const changePercent = ((Math.random() - 0.5) * defaultVolatility * 0.3) + bias;
      const close = open * (1 + changePercent);

      const range = Math.abs(close - open);
      const wickMultiplier = isVolatile ? 3 : 1.5;
      const high = Math.max(open, close) + (Math.random() * range * wickMultiplier);
      const low = Math.min(open, close) - (Math.random() * range * wickMultiplier);

      const newSparkline = [...asset.sparkline.slice(1), {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        open,
        high,
        low,
        close,
        value: close,
      }];

      return {
        ...asset,
        price: close,
        change24h: asset.change24h + (changePercent * 100),
        sparkline: newSparkline,
      };
    });

    // Persist updated assets to Supabase
    await saveAssets(serverAssets);
  }, 2000);

  // --- Vite / Frontend Serving ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Financial Server running on http://localhost:${PORT}`);
  });
}

startServer();
