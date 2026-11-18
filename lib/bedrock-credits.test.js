const assert = require('assert/strict');
const { test } = require('node:test');
const { fetchBedrockCredits, summarizeBedrockCredits } = require('./bedrock-credits');

const now = Date.UTC(2026, 10, 19, 12, 0, 0);
const nowSeconds = now / 1000;

function credit(overrides = {}) {
  return {
    creditStatus: 'ENABLED',
    startDate: nowSeconds - 1000,
    endDate: nowSeconds + 100000,
    applicableProductNames: ['Amazon Bedrock'],
    initialAmount: { currencyAmount: '100.00', currencyCode: 'USD' },
    remainingAmount: { currencyAmount: '75.00', currencyCode: 'USD' },
    ...overrides
  };
}

test('summarizes only active credits that explicitly include Bedrock', () => {
  const result = summarizeBedrockCredits([
    credit(),
    credit({
      initialAmount: { currencyAmount: '50.00', currencyCode: 'USD' },
      remainingAmount: { currencyAmount: '25.00', currencyCode: 'USD' }
    }),
    credit({ applicableProductNames: ['Amazon EC2'] }),
    credit({ creditStatus: 'DISABLED' }),
    credit({ startDate: nowSeconds + 1000 }),
    credit({ endDate: nowSeconds - 1 }),
    credit({ applicableProductNames: [] })
  ], now);

  assert.equal(result.eligibleCount, 2);
  assert.deepEqual(result.balances, [{
    currency: 'USD',
    initial: 150,
    remaining: 100,
    count: 2
  }]);
});

test('formats live Bedrock balances without requesting Cost Explorer', async () => {
  const calls = [];
  const result = await fetchBedrockCredits({ awsProfile: 'dev', lowBalanceWarning: 10 }, {
    now,
    runCommand: async args => {
      calls.push(args);
      return args[0] === 'sts'
        ? JSON.stringify({ Account: '123456789012' })
        : JSON.stringify({ credits: [credit()] });
    }
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.detail, '$75.00 credits');
  assert.equal(result.sub, 'Used $25.00 / $100.00 · 1 credits');
  assert.equal(result.percent, 75);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], 'billing');
  assert.equal(calls[1][1], 'get-credits');
});

test('includes the configured console URL and next expiration in the menu result', async () => {
  const consoleUrl = 'https://example.aws.amazon.com/costmanagement/home#/credits';
  const result = await fetchBedrockCredits({ accountId: '123456789012', consoleUrl }, {
    now,
    runCommand: async () => JSON.stringify({ credits: [credit()] })
  });

  assert.equal(result.url, consoleUrl);
  assert.equal(result.expires, new Date((nowSeconds + 100000) * 1000).toISOString().slice(0, 10));
});

test('shows no credits instead of an invented balance', async () => {
  const result = await fetchBedrockCredits({}, {
    now,
    runCommand: async () => JSON.stringify({ Account: '123456789012', credits: [] })
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.detail, 'No credits');
  assert.equal(result.percent, null);
});

test('supports a supplied account ID and payer-level reads', async () => {
  const calls = [];
  await fetchBedrockCredits({ accountId: '123456789012', payerAccountFlag: true }, {
    now,
    runCommand: async args => {
      calls.push(args);
      return JSON.stringify({ credits: [] });
    }
  });

  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('--account-id'));
  assert.ok(calls[0].includes('--payer-account-flag'));
});

test('warns at the configured low-balance threshold', async () => {
  const result = await fetchBedrockCredits({ lowBalanceWarning: 80 }, {
    now,
    runCommand: async args => JSON.stringify(args[0] === 'sts'
      ? { Account: '123456789012' }
      : { credits: [credit()] })
  });
  assert.equal(result.status, 'warning');
});

test('does not combine balances in different currencies', async () => {
  const result = await fetchBedrockCredits({}, {
    now,
    runCommand: async args => JSON.stringify(args[0] === 'sts'
      ? { Account: '123456789012' }
      : {
          credits: [
            credit(),
            credit({
              initialAmount: { currencyAmount: '200.00', currencyCode: 'EUR' },
              remainingAmount: { currencyAmount: '150.00', currencyCode: 'EUR' }
            })
          ]
        })
  });
  assert.equal(result.detail, 'Multiple currencies');
  assert.equal(result.balances.length, 2);
});

test('surfaces missing credentials without leaking command output', async () => {
  const result = await fetchBedrockCredits({}, {
    now,
    runCommand: async () => {
      throw new Error('Unable to locate credentials');
    }
  });
  assert.equal(result.status, 'error');
  assert.equal(result.detail, 'AWS not configured');
});

test('surfaces billing permission errors', async () => {
  const result = await fetchBedrockCredits({}, {
    now,
    runCommand: async () => {
      throw new Error('An error occurred (AccessDeniedException) when calling GetCredits');
    }
  });
  assert.equal(result.status, 'error');
  assert.equal(result.detail, 'Billing access denied');
  assert.match(result.sub, /billing:GetCredits/);
});
