import type { Result } from "@/shared/response/result";

/**
 * Strategy contract for notification delivery channels.
 *
 * Each channel type (EMAIL, TELEGRAM, APP) implements this interface
 * as an independent @Injectable() class. The dispatch service holds
 * a registry keyed by `channelType` and delegates delivery to the
 * resolved adapter.
 *
 * Adding a new channel requires:
 * 1. A new class implementing this interface
 * 2. One registration line in NotificationDispatchService's registry
 *
 * No existing channel code is modified when adding channels.
 */
export interface INotificationChannel {
  /** Discriminant used as the registry key in the dispatch service. */
  readonly channelType: "EMAIL" | "TELEGRAM" | "APP";

  /**
   * Deliver a notification via this channel.
   *
   * Channels never throw — failures are returned as Result values.
   * The `config` parameter contains raw provider settings from
   * `channel_configs.config_json`; each channel parses what it needs.
   *
   * @param recipient - Destination address (email, chat ID, or user ID)
   * @param payload - Notification template data
   * @param config - Channel-specific provider configuration
   * @returns OkResult on successful delivery, or FailResult on failure
   */
  send(
    recipient: string,
    payload: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Result<void>>;
}
