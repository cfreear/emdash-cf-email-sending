import * as emdash_plugin0 from "emdash/plugin";
import { EmailAfterSendEvent, EmailDeliverEvent, PluginContext } from "emdash/plugin";

//#region node_modules/@emdash-cms/plugin-types/dist/index.d.ts
/**
 * Per-collection storage config in a plugin manifest.
 *
 * Each collection declares the indexes the host should create. Single-string
 * entries index a single field; nested arrays request composite indexes
 * (multi-column). `uniqueIndexes` carries the same shape but with a UNIQUE
 * constraint -- those entries are already queryable, no need to duplicate
 * them in `indexes`.
 *
 * Core has a stricter `StorageCollectionConfig` interface for runtime use;
 * this is the manifest-wire shape both sides agree on.
 */
interface StorageCollectionConfig {
  /**
   * Indexes to create. Each entry is either a single field name or an
   * array of field names for a composite index.
   */
  indexes: Array<string | string[]>;
  /**
   * Fields with unique constraints. Same shape as `indexes`. Unique
   * indexes are also queryable, so don't duplicate them in `indexes`.
   */
  uniqueIndexes?: Array<string | string[]>;
}
/**
 * Plugin storage declaration. Maps a collection name to its index config.
 */
type PluginStorageConfig = Record<string, StorageCollectionConfig>;
/**
 * Plugin admin surface in the manifest. Sandboxed plugins MUST NOT set the
 * `entry` field (that requires native/trusted mode); the bundler validates
 * its absence.
 */
//#endregion
//#region src/plugin.d.ts
interface CFEmailResponse {
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
  messages: unknown[];
  result: {
    delivered: string[];
    permanent_bounces: string[];
    queued: string[];
  } | null;
}
declare const _default: {
  hooks: {
    "email:deliver": {
      exclusive: true;
      handler: (event: EmailDeliverEvent, ctx: PluginContext) => Promise<void>;
    };
    "email:afterSend": (event: EmailAfterSendEvent, ctx: PluginContext) => Promise<void>;
  };
  routes: {
    admin: {
      handler: (routeCtx: emdash_plugin0.SandboxedRouteContext, ctx: PluginContext<PluginStorageConfig>) => Promise<{
        blocks: ({
          type: string;
          text: string;
          block_id?: undefined;
          fields?: undefined;
          submit?: undefined;
        } | {
          type: string;
          block_id: string;
          fields: ({
            type: string;
            action_id: string;
            label: string;
            hint: string;
            initial_value: string;
            placeholder?: undefined;
          } | {
            type: string;
            action_id: string;
            label: string;
            placeholder: string;
            hint: string;
            initial_value: string;
          })[];
          submit: {
            label: string;
            action_id: string;
          };
          text?: undefined;
        } | {
          type: string;
          text?: undefined;
          block_id?: undefined;
          fields?: undefined;
          submit?: undefined;
        })[];
      } | {
        toast: {
          message: any;
          type: string;
        };
        blocks: ({
          type: string;
          text: string;
          block_id?: undefined;
          fields?: undefined;
          submit?: undefined;
        } | {
          type: string;
          block_id: string;
          fields: ({
            type: string;
            action_id: string;
            label: string;
            hint: string;
            initial_value: string;
            placeholder?: undefined;
          } | {
            type: string;
            action_id: string;
            label: string;
            placeholder: string;
            hint: string;
            initial_value: string;
          })[];
          submit: {
            label: string;
            action_id: string;
          };
          text?: undefined;
        } | {
          type: string;
          text?: undefined;
          block_id?: undefined;
          fields?: undefined;
          submit?: undefined;
        })[];
      }>;
    };
    "send-test": {
      handler: (routeCtx: emdash_plugin0.SandboxedRouteContext, ctx: PluginContext<PluginStorageConfig>) => Promise<{
        success: boolean;
        result: CFEmailResponse;
      }>;
    };
  };
};
//#endregion
export { _default as default };