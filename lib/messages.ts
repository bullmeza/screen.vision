export interface ClientMessagePart {
  type: string;
  text?: string;
  contentType?: string;
  mediaType?: string;
  url?: string;
  data?: unknown;
}

export interface ClientAttachment {
  contentType: string;
  url: string;
}

export interface ClientMessage {
  role: string;
  content?: string;
  parts?: ClientMessagePart[];
  experimental_attachments?: ClientAttachment[];
}

export type ChatCompletionMessageParam = {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

export function convertToOpenAIMessages(
  messages: ClientMessage[]
): ChatCompletionMessageParam[] {
  const openaiMessages: ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    const messageParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    if (message.parts) {
      for (const part of message.parts) {
        if (part.type === "text") {
          messageParts.push({ type: "text", text: part.text || "" });
        } else if (part.type === "file") {
          const isImage =
            (part.contentType && part.contentType.startsWith("image")) ||
            (part.mediaType && part.mediaType.startsWith("image"));
          if (isImage && part.url) {
            messageParts.push({ type: "image_url", image_url: { url: part.url } });
          } else if (part.url) {
            messageParts.push({ type: "text", text: part.url });
          }
        }
      }
    } else if (message.content !== undefined) {
      messageParts.push({ type: "text", text: message.content });
    }

    if (!message.parts && message.experimental_attachments) {
      for (const attachment of message.experimental_attachments) {
        if (attachment.contentType.startsWith("image")) {
          messageParts.push({ type: "image_url", image_url: { url: attachment.url } });
        } else if (attachment.contentType.startsWith("text")) {
          messageParts.push({ type: "text", text: attachment.url });
        }
      }
    }

    let contentPayload: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    if (messageParts.length > 0) {
      if (messageParts.length === 1 && messageParts[0].type === "text") {
        contentPayload = messageParts[0].text || "";
      } else {
        contentPayload = messageParts;
      }
    } else {
      contentPayload = "";
    }

    openaiMessages.push({
      role: message.role,
      content: contentPayload,
    });
  }

  return openaiMessages;
}

