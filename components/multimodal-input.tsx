"use client";

import type {
  CreateUIMessage,
  UIMessage,
  UseChatHelpers,
  UseChatOptions,
} from "@ai-sdk/react";

type ChatRequestOptions = {
  headers?: Record<string, string> | Headers;
  body?: object;
  data?: any;
};
import { motion } from "framer-motion";
import type React from "react";
import {
  useRef,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";

import { cn, getSystemInfo } from "@/lib/utils";

import { ArrowUpIcon, SparklesIcon } from "./icons";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Monitor, Command, Box, Cloud, Globe } from "@geist-ui/icons";
import { generateAction } from "@/lib/ai";

export function MultimodalInput({
  input,
  setInput,
  isLoading,
  stop,
  messages,
  handleSubmit,
  className,
  placeholderText,
  showSuggestions,
  onSuggestedActionClicked,
  size,
}: {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  stop?: () => void;
  messages: Array<UIMessage>;
  handleSubmit: (
    event?: {
      preventDefault?: () => void;
    },
    input?: string
  ) => void;
  className?: string;
  placeholderText?: string;
  showSuggestions?: boolean;
  onSuggestedActionClicked?: (action: string) => void;
  size?: "sm";
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [suggestedActions, setSuggestedActions] = useState<
    { text: string; icon: string }[]
  >([]);

  useEffect(() => {
    const disableRecommendations = localStorage.getItem("recommendations");

    if (disableRecommendations) return;

    const systemInfo = getSystemInfo();
    const osName = systemInfo.os.osName;

    setSuggestedActions([
      ...(osName ? [{ text: `Update ${osName}`, icon: "command" }] : []),
      { text: "Change DNS to 1.1.1.1", icon: "globe" },
      { text: "Create S3 bucket on Google Cloud", icon: "box" },
    ]);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${
        textareaRef.current.scrollHeight + 2
      }px`;
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue;
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const submitForm = useCallback(() => {
    handleSubmit(undefined);

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [handleSubmit, width]);

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case "monitor":
        return <Monitor size={16} />;
      case "command":
        return <Command size={16} />;
      case "box":
        return <Box size={16} />;
      case "cloud":
        return <Cloud size={16} />;
      case "globe":
        return <Globe size={16} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="relative w-full flex flex-col gap-4">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10">
          <SparklesIcon size={18} />
        </div>
        <Textarea
          ref={textareaRef}
          placeholder={placeholderText || "Send a message..."}
          value={input || ""}
          onChange={handleInput}
          className={cn(
            "min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-3xl !text-base bg-white shadow-sm border border-gray-200 pl-11 pr-14 focus:outline-none focus:ring-0 focus:border-gray-300 focus-visible:ring-0 focus-visible:ring-offset-0",
            size === "sm" ? "py-3" : "py-4",
            className
          )}
          rows={1}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();

              if (isLoading) {
                toast.error(
                  "Please wait for the model to finish its response!"
                );
              } else {
                submitForm();
              }
            }
          }}
        />

        <Button
          className={cn(
            "rounded-full p-1.5 h-fit absolute m-0.5 border dark:border-zinc-600 bg-black hover:bg-gray-800",
            size === "sm" ? "bottom-2 right-2" : "bottom-3 right-3"
          )}
          onClick={(event) => {
            event.preventDefault();
            submitForm();
          }}
          disabled={isLoading || !input || input.length === 0}
        >
          {isLoading ? (
            <div className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <ArrowUpIcon size={14} />
          )}
        </Button>
      </div>

      <div className="h-8">
        {showSuggestions && (
          <div className="flex flex-wrap justify-center gap-2 w-full mt-4">
            {suggestedActions.map((action, index) => (
              <motion.div
                key={`suggested-action-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
              >
                <Button
                  variant="ghost"
                  onClick={async () => {
                    onSuggestedActionClicked?.(action.text);
                    handleSubmit(undefined, action.text);
                  }}
                  className="rounded-full border border-gray-200 bg-white hover:bg-gray-50 px-4 py-2 text-sm h-auto gap-2"
                >
                  {renderIcon(action.icon)}
                  <span className="text-gray-700">{action.text}</span>
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
