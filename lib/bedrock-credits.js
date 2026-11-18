const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BILLING_CREDITS_URL = 'https://console.aws.amazon.com/billing/home#/credits';
const DEFAULT_TIMEOUT_MS = 20000;

// Use the user's existing CLI profile instead of storing AWS secrets in config.

function baseResult(cfg = {}) {
  return {
    id: 'bedrock',
    name: cfg.name || 'Bedrock',
    url: cfg.consoleUrl || BILLING_CREDITS_URL,
    color: '#FF9900'
  };
}

function findAwsCli() {
  const candidates = [];
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (directory) candidates.push(path.join(directory, 'aws'));
  }
  candidates.push(
    path.join(os.homedir(), '.local/bin/aws'),
    '/opt/homebrew/bin/aws',
    '/usr/local/bin/aws',
    '/usr/bin/aws'
  );
  return candidates.find(candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch (_) {
      return false;
    }
  }) || null;
}

function runAwsCli(awsCliPath, args, profile, timeoutMs) {
  const commandArgs = [...args];
  if (profile) commandArgs.push('--profile', profile);
  commandArgs.push('--output', 'json', '--no-cli-pager');

  return new Promise((resolve, reject) => {
    execFile(awsCliPath, commandArgs, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, AWS_PAGER: '' }
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function money(amount) {
  const value = Number(amount?.currencyAmount);
  if (!Number.isFinite(value)) return null;
  return {
    amount: value,
    currency: amount?.currencyCode || 'USD'
  };
}

function formatMoney(value, currency) {
  const symbols = { USD: '$', CNY: '¥', EUR: '€', GBP: '£' };
  return `${symbols[currency] || `${currency} `}${value.toFixed(2)}`;
}

// Only enabled credits inside their validity window can offset current usage.
function isCurrentCredit(credit, nowSeconds) {
  if (credit.creditStatus !== 'ENABLED') return false;
  if (Number.isFinite(credit.startDate) && credit.startDate > nowSeconds) return false;
  if (Number.isFinite(credit.endDate) && credit.endDate <= nowSeconds) return false;
  return true;
}

// AWS lists every applicable product; do not infer eligibility from usage.
function isBedrockCredit(credit) {
  return Array.isArray(credit.applicableProductNames) &&
    credit.applicableProductNames.some(product => /bedrock/i.test(product));
}

function summarizeBedrockCredits(credits, now = Date.now()) {
  // Sum matching currencies independently; never combine different currencies.
  const nowSeconds = Math.floor(now / 1000);
  const eligible = (Array.isArray(credits) ? credits : [])
    .filter(credit => isCurrentCredit(credit, nowSeconds) && isBedrockCredit(credit));
  const totals = new Map();
  const expirations = eligible
    .map(credit => credit.endDate)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  for (const credit of eligible) {
    const initial = money(credit.initialAmount);
    const remaining = money(credit.remainingAmount);
    if (!initial || !remaining || initial.currency !== remaining.currency) continue;
    const total = totals.get(remaining.currency) || { initial: 0, remaining: 0, count: 0 };
    total.initial += initial.amount;
    total.remaining += Math.max(0, remaining.amount);
    total.count += 1;
    totals.set(remaining.currency, total);
  }

  return {
    eligibleCount: eligible.length,
    nextExpiration: expirations[0] || null,
    balances: [...totals].map(([currency, values]) => ({ currency, ...values }))
  };
}

function friendlyAwsError(error) {
  const message = `${error?.stderr || ''} ${error?.message || ''}`;
  if (/Unable to locate credentials|NoCredentialProviders/i.test(message)) {
    return { detail: 'AWS not configured', sub: 'Choose a configured AWS profile' };
  }
  if (/expired|ExpiredToken|SSO session|login_session/i.test(message)) {
    return { detail: 'AWS sign-in expired', sub: 'Run aws login, then refresh' };
  }
  if (/AccessDenied|not authorized|Unauthorized/i.test(message)) {
    return { detail: 'Billing access denied', sub: 'Allow sts:GetCallerIdentity + billing:GetCredits' };
  }
  if (/Could not connect|Connection refused|Name or service|timed out|ETIMEDOUT/i.test(message)) {
    return { detail: 'AWS unavailable', sub: 'Check your connection and retry' };
  }
  return { detail: 'AWS query failed', sub: 'Check AWS CLI configuration' };
}

async function fetchBedrockCredits(cfg = {}, dependencies = {}) {
  const result = baseResult(cfg);
  const timeoutMs = cfg.timeoutMs || DEFAULT_TIMEOUT_MS;
  const awsCliPath = dependencies.awsCliPath || findAwsCli();
  const injectedRunner = dependencies.runCommand;

  if (!awsCliPath && !injectedRunner) {
    return { ...result, status: 'error', detail: 'AWS CLI not found', sub: 'Install AWS CLI v2' };
  }

  const runCommand = injectedRunner || (args => runAwsCli(awsCliPath, args, cfg.awsProfile, timeoutMs));

  try {
    // An explicit account ID avoids the extra STS request; otherwise discover it.
    let accountId = cfg.accountId;
    if (accountId && !/^\d{12}$/.test(accountId)) {
      return { ...result, status: 'error', detail: 'Invalid account ID', sub: 'Use a 12-digit AWS account ID' };
    }

    if (!accountId) {
      const identity = JSON.parse(await runCommand(['sts', 'get-caller-identity']));
      accountId = identity.Account;
    }

    const now = dependencies.now || Date.now();
    const startDate = Math.floor(now / 1000) - (364 * 24 * 60 * 60);
    const args = ['billing', 'get-credits', '--account-id', accountId, '--start-date', String(startDate)];
    if (cfg.payerAccountFlag) args.push('--payer-account-flag');
    const response = JSON.parse(await runCommand(args));
    const summary = summarizeBedrockCredits(response.credits, now);

    if (summary.balances.length === 0) {
      return {
        ...result,
        status: 'ok',
        detail: 'No credits',
        sub: 'No active Bedrock-eligible credits',
        percent: null,
        eligibleCount: 0
      };
    }

    if (summary.balances.length > 1) {
      return {
        ...result,
        status: 'warning',
        detail: 'Multiple currencies',
        sub: `${summary.eligibleCount} Bedrock-eligible credits`,
        percent: null,
        eligibleCount: summary.eligibleCount,
        balances: summary.balances
      };
    }

    const balance = summary.balances[0];
    const used = Math.max(0, balance.initial - balance.remaining);
    const percent = balance.initial > 0
      ? Math.round((balance.remaining / balance.initial) * 100)
      : null;
    const warningAt = typeof cfg.lowBalanceWarning === 'number' ? cfg.lowBalanceWarning : 10;

    return {
      ...result,
      status: balance.remaining <= warningAt ? 'warning' : 'ok',
      balance: balance.remaining,
      currency: balance.currency,
      detail: `${formatMoney(balance.remaining, balance.currency)} credits`,
      sub: `Used ${formatMoney(used, balance.currency)} / ${formatMoney(balance.initial, balance.currency)} · ${summary.eligibleCount} credits`,
      percent,
      eligibleCount: summary.eligibleCount,
      expires: summary.nextExpiration
        ? new Date(summary.nextExpiration * 1000).toISOString().slice(0, 10)
        : null
    };
  } catch (error) {
    return { ...result, status: 'error', ...friendlyAwsError(error) };
  }
}

module.exports = {
  fetchBedrockCredits,
  findAwsCli,
  summarizeBedrockCredits
};
