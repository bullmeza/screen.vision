"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader } from "@geist-ui/icons";
import {
  useSettings,
  Provider,
  PROVIDER_URLS,
  ApiSettings,
} from "@/app/providers/SettingsProvider";
import { Button } from "./ui/button";

interface OllamaModel {
  name: string;
  model: string;
}

interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "Ollama",
  lmstudio: "LM Studio",
};

interface ConnectionError {
  provider: Provider;
  message: string;
}

const PROVIDER_ERRORS: Record<
  Provider,
  { message: string; helpImage: string }
> = {
  ollama: {
    message:
      'Could not connect to Ollama. Make sure you have "Expose Ollama to the network" enabled in the Ollama settings.',
    helpImage: "/ollama_help.png",
  },
  lmstudio: {
    message:
      "Could not connect to LM Studio. Make sure your server is running and CORS is enabled.",
    helpImage: "/lmstudio_help.png",
  },
};

export function SettingsModal() {
  const { settings, updateSettings, isSettingsOpen, closeSettings } =
    useSettings();
  const [localSettings, setLocalSettings] = useState<ApiSettings>(settings);
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [connectionError, setConnectionError] =
    useState<ConnectionError | null>(null);

  const fetchModels = useCallback(async (provider: Provider) => {
    setIsLoadingModels(true);
    setConnectionError(null);
    setModels([]);

    try {
      const baseUrl = PROVIDER_URLS[provider];

      if (provider === "ollama") {
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) throw new Error("Failed to connect to Ollama");
        const data = await response.json();
        const modelNames = (data.models as OllamaModel[]).map((m) => m.name);
        setModels(modelNames);
      } else {
        const response = await fetch(`${baseUrl}/v1/models`);
        if (!response.ok) throw new Error("Failed to connect to LM Studio");
        const data = await response.json();
        const modelIds = (data.data as LMStudioModel[])
          .map((m) => m.id)
          .filter((s) => !s.includes("embedding"));
        setModels(modelIds);
      }
    } catch {
      setConnectionError({
        provider,
        message: PROVIDER_ERRORS[provider].message,
      });
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (isSettingsOpen) {
      setLocalSettings(settings);
      setConnectionError(null);
      if (settings.provider) {
        fetchModels(settings.provider);
      } else {
        setModels([]);
      }
    }
  }, [isSettingsOpen, settings, fetchModels]);

  if (!isSettingsOpen) return null;

  const handleProviderChange = (provider: Provider) => {
    setLocalSettings({ provider, model: "" });
    fetchModels(provider);
  };

  const handleSave = () => {
    updateSettings(localSettings);
    closeSettings();
  };

  const handleClear = () => {
    setLocalSettings({ provider: null, model: "" });
    setModels([]);
    setConnectionError(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeSettings();
    }
  };

  const canSave = localSettings.provider && localSettings.model;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            Local LLM Settings
          </h2>
          <button
            onClick={closeSettings}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="p-3 rounded-xl text-sm bg-blue-50 text-blue-700">
            <strong>Local Mode:</strong> Connect to a local model running on
            your machine.
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Provider
            </label>
            <div className="flex gap-2">
              {(Object.keys(PROVIDER_LABELS) as Provider[]).map((provider) => (
                <button
                  key={provider}
                  onClick={() => handleProviderChange(provider)}
                  className={`flex-1 px-4 py-2.5 rounded-xl border transition-all ${
                    localSettings.provider === provider
                      ? "border-black bg-black text-white"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {PROVIDER_LABELS[provider]}
                </button>
              ))}
            </div>
          </div>

          {connectionError && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl text-sm bg-red-50 text-red-700">
                {connectionError.message}
              </div>
              <img
                src={PROVIDER_ERRORS[connectionError.provider].helpImage}
                alt={`${PROVIDER_LABELS[connectionError.provider]} setup help`}
                className="w-full rounded-xl border border-gray-200"
              />
            </div>
          )}

          {localSettings.provider && !connectionError && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Model
              </label>
              {isLoadingModels ? (
                <div className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-500">
                  <Loader size={16} className="animate-spin" />
                  <span>Loading models...</span>
                </div>
              ) : models.length === 0 ? (
                <div className="p-3 rounded-xl text-sm bg-yellow-50 text-yellow-700">
                  No models found. Make sure you have models installed.
                </div>
              ) : (
                <>
                  <select
                    value={localSettings.model}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        model: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all bg-white"
                  >
                    <option value="">Select a model</option>
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    Select from your locally installed vision models. Using{" "}
                    <u>at least Qwen3 VL 30B Instruct</u> is recommended.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between">
          <Button
            variant="ghost"
            onClick={handleClear}
            className="px-4 py-2 rounded-xl text-gray-500 hover:text-gray-700"
          >
            Clear Settings
          </Button>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={closeSettings}
              className="px-4 py-2 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
