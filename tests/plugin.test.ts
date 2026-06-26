import { describe, expect, it, vi } from "vitest";
import plugin from "../src/plugin.js";

// Helper to construct a mocked PluginContext with stateful KV and mocked fetch
function makeTestContext(options?: {
  kvData?: Record<string, any>;
  fetchResponse?: any;
  fetchStatus?: number;
}) {
  const kvStore = new Map<string, any>(Object.entries(options?.kvData || {}));
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const status = options?.fetchStatus ?? 200;
    const body = options?.fetchResponse ?? {
      success: true,
      errors: [],
      messages: [],
      result: {
        delivered: ["recipient@example.com"],
        permanent_bounces: [],
        queued: [],
      },
    };
    return {
      status,
      json: async () => body,
    } as Response;
  });

  const ctx = {
    plugin: { id: "emdash-cf-email-sending", version: "0.1.0" },
    kv: {
      get: async (key: string) => kvStore.get(key) ?? null,
      set: async (key: string, value: any) => {
        kvStore.set(key, value);
      },
      delete: async (key: string) => kvStore.delete(key),
      list: async (prefix?: string) => {
        const result: Array<{ key: string; value: any }> = [];
        for (const [k, v] of kvStore.entries()) {
          if (!prefix || k.startsWith(prefix)) {
            result.push({ key: k, value: v });
          }
        }
        return result;
      },
    },
    http: {
      fetch: fetchMock,
    },
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    site: {
      name: "Test Site",
      url: "https://testsite.com",
      locale: "en",
    },
    url: (path: string) => `https://testsite.com${path}`,
  } as any;

  return { ctx, fetchMock, kvStore };
}

describe("Cloudflare Email Sending Plugin", () => {
  describe("email:deliver hook", () => {
    const deliverHandler = plugin.hooks?.["email:deliver"];

    it("should deliver email successfully using REST API", async () => {
      const { ctx, fetchMock } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "valid_token",
          "settings:cf_account_id": "valid_account",
          "settings:from_address": "sender@domain.com",
        },
      });

      if (!deliverHandler || typeof deliverHandler !== "object") {
        throw new Error("deliverHandler must be an object configuration");
      }

      await deliverHandler.handler(
        {
          message: {
            to: "recipient@example.com",
            subject: "Hello World",
            text: "This is test body",
            html: "<h1>This is test body</h1>",
          },
          source: "system",
        },
        ctx,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/valid_account/email/sending/send");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        "Authorization": "Bearer valid_token",
        "Content-Type": "application/json",
      });
      const body = JSON.parse(init?.body as string);
      expect(body).toEqual({
        to: "recipient@example.com",
        from: "sender@domain.com",
        subject: "Hello World",
        text: "This is test body",
        html: "<h1>This is test body</h1>",
      });
    });

    it("should handle from_name as object", async () => {
      const { ctx, fetchMock } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "valid_token",
          "settings:cf_account_id": "valid_account",
          "settings:from_address": "sender@domain.com",
          "settings:from_name": "My Brand Name",
        },
      });

      if (!deliverHandler || typeof deliverHandler !== "object") {
        throw new Error("deliverHandler must be an object configuration");
      }

      await deliverHandler.handler(
        {
          message: {
            to: "recipient@example.com",
            subject: "Hello",
            text: "Hi",
          },
          source: "system",
        },
        ctx,
      );

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init?.body as string);
      expect(body.from).toEqual({
        address: "sender@domain.com",
        name: "My Brand Name",
      });
    });

    it("should forward reply_to if configured", async () => {
      const { ctx, fetchMock } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "valid_token",
          "settings:cf_account_id": "valid_account",
          "settings:from_address": "sender@domain.com",
          "settings:reply_to": "reply@domain.com",
        },
      });

      if (!deliverHandler || typeof deliverHandler !== "object") {
        throw new Error("deliverHandler must be an object configuration");
      }

      await deliverHandler.handler(
        {
          message: {
            to: "recipient@example.com",
            subject: "Hello",
            text: "Hi",
          },
          source: "system",
        },
        ctx,
      );

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init?.body as string);
      expect(body.reply_to).toBe("reply@domain.com");
    });

    it("should throw error when credentials are not configured", async () => {
      const { ctx } = makeTestContext({
        kvData: {
          "settings:from_address": "sender@domain.com",
        },
      });

      if (!deliverHandler || typeof deliverHandler !== "object") {
        throw new Error("deliverHandler must be an object configuration");
      }

      await expect(
        deliverHandler.handler(
          {
            message: { to: "r@e.com", subject: "S", text: "T" },
            source: "system",
          },
          ctx,
        ),
      ).rejects.toThrow("Cloudflare API credentials not configured");
    });

    it("should throw error when from_address is not configured", async () => {
      const { ctx } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "token",
          "settings:cf_account_id": "account",
        },
      });

      if (!deliverHandler || typeof deliverHandler !== "object") {
        throw new Error("deliverHandler must be an object configuration");
      }

      await expect(
        deliverHandler.handler(
          {
            message: { to: "r@e.com", subject: "S", text: "T" },
            source: "system",
          },
          ctx,
        ),
      ).rejects.toThrow('"From address" not configured');
    });

    it("should throw error on Cloudflare API error", async () => {
      const { ctx } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "valid_token",
          "settings:cf_account_id": "valid_account",
          "settings:from_address": "sender@domain.com",
        },
        fetchResponse: {
          success: false,
          errors: [{ code: 10001, message: "Invalid email sending domain" }],
          messages: [],
          result: null,
        },
      });

      if (!deliverHandler || typeof deliverHandler !== "object") {
        throw new Error("deliverHandler must be an object configuration");
      }

      await expect(
        deliverHandler.handler(
          {
            message: { to: "recipient@example.com", subject: "Hello", text: "Hi" },
            source: "system",
          },
          ctx,
        ),
      ).rejects.toThrow("Cloudflare API error: 10001: Invalid email sending domain");
    });
  });

  describe("email:afterSend hook", () => {
    const afterSendHandler = plugin.hooks?.["email:afterSend"];

    it("should write audit log entry to KV", async () => {
      const { ctx, kvStore } = makeTestContext();

      if (typeof afterSendHandler !== "function") {
        throw new Error("afterSendHandler must be a function");
      }

      await afterSendHandler(
        {
          message: {
            to: "recipient@example.com",
            subject: "Audited Email",
            text: "Text",
          },
          source: "system",
        },
        ctx,
      );

      // Find the log key in KV
      const keys = Array.from(kvStore.keys());
      const logKey = keys.find(k => k.startsWith("state:log:"));
      expect(logKey).toBeDefined();

      const logEntry = kvStore.get(logKey!);
      expect(logEntry).toBeDefined();
      expect(logEntry.to).toBe("recipient@example.com");
      expect(logEntry.subject).toBe("Audited Email");
      expect(logEntry.sentAt).toBeDefined();
    });
  });

  describe("settings route", () => {
    const adminHandler = plugin.routes?.admin;

    it("should render settings and test form on page_load", async () => {
      const { ctx } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "my_secret_token",
          "settings:cf_account_id": "my_secret_id",
          "settings:from_address": "verified@domain.com",
        },
      });

      if (!adminHandler || typeof adminHandler !== "object" || !("handler" in adminHandler)) {
        throw new Error("admin handler not found");
      }

      const response = (await adminHandler.handler(
        {
          input: { type: "page_load", page: "/settings" },
          request: {} as any,
        },
        ctx,
      )) as any;

      expect(response.blocks).toBeDefined();
      expect(response.blocks).toHaveLength(7);

      const settingsForm = response.blocks.find((b: any) => b.type === "form" && b.block_id === "cf-email-settings");
      expect(settingsForm).toBeDefined();

      const apiTokenField = settingsForm.fields.find((f: any) => f.action_id === "cf_api_token");
      expect(apiTokenField.initial_value).toBe("••••••••"); // Sentinel

      const fromAddressField = settingsForm.fields.find((f: any) => f.action_id === "from_address");
      expect(fromAddressField.initial_value).toBe("verified@domain.com");

      const testForm = response.blocks.find((b: any) => b.type === "form" && b.block_id === "cf-email-test");
      expect(testForm).toBeDefined();
      expect(testForm.fields[0].action_id).toBe("to");
    });

    it("should save settings and handle secrets appropriately", async () => {
      const { ctx, kvStore } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "old_token",
          "settings:cf_account_id": "old_account",
          "settings:from_address": "old@domain.com",
        },
      });

      if (!adminHandler || typeof adminHandler !== "object" || !("handler" in adminHandler)) {
        throw new Error("admin handler not found");
      }

      const response = (await adminHandler.handler(
        {
          input: {
            type: "form_submit",
            action_id: "save",
            values: {
              cf_api_token: "••••••••", // Sentinel, should not save!
              cf_account_id: "new_account", // Changed, should save!
              from_address: "new@domain.com",
              from_name: "New Name",
              reply_to: "", // Cleared
            },
          },
          request: {} as any,
        },
        ctx,
      )) as any;

      expect(response.toast).toEqual({ message: "Settings saved.", type: "success" });
      expect(kvStore.get("settings:cf_api_token")).toBe("old_token"); // Unchanged
      expect(kvStore.get("settings:cf_account_id")).toBe("new_account"); // Updated
      expect(kvStore.get("settings:from_address")).toBe("new@domain.com"); // Updated
      expect(kvStore.get("settings:from_name")).toBe("New Name"); // Updated
      expect(kvStore.get("settings:reply_to")).toBeUndefined(); // Deleted/cleared
    });

    it("should handle send-test block action", async () => {
      const { ctx, fetchMock } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "my_token",
          "settings:cf_account_id": "my_account",
          "settings:from_address": "sender@domain.com",
        },
      });

      if (!adminHandler || typeof adminHandler !== "object" || !("handler" in adminHandler)) {
        throw new Error("admin handler not found");
      }

      const response = (await adminHandler.handler(
        {
          input: {
            type: "form_submit",
            action_id: "send-test",
            values: {
              to: "testrecipient@domain.com",
            },
          },
          request: {} as any,
        },
        ctx,
      )) as any;

      expect(response.toast.type).toBe("success");
      expect(response.toast.message).toContain("Test email sent to testrecipient@domain.com");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should handle send-test errors gracefully", async () => {
      const { ctx } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "my_token",
          "settings:cf_account_id": "my_account",
          "settings:from_address": "sender@domain.com",
        },
        fetchResponse: {
          success: false,
          errors: [{ code: 999, message: "REST API Failure" }],
          messages: [],
          result: null,
        },
      });

      if (!adminHandler || typeof adminHandler !== "object" || !("handler" in adminHandler)) {
        throw new Error("admin handler not found");
      }

      const response = (await adminHandler.handler(
        {
          input: {
            type: "form_submit",
            action_id: "send-test",
            values: {
              to: "testrecipient@domain.com",
            },
          },
          request: {} as any,
        },
        ctx,
      )) as any;

      expect(response.toast.type).toBe("error");
      expect(response.toast.message).toContain("Cloudflare API error: 999: REST API Failure");
    });
  });

  describe("send-test route", () => {
    const testRouteHandler = plugin.routes?.["send-test"];

    it("should send a test email via API route", async () => {
      const { ctx, fetchMock } = makeTestContext({
        kvData: {
          "settings:cf_api_token": "tok",
          "settings:cf_account_id": "acc",
          "settings:from_address": "verified@domain.com",
        },
      });

      if (!testRouteHandler || typeof testRouteHandler !== "object" || !("handler" in testRouteHandler)) {
        throw new Error("send-test route not found");
      }

      const response = (await testRouteHandler.handler(
        {
          input: { to: "recipient@domain.com" },
          request: {} as any,
        },
        ctx,
      )) as any;

      expect(response.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init?.body as string);
      expect(body.to).toBe("recipient@domain.com");
      expect(body.from).toBe("verified@domain.com");
    });

    it("should throw if plugin not configured", async () => {
      const { ctx } = makeTestContext();

      if (!testRouteHandler || typeof testRouteHandler !== "object" || !("handler" in testRouteHandler)) {
        throw new Error("send-test route not found");
      }

      await expect(
        testRouteHandler.handler(
          {
            input: { to: "recipient@domain.com" },
            request: {} as any,
          },
          ctx,
        ),
      ).rejects.toThrow("Plugin not fully configured. Save settings first.");
    });
  });
});
