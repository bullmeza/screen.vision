"use client";

import { useScreenShare } from "@/hooks/screenshare";
import {
  generateAction,
  generateHelpResponse,
  generateCoordinate,
  parseCoordinates,
  createCoordinateSnapshot,
  FollowUpContext,
  checkStepCompletion,
} from "@/lib/ai";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAnalytics } from "./AnalyticsProvider";
import { useSettings } from "./SettingsProvider";
import { getSystemInfo } from "@/lib/utils";
import { TaskHistoryItem, FollowUpItem } from "@/components/task-screen/types";

const MAX_STEPS = 150;

export interface TaskContextType {
  tasks: TaskHistoryItem[];
  totalTaskCount: number;
  hasExceededMaxSteps: boolean;

  goal: string;
  setGoal: (goal: string) => void;

  onNextTask: () => void;
  onRefreshTask: () => void;
  triggerFirstTask: () => void;
  returnToTask: (taskIndex: number) => void;

  sendFollowUpMessage: (question?: string) => void;

  isLoading: boolean;
  isLoadingFollowUp: boolean;
  isAnalyzingScreen: boolean;

  isLoadingPreviewImage: boolean;

  autoCompleteTriggered: number;

  reset: () => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export function TaskProvider({ children }: { children: ReactNode }) {
  const [goal, setGoal] = useState("");

  const { settings, isUsingLocalProvider } = useSettings();

  const {
    captureImageFromStream,
    startChangeDetection,
    stopChangeDetection,
    pauseChangeDetectionTemporarily,
    setIsAnalyzingScreenChange,
    isAnalyzingScreenChange,
  } = useScreenShare();

  const {
    trackFollowupQuestionAsked,
    trackFollowupResponseReceived,
    trackMaxStepsExceeded,
  } = useAnalytics();

  const [tasks, setTasks] = useState<TaskHistoryItem[]>([]);
  const tasksRef = useRef<TaskHistoryItem[]>([]);
  const [totalTaskCount, setTotalTaskCount] = useState(0);
  const [totalTaskGeneration, setTotalTaskGeneration] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFollowUp, setIsLoadingFollowUp] = useState(false);
  const [isLoadingPreviewImage, setIsLoadingPreviewImage] = useState(false);
  const [autoCompleteTriggered, setAutoCompleteTriggered] = useState(0);

  const lastScreenshotRef = useRef<string>("");
  const pendingFollowUpRef = useRef<string>("");

  const isTriggeringRef = useRef(false);
  const changeDetectionStartedRef = useRef(false);
  const isCheckingStepRef = useRef(false);
  const pendingCheckImageRef = useRef<string | null>(null);

  const hasExceededMaxSteps = totalTaskGeneration >= MAX_STEPS;

  useEffect(() => {
    if (hasExceededMaxSteps && totalTaskGeneration === MAX_STEPS) {
      trackMaxStepsExceeded();
    }
  }, [hasExceededMaxSteps, totalTaskGeneration, trackMaxStepsExceeded]);

  const triggerGenerateTaskDescription = async () => {
    console.log(`[${performance.now().toFixed(2)}ms] triggerGenerateTaskDescription: START`);
    if (hasExceededMaxSteps || isTriggeringRef.current) {
      console.log(`[${performance.now().toFixed(2)}ms] triggerGenerateTaskDescription: SKIPPED (hasExceededMaxSteps=${hasExceededMaxSteps}, isTriggeringRef=${isTriggeringRef.current})`);
      return;
    }

    isTriggeringRef.current = true;
    setIsLoading(true);

    try {
      console.log(`[${performance.now().toFixed(2)}ms] triggerGenerateTaskDescription: capturing image`);
      const captured = await captureImageFromStream({ isLocalLlm: isUsingLocalProvider });
      console.log(`[${performance.now().toFixed(2)}ms] triggerGenerateTaskDescription: image captured`);
      const imageDataUrl = captured.scaledImageDataUrl;
      const nonScaledImage = captured.nonScaledImageDataUrl;

      const osName = getSystemInfo().os.osName;

      let followUpContext: FollowUpContext | undefined;
      const currentTask = tasksRef.current[tasksRef.current.length - 1];
      if (
        pendingFollowUpRef.current &&
        lastScreenshotRef.current &&
        currentTask
      ) {
        followUpContext = {
          previousImage: lastScreenshotRef.current,
          previousInstruction: currentTask.text,
          followUpMessage: pendingFollowUpRef.current,
        };
        pendingFollowUpRef.current = "";

        tasksRef.current = tasksRef.current.slice(0, -1);
        setTasks(tasksRef.current);
        setTotalTaskCount((prev) => Math.max(0, prev - 1));
      }

      console.log(`[${performance.now().toFixed(2)}ms] triggerGenerateTaskDescription: calling generateAction`);
      const action = await generateAction(
        goal,
        imageDataUrl,
        settings,
        tasksRef.current.map((item) => item.text),
        osName,
        followUpContext
      );
      console.log(`[${performance.now().toFixed(2)}ms] triggerGenerateTaskDescription: generateAction completed`);

      lastScreenshotRef.current = imageDataUrl;

      setTotalTaskGeneration((prev) => prev + 1);

      const text = action.trim();

      console.log(`[${performance.now().toFixed(2)}ms] triggerGenerateTaskDescription: action text:`, text);

      setTotalTaskCount((prev) => prev + 1);

      const newTaskItem: TaskHistoryItem = { text };
      const newTasks = [...tasksRef.current, newTaskItem].filter(
        (item) => item.text
      );

      console.log(newTasks);
      tasksRef.current = newTasks;
      setTasks(newTasks);

      setIsLoading(false);

      const isLink = text.startsWith("https://");
      const textLower = text.toLowerCase();
      const isStandardizedInstruction =
        textLower === "done" ||
        textLower === "done." ||
        textLower === "wait" ||
        textLower === "wait." ||
        textLower.startsWith("scroll down") ||
        textLower.startsWith("scroll up");

      setIsLoadingPreviewImage(true);

      if (!isLink && !isStandardizedInstruction && text) {
        const coordinates = await generateCoordinate(text, nonScaledImage, settings);
        const coordinatePattern = /^-?\d+,\s*-?\d+$/;

        if (coordinates && coordinatePattern.test(coordinates.trim())) {
          const parsedCoordinates = parseCoordinates(coordinates);
          const generatedPreviewImage = await createCoordinateSnapshot(
            nonScaledImage,
            parsedCoordinates
          );

          if (generatedPreviewImage) {
            const lastIndex = tasksRef.current.length - 1;
            if (lastIndex >= 0) {
              tasksRef.current[lastIndex] = {
                ...tasksRef.current[lastIndex],
                previewImage: generatedPreviewImage,
              };
              setTasks([...tasksRef.current]);
            }
          }
        }
      }

      setIsLoadingPreviewImage(false);

      if (
        !changeDetectionStartedRef.current &&
        text &&
        textLower !== "done" &&
        textLower !== "done."
      ) {
        changeDetectionStartedRef.current = true;
        startChangeDetection(handleScreenChange);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isTriggeringRef.current = false;
      setIsLoading(false);
      setIsLoadingPreviewImage(false);
    }
  };

  const handleScreenChange = async (scaledImage: string) => {
    if (isCheckingStepRef.current) {
      pendingCheckImageRef.current = scaledImage;
      return;
    }

    await processScreenChange(scaledImage);
  };

  const processScreenChange = async (scaledImage: string) => {
    const currentTaskText = tasksRef.current[tasksRef.current.length - 1]?.text;
    if (!currentTaskText || isTriggeringRef.current) {
      setIsAnalyzingScreenChange(false);
      return;
    }

    const taskLower = currentTaskText.toLowerCase();
    if (taskLower === "done" || taskLower === "done.") {
      setIsAnalyzingScreenChange(false);
      return;
    }

    const isLink = currentTaskText.startsWith("https://");
    const isWait = taskLower === "wait";

    const taskDescription = isLink
      ? `Navigate to ${currentTaskText}`
      : isWait
      ? "Wait for the window to finish loading"
      : currentTaskText;

    isCheckingStepRef.current = true;

    try {
      if (!lastScreenshotRef.current) {
        isCheckingStepRef.current = false;
        setIsAnalyzingScreenChange(false);
        return;
      }

      const isCompleted = await checkStepCompletion(
        taskDescription,
        lastScreenshotRef.current,
        scaledImage,
        settings
      );

      isCheckingStepRef.current = false;

      const pendingImage = pendingCheckImageRef.current;
      pendingCheckImageRef.current = null;

      if (isCompleted) {
        setIsAnalyzingScreenChange(false);
        setAutoCompleteTriggered((prev) => prev + 1);
      } else if (pendingImage) {
        await processScreenChange(pendingImage);
      } else {
        setIsAnalyzingScreenChange(false);
      }
    } catch (e) {
      console.error("Error in processScreenChange:", e);
      isCheckingStepRef.current = false;
      setIsAnalyzingScreenChange(false);
    }
  };

  const onNextTask = () => {
    if (hasExceededMaxSteps) return;
    triggerGenerateTaskDescription();
  };

  const onRefreshTask = () => {
    if (hasExceededMaxSteps) return;
    if (tasksRef.current.length > 0) {
      tasksRef.current = tasksRef.current.slice(0, -1);
      setTasks(tasksRef.current);
      setTotalTaskCount((prev) => Math.max(0, prev - 1));
    }
    triggerGenerateTaskDescription();
  };

  const triggerFirstTask = () => {
    if (hasExceededMaxSteps) return;

    triggerGenerateTaskDescription();
  };

  const returnToTask = (taskIndex: number) => {
    if (hasExceededMaxSteps) return;
    if (taskIndex < 0 || taskIndex >= tasksRef.current.length) return;

    isTriggeringRef.current = false;
    isCheckingStepRef.current = false;
    pendingCheckImageRef.current = null;
    setIsLoading(false);
    setIsLoadingPreviewImage(false);
    setIsAnalyzingScreenChange(false);

    pauseChangeDetectionTemporarily(2000);

    const newTasks = tasksRef.current.slice(0, taskIndex + 1);
    tasksRef.current = newTasks;
    setTasks(newTasks);
    setTotalTaskCount(newTasks.length);
  };

  const addFollowUpToCurrentTask = (followUp: FollowUpItem) => {
    const lastIndex = tasksRef.current.length - 1;
    if (lastIndex >= 0) {
      const currentTask = tasksRef.current[lastIndex];
      tasksRef.current[lastIndex] = {
        ...currentTask,
        followUps: [...(currentTask.followUps ?? []), followUp],
      };
      setTasks([...tasksRef.current]);
    }
  };

  const updateCurrentFollowUpAnswer = (answer: string) => {
    const lastTaskIndex = tasksRef.current.length - 1;
    if (lastTaskIndex >= 0) {
      const currentTask = tasksRef.current[lastTaskIndex];
      const followUps = currentTask.followUps ?? [];
      if (followUps.length > 0) {
        const lastFollowUpIndex = followUps.length - 1;
        followUps[lastFollowUpIndex] = {
          ...followUps[lastFollowUpIndex],
          answer,
        };
        tasksRef.current[lastTaskIndex] = {
          ...currentTask,
          followUps: [...followUps],
        };
        setTasks([...tasksRef.current]);
      }
    }
  };

  const removeLastFollowUpFromCurrentTask = () => {
    const lastTaskIndex = tasksRef.current.length - 1;
    if (lastTaskIndex >= 0) {
      const currentTask = tasksRef.current[lastTaskIndex];
      const followUps = currentTask.followUps ?? [];
      if (followUps.length > 0) {
        tasksRef.current[lastTaskIndex] = {
          ...currentTask,
          followUps: followUps.slice(0, -1),
        };
        setTasks([...tasksRef.current]);
      }
    }
  };

  const sendFollowUpMessage = async (question?: string) => {
    if (!question) return;

    trackFollowupQuestionAsked(question);

    setIsLoadingFollowUp(true);

    let hasAddedFollowUp = false;
    let isRegenerating = false;

    try {
      const { scaledImageDataUrl: imageDataUrl } =
        await captureImageFromStream({ isLocalLlm: isUsingLocalProvider });

      const currentTaskText =
        tasksRef.current[tasksRef.current.length - 1]?.text ?? "";

      const text = await generateHelpResponse(
        goal,
        imageDataUrl,
        question,
        currentTaskText,
        settings,
        (streamedMessage) => {
          if (isRegenerating) return;

          if ("Regenerate".startsWith(streamedMessage)) {
            return;
          }

          if (streamedMessage.trim() === "Regenerate") {
            isRegenerating = true;
            if (hasAddedFollowUp) {
              removeLastFollowUpFromCurrentTask();
              hasAddedFollowUp = false;
            }
            return;
          }

          if (!hasAddedFollowUp) {
            addFollowUpToCurrentTask({ question, answer: streamedMessage });
            hasAddedFollowUp = true;
          } else {
            updateCurrentFollowUpAnswer(streamedMessage);
          }
        }
      );

      if (text.trim() === "Regenerate") {
        if (hasAddedFollowUp) {
          removeLastFollowUpFromCurrentTask();
        }
        pendingFollowUpRef.current = question;
        setIsLoadingFollowUp(false);
        triggerGenerateTaskDescription();
        return;
      }

      if (!hasAddedFollowUp) {
        addFollowUpToCurrentTask({ question, answer: text });
      }
      trackFollowupResponseReceived(question);
    } catch (e) {
      console.error(e);
      if (hasAddedFollowUp) {
        removeLastFollowUpFromCurrentTask();
      }
    }

    setIsLoadingFollowUp(false);
  };

  const reset = () => {
    stopChangeDetection();
    changeDetectionStartedRef.current = false;
    isCheckingStepRef.current = false;
    pendingCheckImageRef.current = null;
    isTriggeringRef.current = false;
    tasksRef.current = [];
    setTasks([]);
    setTotalTaskCount(0);
    setTotalTaskGeneration(0);
    setIsLoading(false);
    setIsLoadingFollowUp(false);
    setIsLoadingPreviewImage(false);
    lastScreenshotRef.current = "";
    pendingFollowUpRef.current = "";
    setGoal("");
  };

  const taskContext: TaskContextType = {
    tasks,
    totalTaskCount,
    hasExceededMaxSteps,
    goal,
    setGoal,
    onNextTask,
    onRefreshTask,
    triggerFirstTask,
    returnToTask,
    sendFollowUpMessage,

    isLoading,
    isLoadingFollowUp,
    isAnalyzingScreen: isAnalyzingScreenChange,
    isLoadingPreviewImage,

    autoCompleteTriggered,

    reset,
  };

  return (
    <TaskContext.Provider value={taskContext}>{children}</TaskContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error("useTasks must be used within a TaskProvider");
  }
  return context;
}
