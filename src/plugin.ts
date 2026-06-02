import type {
  EmailAfterSendEvent,
  EmailDeliverEvent,
  PluginContext,
  SandboxedPlugin,
} from "emdash/plugin";

// ── Types ────────────────────────────────────────────────────────────────────
interface BlockInteraction {
  type: "page_load" | "block_action" | "form_submit";
  page?: string;
  action_id?: string;
  values?: Record<string, unknown>;
}

interface CFEmailPayload {
  to: string;
  from: string | { address: string; name: string };
  subject: string;
  text: string;
  html?: string;
  reply_to?: string;
}

interface CFEmailResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
  result: {
    delivered: string[];
    permanent_bounces: string[];
    queued: string[];
  } | null;
}

// ── Sentinel for secret fields ───────────────────────────────────────────────
const SECRET_SENTINEL = "••••••••";

// ── REST API transport ───────────────────────────────────────────────────────
async function sendViaCFEmailREST(
  ctx: PluginContext,
  accountId: string,
  apiToken: string,
  payload: CFEmailPayload,
): Promise<CFEmailResponse> {
  if (!ctx.http) throw new Error("network:request capability not available.");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

  const response = await ctx.http.fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as CFEmailResponse;

  if (!data.success) {
    const errMsg = data.errors?.map(e => `${e.code}: ${e.message}`).join("; ") ?? "Unknown error";
    throw new Error(`[emdash-cf-email-sending] Cloudflare API error: ${errMsg}`);
  }

  return data;
}

// ── Settings helpers ─────────────────────────────────────────────────────────
async function loadSettings(ctx: PluginContext) {
  const [cfApiToken, cfAccountId, fromAddress, fromName, replyTo] =
    await Promise.all([
      ctx.kv.get<string>("settings:cf_api_token"),
      ctx.kv.get<string>("settings:cf_account_id"),
      ctx.kv.get<string>("settings:from_address"),
      ctx.kv.get<string>("settings:from_name"),
      ctx.kv.get<string>("settings:reply_to"),
    ]);
  return { cfApiToken, cfAccountId, fromAddress, fromName, replyTo };
}

function buildFromField(
  address: string,
  name?: string | null,
): string | { address: string; name: string } {
  return name ? { address, name } : address;
}

// ── Block Kit settings page ──────────────────────────────────────────────────
async function renderSettings(ctx: PluginContext) {
  const { cfApiToken, cfAccountId, fromAddress, fromName, replyTo } =
    await loadSettings(ctx);

  return {
    blocks: [
      { type: "header", text: "Cloudflare Email Sending — Settings" },
      {
        type: "section",
        text: "Connect to Cloudflare Email Service using the REST API. You need a Cloudflare API token with email sending permission and your account ID.",
      },
      {
        type: "form",
        block_id: "cf-email-settings",
        fields: [
          {
            type: "secret_input",
            action_id: "cf_api_token",
            label: "Cloudflare API token",
            hint: "A token with email sending permission. Leave blank to keep the existing value.",
            initial_value: cfApiToken ? SECRET_SENTINEL : "",
          },
          {
            type: "secret_input",
            action_id: "cf_account_id",
            label: "Cloudflare account ID",
            hint: "Found in your Cloudflare dashboard under Account ID.",
            initial_value: cfAccountId ? SECRET_SENTINEL : "",
          },
          {
            type: "text_input",
            action_id: "from_address",
            label: "From address",
            placeholder: "noreply@yourdomain.com",
            hint: "Must be a verified sender on your Cloudflare account.",
            initial_value: fromAddress ?? "",
          },
          {
            type: "text_input",
            action_id: "from_name",
            label: "Display name",
            placeholder: "My Site",
            hint: "Optional. Shown as the sender name in email clients.",
            initial_value: fromName ?? "",
          },
          {
            type: "text_input",
            action_id: "reply_to",
            label: "Reply-To address",
            placeholder: "support@yourdomain.com",
            hint: "Optional. Where replies will be directed.",
            initial_value: replyTo ?? "",
          },
        ],
        submit: { label: "Save", action_id: "save" },
      },
      { type: "divider" },
      { type: "header", text: "Send Test Email" },
      {
        type: "section",
        text: "Use this form to send a test email and verify that your credentials and domains are configured properly.",
      },
      {
        type: "form",
        block_id: "cf-email-test",
        fields: [
          {
            type: "text_input",
            action_id: "to",
            label: "Recipient email address",
            placeholder: "you@example.com",
            hint: "The email address to send the test message to.",
            initial_value: "",
          },
        ],
        submit: { label: "Send Test Email", action_id: "send-test" },
      },
    ],
  };
}

async function saveSettings(
  ctx: PluginContext,
  values: Record<string, unknown>,
) {
  // Secret fields: only overwrite if the user entered a real value (not the sentinel or empty)
  for (const key of ["cf_api_token", "cf_account_id"] as const) {
    const val = values[key];
    if (typeof val === "string" && val.length > 0 && val !== SECRET_SENTINEL) {
      await ctx.kv.set(`settings:${key}`, val);
    }
  }

  // Non-secret fields: always write (empty string clears the value)
  for (const key of ["from_address", "from_name", "reply_to"] as const) {
    const val = values[key];
    if (typeof val === "string") {
      if (val.length > 0) {
        await ctx.kv.set(`settings:${key}`, val);
      } else {
        await ctx.kv.delete(`settings:${key}`);
      }
    }
  }
}

// ── Plugin export ────────────────────────────────────────────────────────────
export default {
  hooks: {
    "email:deliver": {
      exclusive: true,
      handler: async (event: EmailDeliverEvent, ctx: PluginContext) => {
        const { cfApiToken, cfAccountId, fromAddress, fromName, replyTo } =
          await loadSettings(ctx);

        if (!cfApiToken || !cfAccountId) {
          throw new Error(
            '[emdash-cf-email-sending] Cloudflare API credentials not configured. ' +
            'Go to the plugin settings page and enter your API token and account ID.',
          );
        }
        if (!fromAddress) {
          throw new Error(
            '[emdash-cf-email-sending] "From address" not configured. ' +
            'Go to the plugin settings page and enter a verified sender address.',
          );
        }

        const payload: CFEmailPayload = {
          to: event.message.to,
          from: buildFromField(fromAddress, fromName),
          subject: event.message.subject,
          text: event.message.text,
          ...(event.message.html ? { html: event.message.html } : {}),
          ...(replyTo ? { reply_to: replyTo } : {}),
        };

        await sendViaCFEmailREST(ctx, cfAccountId, cfApiToken, payload);
      },
    },

    // Fire-and-forget audit log
    "email:afterSend": async (event: EmailAfterSendEvent, ctx: PluginContext) => {
      await ctx.kv.set(`state:log:${Date.now()}`, {
        to: event.message.to,
        subject: event.message.subject,
        sentAt: new Date().toISOString(),
      });
    },
  },

  routes: {
    admin: {
      handler: async (routeCtx, ctx) => {
        const interaction = routeCtx.input as BlockInteraction;

        if (interaction.type === "page_load") {
          return renderSettings(ctx);
        }

        if (
          interaction.type === "form_submit" &&
          interaction.action_id === "save"
        ) {
          await saveSettings(ctx, interaction.values ?? {});
          return {
            ...(await renderSettings(ctx)),
            toast: { message: "Settings saved.", type: "success" },
          };
        }

        if (
          interaction.type === "form_submit" &&
          interaction.action_id === "send-test"
        ) {
          const to = interaction.values?.to as string;
          if (!to) {
            return {
              ...(await renderSettings(ctx)),
              toast: { message: "Recipient email is required.", type: "error" },
            };
          }

          const { cfApiToken, cfAccountId, fromAddress, fromName, replyTo } =
            await loadSettings(ctx);

          if (!cfApiToken || !cfAccountId || !fromAddress) {
            return {
              ...(await renderSettings(ctx)),
              toast: { message: "Plugin not fully configured. Save settings first.", type: "error" },
            };
          }

          try {
            await sendViaCFEmailREST(ctx, cfAccountId, cfApiToken, {
              to,
              from: buildFromField(fromAddress, fromName),
              subject: "EmDash — Test Email",
              text: "This is a test email sent from your EmDash CMS via Cloudflare Email Service.",
              html: "<h1>Test Email</h1><p>This is a test email sent from your EmDash CMS via Cloudflare Email Service.</p>",
              ...(replyTo ? { reply_to: replyTo } : {}),
            });
            return {
              ...(await renderSettings(ctx)),
              toast: { message: `Test email sent to ${to}.`, type: "success" },
            };
          } catch (e: any) {
            return {
              ...(await renderSettings(ctx)),
              toast: { message: e.message || "Failed to send test email.", type: "error" },
            };
          }
        }

        return { blocks: [] };
      },
    },

    "send-test": {
      handler: async (routeCtx, ctx) => {
        const { to } = routeCtx.input as { to: string };
        if (!to) throw new Error("Recipient email address is required.");

        const { cfApiToken, cfAccountId, fromAddress, fromName, replyTo } =
          await loadSettings(ctx);

        if (!cfApiToken || !cfAccountId || !fromAddress) {
          throw new Error("Plugin not fully configured. Save settings first.");
        }

        const result = await sendViaCFEmailREST(ctx, cfAccountId, cfApiToken, {
          to,
          from: buildFromField(fromAddress, fromName),
          subject: "EmDash — Test Email",
          text: "This is a test email sent from your EmDash CMS via Cloudflare Email Service.",
          html: "<h1>Test Email</h1><p>This is a test email sent from your EmDash CMS via Cloudflare Email Service.</p>",
          ...(replyTo ? { reply_to: replyTo } : {}),
        });

        return { success: true, result };
      },
    },
  },
} satisfies SandboxedPlugin;
