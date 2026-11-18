// Warnings still represent a valid balance; errors and unconfigured entries do not.
function isHealthyProvider(item) {
  return Boolean(item) && (item.status === 'ok' || item.status === 'warning');
}

function getTickerItems(items) {
  // Keep the ticker useful without hiding errors from the full dropdown menu.
  const healthyItems = (Array.isArray(items) ? items : []).filter(isHealthyProvider);
  return healthyItems.length > 0
    ? healthyItems
    : [{ name: 'API Monitor', detail: 'No active providers', id: 'openai' }];
}

module.exports = { getTickerItems, isHealthyProvider };
