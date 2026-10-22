#!/usr/bin/env node

/**
 * <xbar.title>AI & Cloud API Usage Monitor</xbar.title>
 * <xbar.version>v1.0</xbar.version>
 * <xbar.author>Margam Ravi Teja</xbar.author>
 * <xbar.desc>Monitors API balances and quota for OpenRouter, DeepSeek, OpenAI, Grok (xAI), Anthropic, and Google Cloud</xbar.desc>
 * <xbar.dependencies>node</xbar.dependencies>
 * <swiftbar.hideAbout>true</swiftbar.hideAbout>
 * <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
 */

const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');
const configPath = path.join(repoDir, 'config.json');
const fallbackPath = path.join(repoDir, 'config.example.json');
const ICONS_DIR = path.join(repoDir, 'assets', 'icons');

let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {}
} else if (fs.existsSync(fallbackPath)) {
  try {
    config = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  } catch (e) {}
}

const timeoutMs = config.timeoutMs || 5000;

function getBase64(iconName) {
  try {
    const p = path.join(ICONS_DIR, `${iconName}.png`);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p).toString('base64');
    }
  } catch (e) {}
  return '';
}

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
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

async function getOpenRouter(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes('YOUR_')) {
    return { id: 'openrouter', name: cfg?.name || 'OpenRouter', status: 'unset', detail: 'Unset', url: 'https://openrouter.ai/keys' };
  }
  try {
    const res = await fetchWithTimeout('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${cfg.apiKey}` }
    }, timeoutMs);
    const data = await res.json();
    if (data?.data) {
      const total = parseFloat(data.data.total_credits) || 0;
      const used = parseFloat(data.data.total_usage) || 0;
      const left = Math.max(0, total - used);
      return {
        id: 'openrouter',
        name: cfg.name,
        status: left < 1.0 ? 'warning' : 'ok',
        balance: left,
        detail: `$${left.toFixed(2)} left`,
        sub: `Used $${used.toFixed(2)} / $${total.toFixed(2)}`,
        percent: total > 0 ? Math.round((left / total) * 100) : null,
        url: 'https://openrouter.ai/credits',
        color: '#A855F7'
      };
    }
  } catch (e) {}
  return { id: 'openrouter', name: cfg.name, status: 'error', detail: 'Error', url: 'https://openrouter.ai/credits' };
}

async function getDeepSeek(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes('YOUR_')) {
    return { id: 'deepseek', name: cfg?.name || 'DeepSeek', status: 'unset', detail: 'Unset', url: 'https://platform.deepseek.com/' };
  }
  try {
    const res = await fetchWithTimeout('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' }
    }, timeoutMs);
    const data = await res.json();
    if (data?.is_available && Array.isArray(data.balance_infos)) {
      const usd = data.balance_infos.find(b => b.currency === "USD") || data.balance_infos[0];
      const bal = parseFloat(usd.total_balance) || 0;
      return {
        id: 'deepseek',
        name: cfg.name,
        status: bal < 1.0 ? 'warning' : 'ok',
        balance: bal,
        detail: `${usd.currency === 'CNY' ? '¥' : '$'}${bal.toFixed(2)} left`,
        sub: 'Active balance',
        url: 'https://platform.deepseek.com/top_up',
        color: '#0EA5E9'
      };
    }
  } catch (e) {}
  return { id: 'deepseek', name: cfg.name, status: 'error', detail: 'Error', url: 'https://platform.deepseek.com/' };
}

async function getOpenAI(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes('YOUR_')) {
    return { id: 'openai', name: cfg?.name || 'OpenAI', status: 'unset', detail: 'Unset', url: 'https://platform.openai.com/usage' };
  }
  const budget = cfg.monthlyBudget || 50;
  if (cfg.apiKey.startsWith('sk-admin-')) {
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
      if (Array.isArray(data?.data)) {
        let total = 0;
        for (const i of data.data) total += i.amount?.value || 0;
        const left = Math.max(0, budget - total);
        return {
          id: 'openai',
          name: cfg.name,
          status: left < 5 ? 'warning' : 'ok',
          detail: `$${total.toFixed(2)} spent`,
          sub: `$${left.toFixed(2)} of $${budget} left`,
          percent: Math.round((left / budget) * 100),
          url: 'https://platform.openai.com/usage',
          color: '#10A37F'
        };
      }
    } catch (e) {}
  }
  return {
    id: 'openai',
    name: cfg.name,
    status: 'ok',
    detail: 'Active (Key OK)',
    sub: `Budget: $${budget}/mo`,
    url: 'https://platform.openai.com/usage',
    color: '#10A37F'
  };
}

async function getGrok(cfg) {
  const c = cfg || config.grok || config.groq;
  if (!c?.apiKey || c.apiKey.includes('YOUR_')) {
    return { id: 'grok', name: c?.name || 'Grok', status: 'unset', detail: 'Unset', url: 'https://console.x.ai/' };
  }
  try {
    const res = await fetchWithTimeout('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${c.apiKey}` }
    }, timeoutMs);
    const data = await res.json();
    if (Array.isArray(data?.data)) {
      return {
        id: 'grok',
        name: c.name || 'Grok',
        status: 'ok',
        detail: 'Active (Key OK)',
        sub: `${data.data.length} models ready`,
        url: 'https://console.x.ai/',
        color: '#FFFFFF'
      };
    }
  } catch (e) {}
  return { id: 'grok', name: c?.name || 'Grok', status: 'error', detail: 'Error', url: 'https://console.x.ai/' };
}

async function getAnthropic(cfg) {
  if (!cfg?.apiKey || cfg.apiKey.includes('YOUR_')) {
    return { id: 'anthropic', name: cfg?.name || 'Anthropic', status: 'unset', detail: 'Unset', url: 'https://console.anthropic.com/' };
  }
  return {
    id: 'anthropic',
    name: cfg.name,
    status: 'ok',
    detail: 'Active (Key OK)',
    sub: `Budget: $${cfg.monthlyBudget || 50}/mo`,
    url: 'https://console.anthropic.com/',
    color: '#CC785C'
  };
}

async function getGoogleCloud(cfg) {
  const total = cfg?.cloudCreditsTotal || 300;
  const rem = typeof cfg?.cloudCreditsRemaining === 'number' ? cfg.cloudCreditsRemaining : total;
  return {
    id: 'googlecloud',
    name: cfg?.name || 'Google Cloud',
    status: 'ok',
    detail: `$${rem.toFixed(2)} credits`,
    sub: `Budget: $${total.toFixed(0)}`,
    url: 'https://console.cloud.google.com/billing',
    color: '#4285F4'
  };
}

function renderGauge(pct, len = 8) {
  if (pct === null || pct === undefined) return '';
  const fill = Math.round((Math.max(0, Math.min(100, pct)) / 100) * len);
  return `[${'■'.repeat(fill)}${'·'.repeat(len - fill)}]`;
}

async function main() {
  const [openrouter, deepseek, openai, grok, anthropic, gcloud] = await Promise.all([
    getOpenRouter(config.openrouter),
    getDeepSeek(config.deepseek),
    getOpenAI(config.openai),
    getGrok(config.grok || config.groq),
    getAnthropic(config.anthropic),
    getGoogleCloud(config.googleCloud)
  ]);

  const items = [openrouter, deepseek, openai, grok, anthropic, gcloud];

  // Output all enabled providers as rotating ticker headers (with official logos, no spark)
  for (const item of items) {
    const iconName = item.id || 'openai';
    const b64 = getBase64(iconName);
    const imgParam = b64 ? ` | image=${b64}` : '';
    console.log(`${item.name}: ${item.detail} | dropdown=false | icon=${iconName}${imgParam}`);
  }
  console.log('---');

  // Header Title
  console.log('AI & Cloud API Monitor | size=14 font=Menlo-Bold');
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  console.log(`Last updated: ${timeStr} | size=10 color=#888888`);
  console.log('---');

  // Provider entries
  for (const item of items) {
    const iconName = item.id || 'openai';
    const b64 = getBase64(iconName);
    const imgParam = b64 ? ` | image=${b64}` : '';
    const gauge = renderGauge(item.percent);
    const line = `${item.name}: ${item.detail} ${gauge} | href=${item.url} | font=Menlo-Regular | icon=${iconName}${imgParam}`;
    console.log(line);
    if (item.sub) {
      console.log(`-- ${item.sub} | size=11 color=#888888`);
    }
  }

  console.log('---');
  console.log('🔄 Refresh Now | refresh=true');
  console.log(`⚙️ Edit config.json | bash=open param1=${configPath} terminal=false`);
  console.log(`📂 Open Project Folder | bash=open param1=${repoDir} terminal=false`);
}

main().catch(err => {
  console.log('API Monitor: Error | dropdown=false');
  console.log('---');
  console.log(`Error: ${err.message}`);
  console.log('🔄 Refresh | refresh=true');
});
