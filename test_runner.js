#!/usr/bin/env node

/**
 * Local Node.js Test Runner for API Usage Monitor
 * Tests your provider API keys and displays a preview in your terminal
 * Run: node test_runner.js [config_path]
 */

const fs = require('fs');
const path = require('path');

const configPath = process.argv[2] || path.join(__dirname, 'config.json');
const fallbackPath = path.join(__dirname, 'config.example.json');

let config;
if (fs.existsSync(configPath)) {
  console.log(`\x1b[36mℹ️  Loading config from: ${configPath}\x1b[0m`);
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} else if (fs.existsSync(fallbackPath)) {
  console.log(`\x1b[33m⚠️  ${configPath} not found. Using template: ${fallbackPath}\x1b[0m`);
  config = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
} else {
  console.error("No config file found!");
  process.exit(1);
}

const timeoutMs = config.timeoutMs || 6000;

async function fetchWithTimeout(url, options = {}, timeout = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function testOpenRouter(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes("YOUR_")) {
    return { name: cfg?.name || "OpenRouter", status: "unconfigured", detail: "No API Key", sub: "Set apiKey" };
  }
  try {
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${cfg.apiKey}` }
    }, timeoutMs);
    const data = await res.json();
    if (data && data.data) {
      const total = parseFloat(data.data.total_credits) || 0;
      const used = parseFloat(data.data.total_usage) || 0;
      const left = Math.max(0, total - used);
      return {
        name: cfg.name,
        status: left < 1.0 ? "warning" : "ok",
        detail: `$${left.toFixed(2)} left`,
        sub: `Used $${used.toFixed(2)} of $${total.toFixed(2)}`,
        percent: total > 0 ? Math.round((left / total) * 100) : null
      };
    }
    throw new Error(JSON.stringify(data));
  } catch (e) {
    return { name: cfg.name, status: "error", detail: "Error", sub: e.message.slice(0, 30) };
  }
}

async function testDeepSeek(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes("YOUR_")) {
    return { name: cfg?.name || "DeepSeek", status: "unconfigured", detail: "No API Key", sub: "Set apiKey" };
  }
  try {
    const res = await fetchWithTimeout("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" }
    }, timeoutMs);
    const data = await res.json();
    if (data && data.is_available && Array.isArray(data.balance_infos)) {
      const usd = data.balance_infos.find(b => b.currency === "USD") || data.balance_infos[0];
      const bal = parseFloat(usd.total_balance) || 0;
      const granted = parseFloat(usd.granted_balance) || 0;
      return {
        name: cfg.name,
        status: bal < 1.0 ? "warning" : "ok",
        detail: `${usd.currency === "CNY" ? "¥" : "$"}${bal.toFixed(2)} left`,
        sub: granted > 0 ? `Grant: $${granted.toFixed(2)}` : "Active Balance",
        percent: Math.min(100, Math.round((bal / 20) * 100))
      };
    }
    throw new Error(data.error_msg || JSON.stringify(data));
  } catch (e) {
    return { name: cfg.name, status: "error", detail: "Error", sub: e.message.slice(0, 30) };
  }
}

async function testOpenAI(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes("YOUR_")) {
    return { name: cfg?.name || "OpenAI", status: "unconfigured", detail: "No API Key", sub: "Set apiKey" };
  }
  const isAdmin = cfg.apiKey.startsWith("sk-admin-");
  const budget = cfg.monthlyBudget || 50;

  if (isAdmin) {
    try {
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const startTime = Math.floor(startOfMonth.getTime() / 1000);
      const endTime = Math.floor(now.getTime() / 1000);
      const res = await fetchWithTimeout(
        `https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}`,
        { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
        timeoutMs
      );
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        let total = 0;
        for (const i of data.data) total += i.amount?.value || 0;
        const left = Math.max(0, budget - total);
        return {
          name: cfg.name,
          status: left < 5 ? "warning" : "ok",
          detail: `$${total.toFixed(2)} spent`,
          sub: `$${left.toFixed(2)} of $${budget} left`,
          percent: Math.round((left / budget) * 100)
        };
      }
    } catch (e) {}
  }

  // Key validation check
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${cfg.apiKey}` }
    }, timeoutMs);
    const data = await res.json();
    if (data && Array.isArray(data.data)) {
      return {
        name: cfg.name,
        status: "ok",
        detail: "Active (Key OK)",
        sub: `Budget: $${budget}/mo`,
        percent: 100
      };
    }
    throw new Error(data.error?.message || "Invalid response");
  } catch (e) {
    return { name: cfg.name, status: "error", detail: "Error", sub: e.message.slice(0, 30) };
  }
}

async function testGroq(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes("YOUR_")) {
    return { name: cfg?.name || "Groq", status: "unconfigured", detail: "No API Key", sub: "Set apiKey" };
  }
  try {
    const res = await fetchWithTimeout("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${cfg.apiKey}` }
    }, timeoutMs);
    const data = await res.json();
    if (data && Array.isArray(data.data)) {
      const rem = res.headers.get("x-ratelimit-remaining-tokens");
      const lim = res.headers.get("x-ratelimit-limit-tokens");
      let detail = "Active (Key OK)";
      let sub = `${data.length} models ready`;
      let pct = 100;
      if (rem && lim && parseInt(lim) > 0) {
        pct = Math.round((parseInt(rem) / parseInt(lim)) * 100);
        detail = `${pct}% RPM left`;
        sub = `${Math.round(parseInt(rem) / 1000)}k tokens remaining`;
      }
      return { name: cfg.name, status: "ok", detail, sub, percent: pct };
    }
    throw new Error(data.error?.message || "Invalid response");
  } catch (e) {
    return { name: cfg.name, status: "error", detail: "Error", sub: e.message.slice(0, 30) };
  }
}

async function testAnthropic(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes("YOUR_")) {
    return { name: cfg?.name || "Anthropic", status: "unconfigured", detail: "No API Key", sub: "Set apiKey" };
  }
  const budget = cfg.monthlyBudget || 50;
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" }
    }, timeoutMs);
    const data = await res.json();
    if (data && Array.isArray(data.data)) {
      return {
        name: cfg.name,
        status: "ok",
        detail: "Active (Key OK)",
        sub: `Budget: $${budget}/mo`,
        percent: 100
      };
    }
    throw new Error(data.error?.message || "Invalid response");
  } catch (e) {
    return { name: cfg.name, status: "error", detail: "Error", sub: e.message.slice(0, 30) };
  }
}

async function testGoogleCloud(cfg) {
  if (!cfg?.geminiApiKey || cfg.geminiApiKey.includes("YOUR_")) {
    const total = cfg?.cloudCreditsTotal || 300;
    const rem = cfg?.cloudCreditsRemaining || 0;
    return {
      name: cfg?.name || "Google Cloud",
      status: cfg?.cloudCreditsTotal ? "ok" : "unconfigured",
      detail: `$${rem.toFixed(2)} credits`,
      sub: `Budget: $${total.toFixed(0)}`,
      percent: Math.round((rem / total) * 100)
    };
  }
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${cfg.geminiApiKey}`,
      {},
      timeoutMs
    );
    const data = await res.json();
    if (data && Array.isArray(data.models)) {
      const total = cfg.cloudCreditsTotal || 300;
      const rem = typeof cfg.cloudCreditsRemaining === "number" ? cfg.cloudCreditsRemaining : total;
      return {
        name: cfg.name,
        status: rem < 25 ? "warning" : "ok",
        detail: `$${rem.toFixed(2)} credits`,
        sub: "Gemini Key Active",
        percent: Math.round((rem / total) * 100)
      };
    }
    throw new Error(data.error?.message || "Invalid response");
  } catch (e) {
    return { name: cfg.name, status: "error", detail: "Error", sub: e.message.slice(0, 30) };
  }
}

function renderBar(pct, width = 14) {
  if (pct === null || pct === undefined) return " ".repeat(width);
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  const empty = width - filled;
  return `\x1b[32m${"█".repeat(filled)}\x1b[90m${"░".repeat(empty)}\x1b[0m`;
}

function statusBadge(st) {
  if (st === "ok") return "\x1b[32m✔ OK    \x1b[0m";
  if (st === "warning") return "\x1b[33m▲ WARN  \x1b[0m";
  if (st === "unconfigured") return "\x1b[90m○ UNSET \x1b[0m";
  return "\x1b[31m✖ ERR   \x1b[0m";
}

async function main() {
  console.log("\n\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m");
  console.log("\x1b[1m          ⚡️ AI & Cloud API Usage Monitor (Preview)               \x1b[0m");
  console.log("\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m\n");

  const results = await Promise.all([
    testOpenRouter(config.openrouter),
    testDeepSeek(config.deepseek),
    testOpenAI(config.openai),
    testGroq(config.groq),
    testAnthropic(config.anthropic),
    testGoogleCloud(config.googleCloud)
  ]);

  console.log("┌──────────────┬─────────┬───────────────────┬───────────────────┬──────────────┐");
  console.log("│ Provider     │ Status  │ Primary Detail    │ Sub Detail        │ Gauge        │");
  console.log("├──────────────┼─────────┼───────────────────┼───────────────────┼──────────────┤");

  for (const r of results) {
    const name = r.name.padEnd(12);
    const detail = (r.detail || "").padEnd(17).slice(0, 17);
    const sub = (r.sub || "").padEnd(17).slice(0, 17);
    const bar = renderBar(r.percent);
    console.log(`│ ${name} │ ${statusBadge(r.status)}│ ${detail} │ ${sub} │ ${bar} │`);
  }
  console.log("└──────────────┴─────────┴───────────────────┴───────────────────┴──────────────┘\n");

  console.log("\x1b[90mTip: To add real API keys, copy config.example.json to config.json and fill in your keys.\x1b[0m\n");
}

main().catch(console.error);
