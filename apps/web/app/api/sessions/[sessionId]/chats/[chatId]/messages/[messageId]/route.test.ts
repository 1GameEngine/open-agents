import { beforeEach, describe, expect, mock, test } from "bun:test";

type ApiKeyResult =
  | {
      ok: true;
      userId: string;
      username: string;
      authProvider: "api-key";
    }
  | {
      ok: false;
      response: Response;
    };

type OwnedSessionChatResult =
  | {
      ok: true;
      sessionRecord: { id: string };
      chat: { id: string; sessionId: string; activeStreamId: string | null };
    }
  | {
      ok: false;
      response: Response;
    };

type DeleteMessageResult =
  | {
      status: "not_found";
    }
  | {
      status: "not_user_message";
    }
  | {
      status: "deleted";
      deletedMessageIds: string[];
    };

let apiKeyResult: ApiKeyResult = {
  ok: true,
  userId: "user-1",
  username: "test-user",
  authProvider: "api-key",
};
let ownedSessionChatResult: OwnedSessionChatResult = {
  ok: true,
  sessionRecord: { id: "session-1" },
  chat: {
    id: "chat-1",
    sessionId: "session-1",
    activeStreamId: null,
  },
};
let deleteResult: DeleteMessageResult = {
  status: "deleted",
  deletedMessageIds: ["message-2", "message-3"],
};

const deleteCalls: Array<{ chatId: string; messageId: string }> = [];

// Mock requireApiKey directly — this is the auth mechanism in self-hosted mode
mock.module("@/lib/auth/api-key", () => ({
  requireApiKey: async () => apiKeyResult,
}));

// Mock session-context helpers that are called after auth
mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => apiKeyResult,
  requireOwnedSessionChat: async () => ownedSessionChatResult,
}));

let mockWorkflowStatus = "running";

mock.module("@/lib/db/sessions", () => ({
  deleteChatMessageAndFollowing: async (chatId: string, messageId: string) => {
    deleteCalls.push({ chatId, messageId });
    return deleteResult;
  },
  updateChatActiveStreamId: async () => {},
}));

mock.module("workflow/api", () => ({
  getRun: () => ({
    get status() {
      return Promise.resolve(mockWorkflowStatus);
    },
  }),
}));

const routeModulePromise = import("./route");

function createContext(
  sessionId = "session-1",
  chatId = "chat-1",
  messageId = "message-2",
) {
  return {
    params: Promise.resolve({ sessionId, chatId, messageId }),
  };
}

describe("/api/sessions/[sessionId]/chats/[chatId]/messages/[messageId]", () => {
  beforeEach(() => {
    apiKeyResult = {
      ok: true,
      userId: "user-1",
      username: "test-user",
      authProvider: "api-key",
    };
    ownedSessionChatResult = {
      ok: true,
      sessionRecord: { id: "session-1" },
      chat: {
        id: "chat-1",
        sessionId: "session-1",
        activeStreamId: null,
      },
    };
    deleteResult = {
      status: "deleted",
      deletedMessageIds: ["message-2", "message-3"],
    };
    deleteCalls.length = 0;
    mockWorkflowStatus = "running";
  });

  test("returns auth error from guard", async () => {
    apiKeyResult = {
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    };
    const { DELETE } = await routeModulePromise;

    const response = await DELETE(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages/message-2",
        { method: "DELETE" },
      ),
      createContext(),
    );

    expect(response.status).toBe(401);
    expect(deleteCalls).toHaveLength(0);
  });

  test("returns ownership error from guard", async () => {
    ownedSessionChatResult = {
      ok: false,
      response: Response.json({ error: "Chat not found" }, { status: 404 }),
    };
    const { DELETE } = await routeModulePromise;

    const response = await DELETE(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages/message-2",
        { method: "DELETE" },
      ),
      createContext(),
    );

    expect(response.status).toBe(404);
    expect(deleteCalls).toHaveLength(0);
  });

  test("self-hosted mode: no managed-template restrictions on message deletion", async () => {
    // In self-hosted mode, api-key users are never subject to managed-template trial limits
    const { DELETE } = await routeModulePromise;

    const response = await DELETE(
      new Request(
        "https://self-hosted.example/api/sessions/session-1/chats/chat-1/messages/message-2",
        { method: "DELETE" },
      ),
      createContext(),
    );

    // Should succeed (200), not be blocked (403)
    expect(response.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
  });

  test("returns 409 when chat has an active stream", async () => {
    ownedSessionChatResult = {
      ok: true,
      sessionRecord: { id: "session-1" },
      chat: {
        id: "chat-1",
        sessionId: "session-1",
        activeStreamId: "stream-1",
      },
    };
    const { DELETE } = await routeModulePromise;

    const response = await DELETE(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages/message-2",
        { method: "DELETE" },
      ),
      createContext(),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe(
      "Cannot delete messages while a response is streaming",
    );
    expect(deleteCalls).toHaveLength(0);
  });

  test("returns 404 when message is not found", async () => {
    deleteResult = { status: "not_found" };
    const { DELETE } = await routeModulePromise;

    const response = await DELETE(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages/message-2",
        { method: "DELETE" },
      ),
      createContext(),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("Message not found");
  });

  test("returns 400 when deleting non-user message", async () => {
    deleteResult = { status: "not_user_message" };
    const { DELETE } = await routeModulePromise;

    const response = await DELETE(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages/message-2",
        { method: "DELETE" },
      ),
      createContext(),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Only user messages can be deleted");
  });

  test("returns deleted ids on success", async () => {
    const { DELETE } = await routeModulePromise;

    const response = await DELETE(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages/message-2",
        { method: "DELETE" },
      ),
      createContext(),
    );
    const body = (await response.json()) as {
      success: boolean;
      deletedMessageIds: string[];
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      deletedMessageIds: ["message-2", "message-3"],
    });
    expect(deleteCalls).toEqual([{ chatId: "chat-1", messageId: "message-2" }]);
  });
});
