"use client";

import { MultimodalInput } from "@/components/multimodal-input";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useScreenShare } from "@/hooks/screenshare";
import { useTaskPip } from "@/hooks/pip";
import { useTasks } from "@/app/providers/TaskProvider";
import { useAnalytics } from "@/app/providers/AnalyticsProvider";
import { TaskScreen } from "./task-screen";
import { SafariSettingsGuide } from "./safari-settings-guide";
import { ScreenshareModal } from "./screenshare-modal";
import { Monitor, Github } from "@geist-ui/icons";

const HISTORY_STATE_KEY = "screen-vision-session";

const logWithTimestamp = (message: string, data?: unknown) => {
  const timestamp = performance.now().toFixed(2);
  console.log(`[${timestamp}ms] ${message}`, data ?? "");
};

// Detect if browser is Safari
const isSafari = (): boolean => {
  if (typeof window === "undefined") return false;
  const userAgent = navigator.userAgent;
  return userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1;
};

// Detect if device is mobile
const isMobileDevice = (): boolean => {
  if (typeof window === "undefined") return false;

  // Check for touch capability combined with small screen
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;

  // Also check user agent for mobile devices
  const mobileUserAgent =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  return mobileUserAgent || (hasTouch && isSmallScreen);
};

const SAFARI_SETTINGS_STORAGE_KEY = "safari-settings-completed";
const SCREENSHARE_MODAL_ACCEPTED_KEY = "screenshare-modal-accepted";

export function Chat() {
  const { isSharing, stopSharing } = useScreenShare();

  const { openPipWindow } = useTaskPip();

  const taskContext = useTasks();

  const {
    tasks,
    isLoading: isLoadingTask,
    onNextTask,
    triggerFirstTask,
    reset: resetTasks,
    goal,
    setGoal,
  } = taskContext;

  const hasTriggeredFirstTask = React.useRef(false);

  const { requestScreenShare, isRequestingScreenShare } = useScreenShare();

  const {
    startQuestionSession,
    trackScreenshareAccepted,
    trackScreenshareDeclined,
    trackScreenshareStarted,
    trackStartOverClicked,
    trackTaskRefreshed,
    trackAllTasksCompleted,
    trackSuggestedActionClicked,
  } = useAnalytics();

  const [input, setInput] = React.useState("");
  const [hasSubmittedProblem, setHasSubmittedProblem] = useState(false);
  const [showScreenshareModal, setShowScreenshareModal] = useState(false);
  const [showSafariSettingsGuide, setShowSafariSettingsGuide] = useState(false);

  // Initialize Safari settings state from localStorage
  const [safariSettingsCompleted, setSafariSettingsCompleted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SAFARI_SETTINGS_STORAGE_KEY) === "true";
  });

  // Check if user has previously accepted the screenshare modal
  const [hasAcceptedModalBefore] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SCREENSHARE_MODAL_ACCEPTED_KEY) === "true";
  });

  // Check if browser is Safari (memoized to avoid recalculating)
  const browserIsSafari = useMemo(() => isSafari(), []);

  // Check if device is mobile (memoized to avoid recalculating)
  const isMobile = useMemo(() => isMobileDevice(), []);

  // Handler to complete Safari settings and persist to localStorage
  const handleSafariSettingsComplete = () => {
    setSafariSettingsCompleted(true);
    localStorage.setItem(SAFARI_SETTINGS_STORAGE_KEY, "true");

    if (showSafariSettingsGuide) {
      setShowSafariSettingsGuide(false);
      setShowScreenshareModal(true);
    } else {
      setTimeout(() => {
        openPipWindow();
      }, 500);
    }
  };

  const showSafariGuide =
    isSharing && browserIsSafari && !safariSettingsCompleted;

  const handleSubmit = async (
    event?: { preventDefault?: () => void },
    currentInput?: string
  ) => {
    logWithTimestamp("handleSubmit: START");
    event?.preventDefault?.();

    const text = currentInput || input;

    if (text.trim()) {
      logWithTimestamp("handleSubmit: resetting tasks and setting state");
      resetTasks();
      hasTriggeredFirstTask.current = false;
      startQuestionSession(text.trim());
      setGoal(text.trim());
      setHasSubmittedProblem(true);

      if (browserIsSafari && !safariSettingsCompleted) {
        setShowSafariSettingsGuide(true);
        return;
      }

      if (hasAcceptedModalBefore) {
        logWithTimestamp("handleSubmit: calling requestScreenShare");
        const success = await requestScreenShare();
        logWithTimestamp("handleSubmit: requestScreenShare returned", {
          success,
          isSharing,
        });
        if (!success) {
          resetTasks();
          setHasSubmittedProblem(false);
        } else {
          setInput("");
          trackScreenshareStarted();
          history.pushState({ [HISTORY_STATE_KEY]: true }, "");
          if (!browserIsSafari || safariSettingsCompleted) {
            setTimeout(() => openPipWindow(), 1000);
          }
        }
        logWithTimestamp("handleSubmit: END (hasAcceptedModalBefore path)");
      } else {
        logWithTimestamp("handleSubmit: showing screenshare modal");
        setShowScreenshareModal(true);
      }
    }
  };

  const handleScreenshareConfirm = async () => {
    logWithTimestamp("handleScreenshareConfirm: START");
    trackScreenshareAccepted();
    setShowScreenshareModal(false);

    if (browserIsSafari && !safariSettingsCompleted) {
      setShowSafariSettingsGuide(true);
      return;
    }

    logWithTimestamp("handleScreenshareConfirm: calling requestScreenShare");
    const success = await requestScreenShare();
    logWithTimestamp("handleScreenshareConfirm: requestScreenShare returned", {
      success,
      isSharing,
    });

    if (success) {
      setInput("");
      trackScreenshareStarted();
      localStorage.setItem(SCREENSHARE_MODAL_ACCEPTED_KEY, "true");
      history.pushState({ [HISTORY_STATE_KEY]: true }, "");
      setTimeout(() => openPipWindow(), 1000);
    } else {
      resetTasks();
      setHasSubmittedProblem(false);
    }
    logWithTimestamp("handleScreenshareConfirm: END");
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const shouldShowSafariGuide =
          isSharing && browserIsSafari && !safariSettingsCompleted;
        if (hasSubmittedProblem && isSharing && !shouldShowSafariGuide) {
          openPipWindow();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    hasSubmittedProblem,
    openPipWindow,
    isSharing,
    browserIsSafari,
    safariSettingsCompleted,
  ]);

  useEffect(() => {
    logWithTimestamp("useEffect[isSharing]: triggered", {
      hasSubmittedProblem,
      isSharing,
      browserIsSafari,
      safariSettingsCompleted,
    });
    const shouldShowSafariGuide =
      isSharing && browserIsSafari && !safariSettingsCompleted;
    if (hasSubmittedProblem && isSharing && !shouldShowSafariGuide) {
      logWithTimestamp(
        "useEffect[isSharing]: conditions met, scheduling openPipWindow and triggerFirstTask"
      );
      setTimeout(() => {
        openPipWindow();
      }, 1000);

      if (!hasTriggeredFirstTask.current) {
        hasTriggeredFirstTask.current = true;
        logWithTimestamp("useEffect[isSharing]: calling triggerFirstTask");
        triggerFirstTask();
      }
    }
  }, [
    hasSubmittedProblem,
    isSharing,
    openPipWindow,
    browserIsSafari,
    safariSettingsCompleted,
    triggerFirstTask,
  ]);

  const handleStartOver = useCallback(() => {
    trackStartOverClicked();
    stopSharing();
    resetTasks();
    setHasSubmittedProblem(false);
    setInput("");
    hasTriggeredFirstTask.current = false;
  }, [trackStartOverClicked, stopSharing, resetTasks]);

  useEffect(() => {
    const handlePopState = () => {
      if (isSharing) {
        handleStartOver();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isSharing, handleStartOver]);

  const navbar = (
    <div className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-50">
      <div className="flex items-center gap-2">
        <img src="/logo.png" height={40} width={180} />
      </div>
      <a
        href="https://github.com/bullmeza/screen.vision"
        target="_blank"
        className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Github size={16} />
        <span className="text-sm">Star on GitHub</span>
        {/* <span className="text-sm text-gray-500 border-l border-gray-300 pl-2">
          2.4k
        </span> */}
      </a>
    </div>
  );

  logWithTimestamp("RENDER", {
    isSharing,
    hasSubmittedProblem,
    isLoadingTask,
    showSafariGuide,
  });

  // Show mobile not supported message immediately
  if (isMobile) {
    logWithTimestamp("RENDER: showing mobile not supported");
    return (
      <div className="flex justify-center items-center flex-col h-[85dvh]">
        {navbar}
        <div className="flex flex-col justify-center items-center max-w-[800px] w-full font-inter">
          <div className="flex flex-col items-center gap-6 p-8 max-w-md text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Monitor size={40} className="text-primary" />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold">Sorry!</h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Screen Vision is only available on computers. Please visit this
                page on a desktop or laptop.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show Safari settings guide before screen sharing if needed
  if (showSafariSettingsGuide && !isSharing) {
    logWithTimestamp("RENDER: showing Safari settings guide");
    return (
      <div className="flex justify-center items-center flex-col h-[100dvh]">
        {navbar}
        <div className="flex flex-col justify-center items-center max-w-[800px] w-full font-inter">
          <SafariSettingsGuide onComplete={handleSafariSettingsComplete} />
        </div>
      </div>
    );
  }

  // Step 1 & 2: Show input or screenshare prompt with smooth transition
  if (!isSharing) {
    logWithTimestamp("RENDER: showing input form (isSharing=false)");
    return (
      <>
        <ScreenshareModal
          isOpen={showScreenshareModal}
          onConfirm={handleScreenshareConfirm}
          onClose={() => {
            trackScreenshareDeclined();
            setShowScreenshareModal(false);
            resetTasks();
            setHasSubmittedProblem(false);
          }}
          isLoading={isRequestingScreenShare}
        />
        <div className="min-h-screen bg-grid-pattern">
          {navbar}
          <div className="flex justify-center items-center flex-col h-[85dvh]">
            <div className="flex flex-col justify-center items-center max-w-[800px] w-full font-inter px-4">
              <h1 className="mb-4 text-center text-5xl font-bold text-black tracking-tight">
                Share your screen with AI
              </h1>
              <h2 className="mb-8 text-center text-xl text-gray-500">
                Get an AI guided step-by-step fix for your problem.
              </h2>

              <div className="w-full relative">
                <MultimodalInput
                  input={input}
                  setInput={setInput}
                  handleSubmit={handleSubmit}
                  isLoading={false}
                  stop={() => {}}
                  messages={[]}
                  placeholderText="Describe your problem here..."
                  showSuggestions
                  onSuggestedActionClicked={trackSuggestedActionClicked}
                />
              </div>

              <div className="mt-12 text-center text-sm text-gray-500 max-w-xl">
                <p>
                  Your privacy is our priority. Your screen data is not stored
                  or used for model training.{" "}
                  <a
                    href="https://github.com/bullmeza/screen.vision#privacy--security"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-gray-600 transition-colors"
                  >
                    Read more
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Step 3: Problem submitted and sharing - show Safari guide if needed, otherwise TaskScreen
  if (showSafariGuide) {
    logWithTimestamp("RENDER: showing Safari guide (during sharing)");
    return (
      <div className="flex justify-center items-center flex-col h-[100dvh]">
        {navbar}
        <div className="flex flex-col justify-center items-center max-w-[800px] w-full font-inter">
          <SafariSettingsGuide onComplete={handleSafariSettingsComplete} />
        </div>
      </div>
    );
  }

  logWithTimestamp("RENDER: showing TaskScreen");
  return (
    <>
      <TaskScreen
        {...taskContext}
        goal={goal}
        tasks={tasks}
        onNextTask={onNextTask}
        onStartOver={handleStartOver}
        isLoading={isLoadingTask}
        isPip={false}
        onTaskRefreshed={trackTaskRefreshed}
        onAllTasksCompleted={trackAllTasksCompleted}
      />
    </>
  );
}

export default Chat;
