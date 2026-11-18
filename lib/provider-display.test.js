const assert = require('assert/strict');
const { test } = require('node:test');
const { getTickerItems } = require('./provider-display');

const providers = [
  { id: 'openrouter', status: 'error', detail: 'Error' },
  { id: 'deepseek', status: 'unset', detail: 'Unset' },
  { id: 'openai', status: 'unset', detail: 'Unset' },
  { id: 'grok', status: 'unset', detail: 'Unset' },
  { id: 'anthropic', status: 'unset', detail: 'Unset' },
  { id: 'googlecloud', status: 'ok', balance: 240, detail: '$240.00 credits' },
  { id: 'bedrock', status: 'ok', balance: 120, detail: '$120.00 credits' }
];

test('ticker excludes errors and unconfigured providers but retains the full dropdown list', () => {
  assert.deepEqual(
    getTickerItems(providers).map(provider => provider.id),
    ['googlecloud', 'bedrock']
  );
  assert.equal(providers.length, 7);
});

test('ticker retains a low-balance warning and a healthy zero balance', () => {
  assert.deepEqual(
    getTickerItems([
      { id: 'openrouter', status: 'warning', balance: 0.5 },
      { id: 'deepseek', status: 'ok', balance: 0 },
      { id: 'openai', status: 'error' }
    ]).map(provider => provider.id),
    ['openrouter', 'deepseek']
  );
});

test('ticker shows a neutral fallback instead of an error when no provider is healthy', () => {
  const ticker = getTickerItems([
    { id: 'openrouter', status: 'error' },
    { id: 'bedrock', status: 'error' },
    null
  ]);
  assert.equal(ticker.length, 1);
  assert.equal(ticker[0].detail, 'No active providers');
});
