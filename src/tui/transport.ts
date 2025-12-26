import { type ChatTransport, convertToModelMessages, smoothStream } from "ai";
import type { TUIAgent, TUIAgentCallOptions, TUIAgentUIMessage } from "./types";

export type AgentTransportOptions = {
  agent: TUIAgent;
  agentOptions: TUIAgentCallOptions;
};

export function createAgentTransport({
  agent,
  agentOptions,
}: AgentTransportOptions): ChatTransport<TUIAgentUIMessage> {
  return {
    sendMessages: async ({ messages, abortSignal }) => {
      const modelMessages = await convertToModelMessages(messages);

      const result = await agent.stream({
        messages: modelMessages,
        options: agentOptions,
        abortSignal: abortSignal ?? undefined,
        experimental_transform: smoothStream(),
      });

      return result.toUIMessageStream();
    },

    reconnectToStream: async () => {
      // Not supported for local agent calls
      return null;
    },
  };
}
