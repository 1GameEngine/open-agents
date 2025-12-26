import type { ModelMessage, JSONValue } from "ai";

/**
 * Adds cache control to the last message in the array for optimal Anthropic cache hits.
 *
 * Per Anthropic's docs: "Mark the final block of the final message with cache_control
 * so the conversation can be incrementally cached. The system will automatically
 * lookup and use the longest previously cached sequence of blocks (up to 20 blocks)."
 *
 * This means you only need to mark the last message - not every message.
 *
 * @example
 * ```ts
 * prepareStep: ({ messages, ...rest }) => ({
 *   ...rest,
 *   messages: addCacheControlToMessages(messages),
 * }),
 * ```
 */
export function addCacheControlToMessages(
  messages: ModelMessage[],
  providerOptions: Record<string, Record<string, JSONValue>> = {
    anthropic: { cacheControl: { type: "ephemeral" } },
  },
): ModelMessage[] {
  if (messages.length === 0) return messages;

  return messages.map((message, index) => {
    if (index === messages.length - 1) {
      return {
        ...message,
        providerOptions: {
          ...message.providerOptions,
          ...providerOptions,
        },
      };
    }
    return message;
  });
}
