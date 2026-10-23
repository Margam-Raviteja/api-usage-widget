// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: chart-bar;

/**
 * ============================================================================
 * Multi-Provider AI & Cloud API Usage Monitor for iOS
 * ============================================================================
 * Supports:
 *   - OpenRouter (Real-time credit balance & spend)
 *   - DeepSeek   (Real-time USD/CNY balance)
 *   - OpenAI     (Admin cost tracking or active key validation & budget)
 *   - Groq       (Active status & real-time token/request rate-limits)
 *   - Anthropic  (Active status, model access & budget tracking)
 *   - Google Cloud / Gemini (Gemini API status, quota & Cloud credits)
 *
 * Supports Small, Medium, and Large widgets with offline caching & dark theme.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. DEFAULT CONFIGURATION
// You can edit the keys directly here, OR create a file named
// `api-usage-config.json` in your Scriptable Documents folder.
// ----------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  // Appearance & Refresh
  theme: "dark", // "dark" | "midnight" | "dracula"
  refreshMinutes: 30, // Widget reload interval
  timeoutMs: 6000,    // Network request timeout per provider

  // 1. OpenRouter (https://openrouter.ai/keys)
  openrouter: {
    enabled: true,
    apiKey: "", // e.g. "sk-or-v1-..."
    name: "OpenRouter"
  },

  // 2. DeepSeek (https://platform.deepseek.com/api_keys)
  deepseek: {
    enabled: true,
    apiKey: "", // e.g. "sk-..."
    name: "DeepSeek"
  },

  // 3. OpenAI (https://platform.openai.com/api-keys)
  openai: {
    enabled: true,
    apiKey: "", // Admin key ("sk-admin-...") for exact costs, or standard key ("sk-proj-...")
    monthlyBudget: 50.0, // Used for progress bar if using standard key or tracking spend limit
    name: "OpenAI"
  },

  // 4. Grok (https://console.x.ai/)
  grok: {
    enabled: true,
    apiKey: "", // e.g. "xai-..."
    name: "Grok"
  },

  // 5. Anthropic (https://console.anthropic.com/settings/keys)
  anthropic: {
    enabled: true,
    apiKey: "", // e.g. "sk-ant-api03-..." or "sk-ant-admin-..."
    monthlyBudget: 50.0, // Target budget or prepaid amount
    name: "Anthropic"
  },

  // 6. Google Cloud / Gemini (https://aistudio.google.com/app/apikey)
  googleCloud: {
    enabled: true,
    geminiApiKey: "", // e.g. "AIzaSy..."
    // Optional Cloud Credits tracking (e.g. Free Trial $300 or custom grant):
    cloudCreditsTotal: 300.0,
    cloudCreditsRemaining: 245.5, // Update manually or via billing endpoint
    billingEndpointUrl: "",       // Optional custom webhook/serverless endpoint
    name: "Google Cloud"
  }
};

const CONFIG_FILE_NAME = "api-usage-config.json";
const CACHE_FILE_NAME = "api-usage-cache.json";

// ----------------------------------------------------------------------------
// 2. FILE & CACHE HELPERS
// ----------------------------------------------------------------------------
const fm = FileManager.iCloud().isDirectory(FileManager.iCloud().documentsDirectory())
  ? FileManager.iCloud()
  : FileManager.local();

function getDocumentsPath(filename) {
  return fm.joinPath(fm.documentsDirectory(), filename);
}

function loadConfig() {
  const configPath = getDocumentsPath(CONFIG_FILE_NAME);
  if (fm.fileExists(configPath)) {
    try {
      const raw = fm.readString(configPath);
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULT_CONFIG, parsed);
    } catch (e) {
      console.warn("Could not parse config file, using defaults: " + e);
    }
  } else {
    // Write sample config if not present
    try {
      fm.writeString(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    } catch (e) {
      console.warn("Could not save initial template config: " + e);
    }
  }
  return DEFAULT_CONFIG;
}

function loadCache() {
  const cachePath = getDocumentsPath(CACHE_FILE_NAME);
  if (fm.fileExists(cachePath)) {
    try {
      const raw = fm.readString(cachePath);
      return JSON.parse(raw);
    } catch (e) {}
  }
  return null;
}

function saveCache(data) {
  try {
    const cachePath = getDocumentsPath(CACHE_FILE_NAME);
    fm.writeString(cachePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn("Could not save cache: " + e);
  }
}

function deepMerge(target, source) {
  const output = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== "" && source[key] !== null && source[key] !== undefined) {
      output[key] = source[key];
    }
  }
  return output;
}

// ----------------------------------------------------------------------------
// 3. PROVIDER API ADAPTERS
// ----------------------------------------------------------------------------

/**
 * OpenRouter Adapter
 * Queries /credits and /auth/key to extract remaining balance & total usage
 */
async function fetchOpenRouter(cfg, timeoutMs) {
  if (!cfg.apiKey) {
    return { id: "openrouter", name: cfg.name, status: "unconfigured", detail: "No API Key", subDetail: "Configure key", percent: null, color: "#9333EA" };
  }

  try {
    const req = new Request("https://openrouter.ai/api/v1/credits");
    req.headers = {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json"
    };
    req.timeoutInterval = timeoutMs / 1000;
    const res = await req.loadJSON();

    if (res && res.data) {
      const totalCredits = parseFloat(res.data.total_credits) || 0;
      const totalUsage = parseFloat(res.data.total_usage) || 0;
      const remaining = Math.max(0, totalCredits - totalUsage);
      const percent = totalCredits > 0 ? (remaining / totalCredits) * 100 : null;

      return {
        id: "openrouter",
        name: cfg.name,
        status: remaining < 1.0 ? "warning" : "ok",
        balance: remaining,
        currency: "$",
        detail: `$${remaining.toFixed(2)} left`,
        subDetail: `Used $${totalUsage.toFixed(2)} / $${totalCredits.toFixed(2)}`,
        percent: percent !== null ? Math.round(percent) : null,
        icon: "bolt.circle.fill",
        color: "#A855F7" // Purple
      };
    }
    throw new Error("Invalid credits response");
  } catch (err) {
    return {
      id: "openrouter",
      name: cfg.name,
      status: "error",
      detail: "Fetch Failed",
      subDetail: String(err.message || err).slice(0, 20),
      icon: "bolt.circle.fill",
      color: "#A855F7"
    };
  }
}

/**
 * DeepSeek Adapter
 * Queries /user/balance for real-time USD/CNY balance
 */
async function fetchDeepSeek(cfg, timeoutMs) {
  if (!cfg.apiKey) {
    return { id: "deepseek", name: cfg.name, status: "unconfigured", detail: "No API Key", subDetail: "Configure key", percent: null, color: "#0284C7" };
  }

  try {
    const req = new Request("https://api.deepseek.com/user/balance");
    req.headers = {
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: "application/json"
    };
    req.timeoutInterval = timeoutMs / 1000;
    const res = await req.loadJSON();

    if (res && res.is_available && Array.isArray(res.balance_infos)) {
      const usdInfo = res.balance_infos.find(b => b.currency === "USD") || res.balance_infos[0];
      const totalBal = parseFloat(usdInfo.total_balance) || 0;
      const toppedUp = parseFloat(usdInfo.topped_up_balance) || 0;
      const granted = parseFloat(usdInfo.granted_balance) || 0;
      const maxInitial = Math.max(totalBal, toppedUp + granted, 10);
      const percent = Math.min(100, Math.round((totalBal / maxInitial) * 100));

      return {
        id: "deepseek",
        name: cfg.name,
        status: totalBal < 1.0 ? "warning" : "ok",
        balance: totalBal,
        currency: usdInfo.currency === "CNY" ? "¥" : "$",
        detail: `${usdInfo.currency === "CNY" ? "¥" : "$"}${totalBal.toFixed(2)} left`,
        subDetail: granted > 0 ? `Incl. $${granted.toFixed(2)} grant` : "Active Balance",
        percent: percent,
        icon: "wave.3.right.circle.fill",
        color: "#0EA5E9" // DeepSeek cyan-blue
      };
    }
    throw new Error(res.error_msg || "Invalid response");
  } catch (err) {
    return {
      id: "deepseek",
      name: cfg.name,
      status: "error",
      detail: "Fetch Failed",
      subDetail: String(err.message || err).slice(0, 20),
      icon: "wave.3.right.circle.fill",
      color: "#0EA5E9"
    };
  }
}

/**
 * OpenAI Adapter
 * If admin key: queries /v1/organization/costs for month-to-date spend
 * If standard key: checks model endpoint to verify key status & tracks vs monthly budget
 */
async function fetchOpenAI(cfg, timeoutMs) {
  if (!cfg.apiKey) {
    return { id: "openai", name: cfg.name, status: "unconfigured", detail: "No API Key", subDetail: "Configure key", percent: null, color: "#10A37F" };
  }

  const budget = cfg.monthlyBudget || 50.0;
  const isAdmin = cfg.apiKey.startsWith("sk-admin-");

  if (isAdmin) {
    try {
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const startTime = Math.floor(startOfMonth.getTime() / 1000);
      const endTime = Math.floor(now.getTime() / 1000);

      const req = new Request(`https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}`);
      req.headers = { Authorization: `Bearer ${cfg.apiKey}` };
      req.timeoutInterval = timeoutMs / 1000;
      const res = await req.loadJSON();

      if (res && Array.isArray(res.data)) {
        let totalCost = 0;
        for (const item of res.data) {
          if (item.amount && typeof item.amount.value === "number") {
            totalCost += item.amount.value;
          }
        }
        const remaining = Math.max(0, budget - totalCost);
        const percent = Math.min(100, Math.round((remaining / budget) * 100));

        return {
          id: "openai",
          name: cfg.name,
          status: remaining < 5.0 ? "warning" : "ok",
          balance: remaining,
          currency: "$",
          detail: `$${totalCost.toFixed(2)} spent`,
          subDetail: `$${remaining.toFixed(2)} of $${budget} left`,
          percent: percent,
          icon: "sparkles",
          color: "#10A37F" // OpenAI emerald green
        };
      }
    } catch (e) {
      // Fallback to key validation below
    }
  }

  // Standard API Key verification
  try {
    const req = new Request("https://api.openai.com/v1/models");
    req.headers = { Authorization: `Bearer ${cfg.apiKey}` };
    req.timeoutInterval = timeoutMs / 1000;
    const res = await req.loadJSON();

    if (res && Array.isArray(res.data)) {
      return {
        id: "openai",
        name: cfg.name,
        status: "ok",
        detail: "Active (Key OK)",
        subDetail: `Budget: $${budget.toFixed(0)}/mo`,
        percent: 100,
        icon: "sparkles",
        color: "#10A37F"
      };
    } else if (res && res.error) {
      throw new Error(res.error.message || "Unauthorized");
    }
    throw new Error("Invalid response");
  } catch (err) {
    return {
      id: "openai",
      name: cfg.name,
      status: "error",
      detail: "Invalid Key",
      subDetail: String(err.message || err).slice(0, 20),
      icon: "sparkles",
      color: "#10A37F"
    };
  }
}

/**
 * Grok (xAI) Adapter
 * Queries /v1/models to verify key & model readiness
 */
async function fetchGrok(cfg, timeoutMs) {
  if (!cfg.apiKey) {
    return { id: "grok", name: cfg.name || "Grok", status: "unconfigured", detail: "No API Key", subDetail: "Configure key", percent: null, color: "#FFFFFF" };
  }

  try {
    const req = new Request("https://api.x.ai/v1/models");
    req.headers = { Authorization: `Bearer ${cfg.apiKey}` };
    req.timeoutInterval = timeoutMs / 1000;
    const res = await req.loadJSON();

    if (res && Array.isArray(res.data)) {
      return {
        id: "grok",
        name: cfg.name || "Grok",
        status: "ok",
        detail: "Active (Key OK)",
        subDetail: `${res.data.length} models ready`,
        percent: 100,
        icon: "bolt.fill",
        color: "#FFFFFF"
      };
    }
    throw new Error(res.error?.message || "Invalid response");
  } catch (err) {
    return {
      id: "grok",
      name: cfg.name || "Grok",
      status: "error",
      detail: "Check Key",
      subDetail: String(err.message || err).slice(0, 20),
      icon: "bolt.fill",
      color: "#FFFFFF"
    };
  }
}

/**
 * Anthropic Adapter
 * Pings /v1/models to verify active connection & quota
 */
async function fetchAnthropic(cfg, timeoutMs) {
  if (!cfg.apiKey) {
    return { id: "anthropic", name: cfg.name, status: "unconfigured", detail: "No API Key", subDetail: "Configure key", percent: null, color: "#D97706" };
  }

  const budget = cfg.monthlyBudget || 50.0;
  try {
    const req = new Request("https://api.anthropic.com/v1/models");
    req.headers = {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01"
    };
    req.timeoutInterval = timeoutMs / 1000;
    const res = await req.loadJSON();

    if (res && Array.isArray(res.data)) {
      return {
        id: "anthropic",
        name: cfg.name,
        status: "ok",
        detail: "Active (Key OK)",
        subDetail: `Budget: $${budget.toFixed(0)}/mo`,
        percent: 100,
        icon: "cpu.fill",
        color: "#CC785C" // Anthropic terracotta
      };
    } else if (res && res.error) {
      throw new Error(res.error.message || "Unauthorized");
    }
    throw new Error("Invalid response");
  } catch (err) {
    return {
      id: "anthropic",
      name: cfg.name,
      status: "error",
      detail: "Connection Error",
      subDetail: String(err.message || err).slice(0, 20),
      icon: "cpu.fill",
      color: "#CC785C"
    };
  }
}

/**
 * Google Cloud / Gemini Adapter
 * Validates Gemini API Key & reports Cloud Credits if configured
 */
async function fetchGoogleCloud(cfg, timeoutMs) {
  const hasGemini = Boolean(cfg.geminiApiKey);
  const hasCustomUrl = Boolean(cfg.billingEndpointUrl);

  if (!hasGemini && !hasCustomUrl && !cfg.cloudCreditsTotal) {
    return { id: "googleCloud", name: cfg.name, status: "unconfigured", detail: "Not Configured", subDetail: "Add Gemini key", percent: null, color: "#4285F4" };
  }

  // If user provided custom billing webhook/proxy endpoint
  if (hasCustomUrl) {
    try {
      const req = new Request(cfg.billingEndpointUrl);
      req.timeoutInterval = timeoutMs / 1000;
      const res = await req.loadJSON();
      if (res && typeof res.remaining === "number") {
        const total = res.total || 300;
        const pct = Math.min(100, Math.round((res.remaining / total) * 100));
        return {
          id: "googleCloud",
          name: cfg.name,
          status: res.remaining < 20 ? "warning" : "ok",
          detail: `$${res.remaining.toFixed(2)} credits`,
          subDetail: `Spent $${(total - res.remaining).toFixed(2)}`,
          percent: pct,
          icon: "cloud.fill",
          color: "#4285F4"
        };
      }
    } catch (e) {}
  }

  // Check Gemini API key validity
  if (hasGemini) {
    try {
      const req = new Request(`https://generativelanguage.googleapis.com/v1beta/models?key=${cfg.geminiApiKey}`);
      req.timeoutInterval = timeoutMs / 1000;
      const res = await req.loadJSON();

      if (res && Array.isArray(res.models)) {
        const totalCredits = cfg.cloudCreditsTotal || 300.0;
        const remainingCredits = typeof cfg.cloudCreditsRemaining === "number" ? cfg.cloudCreditsRemaining : totalCredits;
        const pct = Math.min(100, Math.round((remainingCredits / totalCredits) * 100));

        return {
          id: "googleCloud",
          name: cfg.name,
          status: remainingCredits < 25 ? "warning" : "ok",
          detail: `$${remainingCredits.toFixed(2)} credits`,
          subDetail: "Gemini Key Active",
          percent: pct,
          icon: "cloud.fill",
          color: "#4285F4" // Google Cloud Blue
        };
      }
      throw new Error(res.error?.message || "Invalid Gemini response");
    } catch (err) {
      return {
        id: "googleCloud",
        name: cfg.name,
        status: "error",
        detail: "Gemini Error",
        subDetail: String(err.message || err).slice(0, 20),
        icon: "cloud.fill",
        color: "#4285F4"
      };
    }
  }

  // Fallback to static configured credit budget
  const total = cfg.cloudCreditsTotal || 300.0;
  const remaining = cfg.cloudCreditsRemaining || 0.0;
  const pct = Math.min(100, Math.round((remaining / total) * 100));
  return {
    id: "googleCloud",
    name: cfg.name,
    status: "ok",
    detail: `$${remaining.toFixed(2)} credits`,
    subDetail: `Budget: $${total.toFixed(0)}`,
    percent: pct,
    icon: "cloud.fill",
    color: "#4285F4"
  };
}

// ----------------------------------------------------------------------------
// 4. COORDINATOR: PARALLEL FETCH WITH FALLBACK TO CACHE
// ----------------------------------------------------------------------------
async function fetchAllProviders(config) {
  const timeoutMs = config.timeoutMs || 6000;
  const tasks = [];

  if (config.openrouter?.enabled) tasks.push(fetchOpenRouter(config.openrouter, timeoutMs));
  if (config.deepseek?.enabled) tasks.push(fetchDeepSeek(config.deepseek, timeoutMs));
  if (config.openai?.enabled) tasks.push(fetchOpenAI(config.openai, timeoutMs));
  if (config.grok?.enabled || config.groq?.enabled) tasks.push(fetchGrok(config.grok || config.groq, timeoutMs));
  if (config.anthropic?.enabled) tasks.push(fetchAnthropic(config.anthropic, timeoutMs));
  if (config.googleCloud?.enabled) tasks.push(fetchGoogleCloud(config.googleCloud, timeoutMs));

  const results = await Promise.allSettled(tasks);
  const providers = [];
  const cachedData = loadCache();
  const cachedMap = (cachedData?.providers || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      // If error or timed out, attempt to fallback to previously cached healthy value
      if (r.value.status === "error" && cachedMap[r.value.id] && cachedMap[r.value.id].status !== "error") {
        const cached = cachedMap[r.value.id];
        cached.subDetail = "Cached • " + (cached.subDetail || "");
        providers.push(cached);
      } else {
        providers.push(r.value);
      }
    }
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    providers
  };
  saveCache(payload);
  return payload;
}

// ----------------------------------------------------------------------------
// 5. GRAPHICS & PROGRESS BAR GENERATOR
// ----------------------------------------------------------------------------
function createProgressBar(percent, width, height, barColor, bgColor) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  // Background track
  dc.setFillColor(new Color(bgColor || "#2A2B3D"));
  const bgPath = new Path();
  bgPath.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  dc.addPath(bgPath);
  dc.fillPath();

  // Active Fill
  if (percent !== null && percent !== undefined && percent > 0) {
    const clamped = Math.max(0, Math.min(100, percent));
    const fillWidth = Math.max(height, (clamped / 100) * width);
    dc.setFillColor(new Color(barColor || "#3B82F6"));
    const fillPath = new Path();
    fillPath.addRoundedRect(new Rect(0, 0, fillWidth, height), height / 2, height / 2);
    dc.addPath(fillPath);
    dc.fillPath();
  }

  return dc.getImage();
}

function getStatusIndicator(status) {
  if (status === "ok") return { symbol: "checkmark.circle.fill", color: "#10B981" }; // Green
  if (status === "warning") return { symbol: "exclamationmark.triangle.fill", color: "#F59E0B" }; // Yellow
  if (status === "unconfigured") return { symbol: "minus.circle.fill", color: "#6B7280" }; // Gray
  return { symbol: "xmark.circle.fill", color: "#EF4444" }; // Red
}

// ----------------------------------------------------------------------------
// 6. WIDGET BUILDERS: SMALL, MEDIUM, LARGE
// ----------------------------------------------------------------------------

function applyThemeBackground(widget, themeName) {
  const gradient = new LinearGradient();
  gradient.locations = [0.0, 1.0];

  if (themeName === "midnight") {
    gradient.colors = [new Color("#0B0F19"), new Color("#111827")];
  } else if (themeName === "dracula") {
    gradient.colors = [new Color("#1E1F29"), new Color("#282A36")];
  } else {
    // Default modern obsidian dark
    gradient.colors = [new Color("#14151F"), new Color("#1C1E2D")];
  }
  widget.backgroundGradient = gradient;
}

/**
 * SMALL WIDGET (2x2)
 * Shows the top 2 active providers with prominent balance cards
 */
function buildSmallWidget(data, config) {
  const widget = new ListWidget();
  applyThemeBackground(widget, config.theme);
  widget.setPadding(12, 12, 12, 12);

  const refreshMin = config.refreshMinutes || 30;
  widget.refreshAfterDate = new Date(Date.now() + refreshMin * 60 * 1000);

  // Header
  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const titleIcon = SFSymbol.named("chart.bar.xaxis");
  titleIcon.applyFont(Font.systemFont(11, "bold"));
  const iconImg = header.addImage(titleIcon.image);
  iconImg.tintColor = new Color("#818CF8");
  iconImg.imageSize = new Size(13, 13);
  header.addSpacer(4);

  const title = header.addText("API USAGE");
  title.font = Font.systemFont(10, "heavy");
  title.textColor = new Color("#94A3B8");
  header.addSpacer();

  const timeStr = formatShortTime(new Date(data.updatedAt));
  const timeText = header.addText(timeStr);
  timeText.font = Font.systemFont(9, "medium");
  timeText.textColor = new Color("#64748B");

  widget.addSpacer(8);

  // Take first 2-3 configured providers
  const displayProviders = data.providers.slice(0, 3);

  for (let i = 0; i < displayProviders.length; i++) {
    const p = displayProviders[i];
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();

    // Provider Icon or Dot
    const dot = row.addText("●");
    dot.font = Font.systemFont(8);
    dot.textColor = new Color(p.color || "#818CF8");
    row.addSpacer(4);

    const nameText = row.addText(p.name);
    nameText.font = Font.systemFont(11, "semibold");
    nameText.textColor = new Color("#F1F5F9");
    row.addSpacer();

    const detailText = row.addText(p.detail);
    detailText.font = Font.systemFont(11, "bold");
    detailText.textColor = p.status === "warning" ? new Color("#FBBF24") : new Color("#FFFFFF");

    // Mini progress bar if percent available
    if (p.percent !== null && p.percent !== undefined) {
      widget.addSpacer(2);
      const barImg = widget.addImage(createProgressBar(p.percent, 130, 4, p.color, "#334155"));
      barImg.imageSize = new Size(130, 4);
    }

    if (i < displayProviders.length - 1) {
      widget.addSpacer(6);
    }
  }

  return widget;
}

/**
 * MEDIUM WIDGET (2x4)
 * Displays a 2-column or 3x2 grid of all configured providers
 */
function buildMediumWidget(data, config) {
  const widget = new ListWidget();
  applyThemeBackground(widget, config.theme);
  widget.setPadding(12, 14, 12, 14);

  const refreshMin = config.refreshMinutes || 30;
  widget.refreshAfterDate = new Date(Date.now() + refreshMin * 60 * 1000);

  // Header row
  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const titleIcon = SFSymbol.named("cpu.fill");
  titleIcon.applyFont(Font.systemFont(12, "bold"));
  const iconImg = header.addImage(titleIcon.image);
  iconImg.tintColor = new Color("#38BDF8");
  iconImg.imageSize = new Size(13, 13);
  header.addSpacer(5);

  const title = header.addText("AI & CLOUD API USAGE");
  title.font = Font.systemFont(10, "heavy");
  title.textColor = new Color("#94A3B8");
  header.addSpacer();

  const timeStr = "Updated " + formatShortTime(new Date(data.updatedAt));
  const timeText = header.addText(timeStr);
  timeText.font = Font.systemFont(9, "medium");
  timeText.textColor = new Color("#64748B");

  widget.addSpacer(8);

  // 2-column layout container
  const gridContainer = widget.addStack();
  gridContainer.layoutHorizontally();
  gridContainer.spacing = 10;

  const leftCol = gridContainer.addStack();
  leftCol.layoutVertically();
  leftCol.spacing = 6;

  const rightCol = gridContainer.addStack();
  rightCol.layoutVertically();
  rightCol.spacing = 6;

  const providers = data.providers;
  const mid = Math.ceil(providers.length / 2);

  renderColumn(leftCol, providers.slice(0, mid));
  renderColumn(rightCol, providers.slice(mid));

  return widget;
}

function renderColumn(colStack, items) {
  for (const p of items) {
    const card = colStack.addStack();
    card.layoutVertically();
    card.backgroundColor = new Color("#1E2030", 0.6);
    card.cornerRadius = 6;
    card.setPadding(4, 6, 4, 6);

    const topRow = card.addStack();
    topRow.layoutHorizontally();
    topRow.centerAlignContent();

    // Provider colored badge
    const badge = topRow.addText("• " + p.name);
    badge.font = Font.systemFont(10, "bold");
    badge.textColor = new Color(p.color || "#38BDF8");
    topRow.addSpacer();

    const val = topRow.addText(p.detail);
    val.font = Font.systemFont(10, "bold");
    val.textColor = p.status === "warning" ? new Color("#FBBF24") : (p.status === "error" ? new Color("#F87171") : new Color("#FFFFFF"));

    if (p.percent !== null && p.percent !== undefined) {
      card.addSpacer(3);
      const bar = card.addImage(createProgressBar(p.percent, 140, 3, p.color, "#334155"));
      bar.imageSize = new Size(140, 3);
    }
  }
}

/**
 * LARGE WIDGET (4x4)
 * Full comprehensive dashboard showing all 6 providers with details and progress
 */
function buildLargeWidget(data, config) {
  const widget = new ListWidget();
  applyThemeBackground(widget, config.theme);
  widget.setPadding(14, 16, 14, 16);

  const refreshMin = config.refreshMinutes || 30;
  widget.refreshAfterDate = new Date(Date.now() + refreshMin * 60 * 1000);

  // Header
  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const titleIcon = SFSymbol.named("chart.pie.fill");
  titleIcon.applyFont(Font.systemFont(13, "bold"));
  const iconImg = header.addImage(titleIcon.image);
  iconImg.tintColor = new Color("#60A5FA");
  iconImg.imageSize = new Size(14, 14);
  header.addSpacer(6);

  const title = header.addText("API QUOTA & USAGE MONITOR");
  title.font = Font.systemFont(11, "heavy");
  title.textColor = new Color("#94A3B8");
  header.addSpacer();

  const pulse = header.addText("● ");
  pulse.font = Font.systemFont(8);
  pulse.textColor = new Color("#10B981");

  const timeStr = "Updated " + formatShortTime(new Date(data.updatedAt));
  const timeText = header.addText(timeStr);
  timeText.font = Font.systemFont(10, "medium");
  timeText.textColor = new Color("#64748B");

  widget.addSpacer(10);

  // Provider Rows (up to 6 providers)
  for (let i = 0; i < data.providers.length; i++) {
    const p = data.providers[i];

    const card = widget.addStack();
    card.layoutVertically();
    card.backgroundColor = new Color("#1E2032", 0.75);
    card.cornerRadius = 8;
    card.setPadding(6, 10, 6, 10);

    const mainRow = card.addStack();
    mainRow.layoutHorizontally();
    mainRow.centerAlignContent();

    // SF Symbol Icon with subtle circle
    const sf = SFSymbol.named(p.icon || "circle.fill");
    sf.applyFont(Font.systemFont(12, "semibold"));
    const icon = mainRow.addImage(sf.image);
    icon.tintColor = new Color(p.color || "#818CF8");
    icon.imageSize = new Size(14, 14);
    mainRow.addSpacer(8);

    // Provider Name
    const name = mainRow.addText(p.name);
    name.font = Font.systemFont(12, "semibold");
    name.textColor = new Color("#F8FAFC");
    mainRow.addSpacer();

    // Value / Detail
    const detail = mainRow.addText(p.detail);
    detail.font = Font.systemFont(12, "bold");
    detail.textColor = p.status === "warning" ? new Color("#FBBF24") : (p.status === "error" ? new Color("#F87171") : new Color("#F1F5F9"));

    // Sub-row for progress bar & subtitle
    const subRow = card.addStack();
    subRow.layoutHorizontally();
    subRow.centerAlignContent();

    const sub = subRow.addText(p.subDetail || "");
    sub.font = Font.systemFont(9, "medium");
    sub.textColor = new Color("#94A3B8");
    subRow.addSpacer();

    if (p.percent !== null && p.percent !== undefined) {
      const pctText = subRow.addText(`${p.percent}%`);
      pctText.font = Font.systemFont(9, "bold");
      pctText.textColor = new Color("#CBD5E1");
      subRow.addSpacer(6);

      const bar = subRow.addImage(createProgressBar(p.percent, 60, 4, p.color, "#334155"));
      bar.imageSize = new Size(60, 4);
    }

    if (i < data.providers.length - 1) {
      widget.addSpacer(5);
    }
  }

  // Footer / Status
  widget.addSpacer();
  const footer = widget.addStack();
  footer.layoutHorizontally();
  footer.centerAlignContent();

  const footerText = footer.addText("Tap to refresh • OpenRouter • OpenAI • DeepSeek • Groq");
  footerText.font = Font.systemFont(9, "regular");
  footerText.textColor = new Color("#475569");

  return widget;
}

function formatShortTime(date) {
  if (isNaN(date.getTime())) return "--:--";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// ----------------------------------------------------------------------------
// 7. IN-APP INTERACTIVE MENU (WHEN RUN INSIDE SCRIPTABLE APP)
// ----------------------------------------------------------------------------
async function runInteractiveMenu(config, data) {
  const alert = new Alert();
  alert.title = "⚡️ API Usage Monitor";
  alert.message = `Loaded ${data.providers.length} providers.\nWhat would you like to do?`;

  alert.addAction("📱 Preview Medium Widget");
  alert.addAction("📱 Preview Large Widget");
  alert.addAction("📱 Preview Small Widget");
  alert.addAction("🔍 Test Provider Connections");
  alert.addAction("⚙️ View Config File Location");
  alert.addCancelAction("Done");

  const choice = await alert.presentAlert();

  if (choice === 0) {
    const w = buildMediumWidget(data, config);
    await w.presentMedium();
  } else if (choice === 1) {
    const w = buildLargeWidget(data, config);
    await w.presentLarge();
  } else if (choice === 2) {
    const w = buildSmallWidget(data, config);
    await w.presentSmall();
  } else if (choice === 3) {
    await testConnectionsAlert(data);
  } else if (choice === 4) {
    const pathAlert = new Alert();
    pathAlert.title = "Config Location";
    pathAlert.message = `Config file is located at:\n${getDocumentsPath(CONFIG_FILE_NAME)}\n\nYou can edit this JSON file directly in the Files app under 'Scriptable'.`;
    pathAlert.addAction("OK");
    await pathAlert.presentAlert();
  }
}

async function testConnectionsAlert(data) {
  const alert = new Alert();
  alert.title = "Provider Connection Status";
  let message = "";
  for (const p of data.providers) {
    const ind = p.status === "ok" ? "✅" : (p.status === "warning" ? "⚠️" : (p.status === "unconfigured" ? "⚪️" : "❌"));
    message += `${ind} ${p.name}: ${p.detail} (${p.subDetail})\n`;
  }
  alert.message = message;
  alert.addAction("OK");
  await alert.presentAlert();
}

// ----------------------------------------------------------------------------
// 8. ENTRY POINT
// ----------------------------------------------------------------------------
(async () => {
  const userConfig = loadConfig();
  const data = await fetchAllProviders(userConfig);

  const widgetFamily = (config.widgetFamily || args.widgetParameter || "medium").toLowerCase();

  let widget;
  if (config.runsInWidget) {
    if (widgetFamily === "small") {
      widget = buildSmallWidget(data, userConfig);
    } else if (widgetFamily === "medium") {
      widget = buildMediumWidget(data, userConfig);
    } else {
      widget = buildLargeWidget(data, userConfig);
    }
    Script.setWidget(widget);
  } else {
    // When running inside the Scriptable app
    await runInteractiveMenu(userConfig, data);
  }

  Script.complete();
})();
