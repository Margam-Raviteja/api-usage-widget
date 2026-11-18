# ⚡️ AI & Cloud API Usage Monitor for iOS

A high-performance, dark-themed iOS Home Screen widget built with **Scriptable** to monitor your API usage, token limits, and remaining prepaid credits across multiple providers in real-time.

---

## 🌟 Supported Providers

| Provider | What is Monitored | Key / Endpoint Needed |
| :--- | :--- | :--- |
| **OpenRouter** | Real-time dollar balance & total usage | OpenRouter API Key (`sk-or-v1-...`) |
| **DeepSeek** | Live USD/CNY balance & credit grants | DeepSeek API Key (`sk-...`) |
| **OpenAI** | Month-to-date spend (Admin key) or key health & budget | OpenAI Admin or Standard API Key |
| **Grok** | Active connection & model readiness (xAI) | Grok API Key (`xai-...`) |
| **Anthropic** | Model access, connection health & budget | Anthropic API Key (`sk-ant-...`) |
| **Google Cloud / Gemini** | Gemini 1.5/2.0 API quota & Cloud billing credits | Gemini API Key or Cloud budget endpoint |
| **Amazon Bedrock** (macOS only) | Active Bedrock-eligible AWS credit balances | Existing AWS CLI profile; no API key stored in the app |

---

## 📱 Widget Sizes & Features

1. **Medium Widget (Recommended for Home Screen)**:
   - Clean 2-column dashboard tracking all 6 providers simultaneously.
   - Shows provider status dot, balance/detail, and gauge bar.
2. **Large Widget**:
   - Detailed cards for each provider with SF Symbols, percentage indicators, and sub-details.
3. **Small Widget**:
   - Compact 2x2 widget displaying top 3 active providers.
4. **Smart Offline Resilience**:
   - Concurrently queries all APIs with strict 6s timeouts.
   - Automatically caches last successful responses to local storage (`api-usage-cache.json`) so your home screen widget never goes blank or times out.
5. **Zero Xcode or Developer Account Required**:
   - Runs natively on iOS using the free [Scriptable](https://apps.apple.com/app/scriptable/id1405454704) app.

---

## 🚀 Quick Setup (2 Minutes)

### Step 1: Install Scriptable on your iPhone / iPad
Download the free **[Scriptable app from the App Store](https://apps.apple.com/app/scriptable/id1405454704)**.

### Step 2: Copy the Script to your iPhone
Choose whichever method is easiest:

- **Option A (iCloud Drive - Recommended)**:
  1. If iCloud Drive is enabled for Scriptable, simply copy [`APIUsageMonitor.js`](file:///Users/raviteja/Developer/api-usage-widget/APIUsageMonitor.js) into your iCloud Drive folder under `Scriptable`.
  2. It will automatically show up inside the Scriptable app on your phone!

- **Option B (Copy & Paste / AirDrop)**:
  1. Open the Scriptable app on your iPhone.
  2. Tap the `+` button in the top right to create a new script.
  3. Rename it to `API Usage Monitor`.
  4. Paste the entire content of [`APIUsageMonitor.js`](file:///Users/raviteja/Developer/api-usage-widget/APIUsageMonitor.js).
  5. Tap Done.

---

## 🔑 Adding Your API Keys

You can add your keys in either of two ways:

### Method 1: Directly at the top of `APIUsageMonitor.js`
Open the script in Scriptable and enter your keys in the `DEFAULT_CONFIG` block at lines 30-75:
```javascript
openrouter: {
  enabled: true,
  apiKey: "sk-or-v1-...",
  name: "OpenRouter"
},
deepseek: {
  enabled: true,
  apiKey: "sk-...",
  name: "DeepSeek"
},
// ...
```

### Method 2: Via `api-usage-config.json`
Place an `api-usage-config.json` file in the Scriptable folder in the iOS Files app (a template `config.example.json` is provided in this repository).

---

## 🖥 Test on your Mac First!

You can verify all your API keys right now from your terminal before opening your phone:

```bash
cd /Users/raviteja/Developer/api-usage-widget
cp config.example.json config.json
# Add your keys to config.json
node test_runner.js
```

You will see an ASCII gauge table verifying each provider's status and latency!

---

## 💻 macOS Menu Bar Monitor

You can monitor your API usage directly in your Mac's top menu bar using either of the following two options:

### Option 1: Standalone Native macOS Menu Bar App (Zero-Install)
A compiled native Swift menu bar app is ready in the repository:
1. Launch the app directly from your terminal or Finder:
   ```bash
   open /Users/raviteja/Developer/api-usage-widget/macos-menubar/APIMenuBar.app
   ```
2. A `⚡️ API Monitor` icon will appear in your Mac's menu bar:
   - Click it to view real-time status and balances across all 6 providers.
   - Click any provider to open its web dashboard directly in your browser.
   - Auto-refreshes every 15 minutes, with instant **Refresh Now** and **Edit Config** buttons.

*(Optional)* To keep it running at Mac login:
- Go to **System Settings > General > Login Items & Extensions**, and add `APIMenuBar.app`.

### Option 2: SwiftBar / xbar Plugin
If you use [SwiftBar](https://swiftbar.app/) (`brew install --cask swiftbar`):
1. Copy or symlink the plugin into your SwiftBar plugins folder:
   ```bash
   ln -s /Users/raviteja/Developer/api-usage-widget/swiftbar/api-usage.15m.js ~/Library/Application\ Support/SwiftBar/Plugins/
   ```
2. SwiftBar will immediately render the live ticker and dropdown menu in your menu bar.

### Amazon Bedrock credits (macOS menu bar and terminal only)

This feature requires **AWS CLI v2** and an authenticated AWS profile. It uses your existing CLI credentials—do not add AWS access keys or secrets to `config.json`.

Enable it in your local, git-ignored `config.json`:

```json
"bedrock": {
  "enabled": true,
  "awsProfile": "default",
  "payerAccountFlag": false,
  "lowBalanceWarning": 10,
  "name": "Bedrock"
}
```

The app calls `sts:GetCallerIdentity` and `billing:GetCredits`, then includes only credits that are enabled, within their validity period, and explicitly list **Amazon Bedrock** in their applicable products. It displays **No credits** when there are no matching credits; it does not guess a balance from Bedrock usage or a manually configured budget.

- Replace `default` with your configured AWS profile name if needed.
- `accountId` is optional; normally the app discovers it using STS. If supplied, it must be a 12-digit account ID.
- `consoleUrl` is optional; set it to your account-specific AWS Credits console URL, or omit it to use the generic Credits page.
- Set `payerAccountFlag` to `true` only when the profile belongs to the management account and you want consolidated billing-family credits.
- If your role uses temporary credentials, renew its session as usual when it expires.
- The AWS principal needs read-only `sts:GetCallerIdentity` and `billing:GetCredits` permissions. No Cost Explorer calls or model invocations are made.

AWS may apply shared or broadly scoped credits differently from what a product-name filter indicates. The app intentionally reports only explicitly Bedrock-eligible credits and links to **AWS Billing and Cost Management → Credits** for the authoritative details.

**iOS limitation:** Scriptable cannot access your Mac's AWS CLI credentials, so the iOS widget does not include Bedrock. Keeping AWS credentials on the laptop avoids embedding long-lived AWS secrets in the widget.

Run the adapter tests with `node --test lib/bedrock-credits.test.js`.

---

## 📲 Adding the Widget to your Home Screen

1. On your iPhone home screen, long press any empty area until icons jiggle.
2. Tap `+` in the top left corner.
3. Search for **Scriptable**.
4. Choose **Medium** (or **Large** or **Small**) and tap **Add Widget**.
5. Tap the newly placed widget while in jiggle mode (or long-press > **Edit Widget**):
   - **Script**: Select `API Usage Monitor`
   - **When Interacting**: Run Script (or Open App)
   - **Parameter** (Optional): enter `medium`, `large`, or `small` to override default sizing.
6. Tap outside to save. Your widget will load and refresh automatically!

---

## 🛠 Configuration Reference

| Field | Type | Description |
| :--- | :--- | :--- |
| `theme` | string | `"dark"`, `"midnight"`, or `"dracula"` |
| `refreshMinutes` | number | Background refresh interval (default: `30`) |
| `timeoutMs` | number | HTTP timeout per provider in milliseconds (default: `6000`) |
| `openrouter.apiKey` | string | OpenRouter API Key |
| `deepseek.apiKey` | string | DeepSeek API Key |
| `openai.apiKey` | string | OpenAI API Key (`sk-admin-...` for costs, or standard key) |
| `openai.monthlyBudget` | number | Monthly target budget in USD (default: `50.0`) |
| `grok.apiKey` | string | Grok (xAI) API Key (`xai-...`) |
| `anthropic.apiKey` | string | Anthropic API Key |
| `googleCloud.geminiApiKey` | string | Google AI Studio Gemini API Key |
| `googleCloud.cloudCreditsTotal`| number | Total Cloud credits (e.g. `300.0` for trial) |
| `googleCloud.cloudCreditsRemaining`| number | Remaining Cloud credits balance |
| `bedrock.enabled` | boolean | Enable the macOS-only AWS Billing credits adapter (default: `false`) |
| `bedrock.awsProfile` | string | Existing AWS CLI profile to use (default: `default`) |
| `bedrock.accountId` | string | Optional 12-digit account ID; discovered through STS when omitted |
| `bedrock.consoleUrl` | string | Optional account-specific AWS Credits console URL for the dropdown link |
| `bedrock.payerAccountFlag` | boolean | Include consolidated billing-family credits when authorized (default: `false`) |
| `bedrock.lowBalanceWarning` | number | Remaining-credit threshold for a warning (default: `10`) |
