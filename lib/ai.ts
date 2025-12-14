import { ApiSettings, PROVIDER_URLS } from "@/app/providers/SettingsProvider";
import {
  buildActionPrompt,
  buildHelpPrompt,
  buildCheckPrompt,
  buildCoordinatePrompt,
} from "./prompts";

export const aiApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export const chatId = crypto.randomUUID();

export async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onStream?: (message: string) => void
): Promise<string> {
  const decoder = new TextDecoder();
  let result = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === "data: [DONE]") continue;

        if (trimmedLine.startsWith("data: ")) {
          const dataContent = trimmedLine.slice(6);
          try {
            const parsed = JSON.parse(dataContent);
            if (parsed.type === "text-delta") {
              result += parsed.delta;
              onStream?.(result);
            }
          } catch (e) {
            console.error("Error parsing JSON:", e);
          }
        }
      }
    }

    if (buffer.trim()) {
      const trimmedLine = buffer.trim();
      if (trimmedLine.startsWith("data: ") && trimmedLine !== "data: [DONE]") {
        const dataContent = trimmedLine.slice(6);
        try {
          const parsed = JSON.parse(dataContent);
          if (parsed.type === "text-delta") {
            result += parsed.delta;
          }
        } catch (e) {
          console.error("Error parsing JSON from buffer:", e);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

async function readOpenAIStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onStream?: (message: string) => void
): Promise<string> {
  const decoder = new TextDecoder();
  let result = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === "data: [DONE]") continue;

        if (trimmedLine.startsWith("data: ")) {
          const dataContent = trimmedLine.slice(6);
          try {
            const parsed = JSON.parse(dataContent);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              result += content;
              onStream?.(result);
            }
          } catch (e) {
            console.error("Error parsing OpenAI JSON:", e);
          }
        }
      }
    }

    if (buffer.trim()) {
      const trimmedLine = buffer.trim();
      if (trimmedLine.startsWith("data: ") && trimmedLine !== "data: [DONE]") {
        const dataContent = trimmedLine.slice(6);
        try {
          const parsed = JSON.parse(dataContent);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            result += content;
          }
        } catch (e) {
          console.error("Error parsing OpenAI JSON from buffer:", e);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

export interface FollowUpContext {
  previousImage: string;
  previousInstruction: string;
  followUpMessage: string;
}

type MessageContent =
  | string
  | Array<{ type: string; text?: string; image_url?: { url: string } }>;
type Message = { role: string; content: MessageContent };

async function sendToBackend(
  endpoint: string,
  messages: Message[],
  onStream?: (message: string) => void
): Promise<string> {
  const response = await fetch(`${aiApiUrl}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  return readStream(reader, onStream);
}

async function sendDirectToApi(
  messages: Message[],
  settings: ApiSettings,
  onStream?: (message: string) => void
): Promise<string> {
  if (!settings.provider) {
    throw new Error("No provider configured");
  }

  const baseUrl = PROVIDER_URLS[settings.provider];
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      model: settings.model,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Direct API request failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  return readOpenAIStream(reader, onStream);
}

const shouldUseDirectApi = (settings: ApiSettings): boolean => {
  return Boolean(settings.provider && settings.model);
};

export async function generateAction(
  goal: string,
  base64Image: string,
  settings: ApiSettings,
  completedSteps?: string[],
  osName?: string,
  followUpContext?: FollowUpContext
) {
  const maxRetries = 3;
  let lastError: unknown;

  const systemPrompt = buildActionPrompt(goal, osName, completedSteps);

  let messages: Message[];

  if (followUpContext) {
    messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [{ type: "text", text: "[Previous Screenshot]" }],
      },
      {
        role: "assistant",
        content: followUpContext.previousInstruction,
      },
      {
        role: "user",
        content: [
          { type: "text", text: followUpContext.followUpMessage },
          { type: "image_url", image_url: { url: base64Image } },
        ],
      },
    ];
  } else {
    messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: base64Image } }],
      },
    ];
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (shouldUseDirectApi(settings)) {
        return await sendDirectToApi(messages, settings);
      } else {
        return await sendToBackend("step", messages);
      }
    } catch (e) {
      lastError = e;
      console.error(
        `Error generating action (attempt ${attempt + 1}/${maxRetries + 1}):`,
        e
      );
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
      }
    }
  }

  console.error("All retry attempts failed for generateAction:", lastError);
  return "";
}

export async function generateHelpResponse(
  goal: string,
  base64Image: string,
  userQuestion: string,
  previousMessage: string,
  settings: ApiSettings,
  onStream?: (message: string) => void
) {
  try {
    const systemPrompt = buildHelpPrompt(goal, previousMessage || undefined);

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userQuestion },
          { type: "image_url", image_url: { url: base64Image } },
        ],
      },
    ];

    if (shouldUseDirectApi(settings)) {
      return await sendDirectToApi(messages, settings, onStream);
    } else {
      return await sendToBackend("help", messages, onStream);
    }
  } catch (e) {
    console.error("Error generating help response:", e);
    return "";
  }
}

export async function checkStepCompletion(
  currentInstruction: string,
  lastBase64Image: string,
  currentBase64Image: string,
  settings: ApiSettings
): Promise<boolean> {
  try {
    const systemPrompt = buildCheckPrompt(currentInstruction);

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Before:" },
          { type: "image_url", image_url: { url: lastBase64Image } },
          { type: "text", text: "After:" },
          { type: "image_url", image_url: { url: currentBase64Image } },
        ],
      },
    ];

    let text: string;
    if (shouldUseDirectApi(settings)) {
      text = await sendDirectToApi(messages, settings);
    } else {
      text = await sendToBackend("check", messages);
    }

    const cleanText = text.replace(/```json\n|\n```/g, "").trim();

    try {
      const result = JSON.parse(cleanText);
      console.log(result);
      return result.status === "Yes";
    } catch (parseError) {
      console.error("Failed to parse check completion JSON:", text);
      return text.includes('"status": "Yes"');
    }
  } catch (e) {
    console.error("Error checking step completion:", e);
    return false;
  }
}

export async function generateCoordinate(
  instruction: string,
  base64Image: string,
  settings: ApiSettings
) {
  try {
    const systemPrompt = buildCoordinatePrompt(instruction);

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: base64Image } }],
      },
    ];

    let text: string;
    if (shouldUseDirectApi(settings)) {
      text = await sendDirectToApi(messages, settings);
    } else {
      text = await sendToBackend("coordinates", messages);
    }

    return text.trim();
  } catch (e) {
    console.error("Error generating coordinates:", e);
    return "None";
  }
}

interface Coordinates {
  x: number;
  y: number;
}

export const parseCoordinates = (output: string): Coordinates => {
  const [xStr, yStr] = output.split(",");
  return {
    x: parseInt(xStr, 10),
    y: parseInt(yStr, 10),
  };
};

export const createCoordinateSnapshot = async (
  imageDataUrl: string,
  { x, y }: Coordinates,
  sizePercentY = 15,
  xToYRatio = 2.5
): Promise<string | null> => {
  if (x < 0 || y < 0) return null;

  const img = new Image();
  img.src = imageDataUrl;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
  });

  const sizePercentX = sizePercentY * xToYRatio;
  const outputWidth = Math.round((sizePercentX / 100) * img.width);
  const outputHeight = Math.round((sizePercentY / 100) * img.height);

  const imageX = (x / 999) * img.width;
  const imageY = (y / 999) * img.height;

  const halfCropX = outputWidth / 2;
  const halfCropY = outputHeight / 2;

  const cropX = Math.max(
    0,
    Math.min(imageX - halfCropX, img.width - outputWidth)
  );
  const cropY = Math.max(
    0,
    Math.min(imageY - halfCropY, img.height - outputHeight)
  );

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    img,
    cropX,
    cropY,
    outputWidth,
    outputHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  const cursorX = imageX - cropX + 5;
  const cursorY = imageY - cropY - 5;

  const cursorImg = new Image();
  cursorImg.src = "/cursor.png";
  await new Promise<void>((resolve) => {
    cursorImg.onload = () => resolve();
  });

  const cursorSize = 50;
  ctx.drawImage(cursorImg, cursorX, cursorY, cursorSize, cursorSize);

  return canvas.toDataURL("image/png");
};
