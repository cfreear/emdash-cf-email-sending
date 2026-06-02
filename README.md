# Cloudflare Email Sending Plugin

A sandboxed plugin for [EmDash CMS](https://emdashcms.com) to send transactional emails via the Cloudflare Email Service REST API.

## Prerequisites and Setup

Before configuring this plugin in EmDash, you need to set up Cloudflare Email Routing and generate an API token on your Cloudflare account.

### 1. Cloudflare Configuration

1. **Enable Email Routing**: Set up Email Routing for your domain in the Cloudflare Dashboard under **Websites** -> **[Your Domain]** -> **Email** -> **Email Routing**. Ensure the domain's DNS records are properly configured (Cloudflare can do this automatically).
2. **Retrieve Account ID**: Go to your domain settings page in Cloudflare. Scroll down to the **API** section on the right side of the dashboard, and copy your **Account ID**.
3. **Generate API Token**:
   - Go to your **Profile** (top right) -> **My Profile** -> **API Tokens** -> **Create Token**.
   - Select **Create Custom Token**.
   - Name your token (e.g., `EmDash Email Sending`).
   - Under **Permissions**, select:
     - **Account** | **Email Sending** | **Edit**
   - Click **Continue to summary** and then **Create Token**.
   - Copy the API token and keep it in a safe place.
4. **Verified Sender**: Ensure the email address you plan to use as the **From address** is configured and verified in Cloudflare Email Routing.

### 2. EmDash Settings

1. Log in to your EmDash CMS Admin Dashboard.
2. In the sidebar, navigate to **Plugins** -> **Cloudflare Email Sending** -> **Settings**.
3. Fill in the configuration:
   - **Cloudflare API Token**: Paste the token generated in the step above.
   - **Cloudflare Account ID**: Paste your Account ID.
   - **From address**: Enter the verified sender email address (e.g., `noreply@yourdomain.com`).
   - **Display name** (Optional): Set a friendly name (e.g., `My Site Admin`).
   - **Reply-To address** (Optional): Specify where user replies should go.
4. Click **Save**.

### 3. Verify Configuration

You can use the **Send Test Email** form directly below the settings on the configuration page:
- Enter a recipient email address.
- Click **Send Test Email**.
- Verify that a test email arrives and check the toast message for success or error.

---

## Develop

To work on this plugin locally:

```sh
npm install
npm run typecheck
npm run test
```

To test against a running EmDash site, run `npm run dev` in this directory (which rebuilds on save) and link it in your EmDash site:
`npm install file:../path/to/this`

Then, in your EmDash site configuration:
```typescript
import emdashCfEmailSending from "emdash-cf-email-sending";
import { emdash } from "emdash";

export default emdash({
  sandboxed: [emdashCfEmailSending],
});
```

## Publish

```sh
npx emdash-plugin login        # if you're not already logged in
npx emdash-plugin bundle       # produces dist/emdash-cf-email-sending-<version>.tar.gz
# upload that tarball to a public URL, then:
npx emdash-plugin publish --url https://your-host/...
```

## Version Bumps

Bump `version` in `package.json` when you ship a release. The scaffold's `emdash-plugin.jsonc` deliberately omits `version` — the build pipeline reads it from `package.json` so there's a single source of truth.

- **Bump major** for breaking changes.
- **Bump minor** for new routes, capabilities, or hooks.
- **Bump patch** for bug fixes.

*Note: You MUST bump the version whenever you change `capabilities`, `allowedHosts`, or `storage` in `emdash-plugin.jsonc` because installed users have consented to the old trust contract.*
