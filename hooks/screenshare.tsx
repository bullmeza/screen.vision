import { create } from "zustand";
import { useTaskPip } from "./pip";

export interface PipDetails {
  x: number;
  y: number;
  width: number;
  height: number;
  isActive: boolean;
  isVisible: boolean;
}

interface CaptureImageOptions {
  whiteout?: boolean;
  size?: "sm" | "md" | "lg";
  isLocalLlm?: boolean;
}

interface ScreenShareState {
  stream: MediaStream | null;
  isSharing: boolean;
  isRequestingScreenShare: boolean;
  changeDetectionEnabled: boolean;
  isChangeDetectionPaused: boolean;
  isAnalyzingScreenChange: boolean;
  pipDetailsGetter: (() => PipDetails) | null;
  setPipDetailsGetter: (getter: () => PipDetails) => void;
  pipCloseCallback: (() => void) | null;
  setPipCloseCallback: (callback: (() => void) | null) => void;
  requestScreenShare: () => Promise<boolean>;
  startSharing: (stream: MediaStream) => void;
  stopSharing: () => void;
  captureImageFromStream: (options?: CaptureImageOptions) => Promise<{
    scaledImageDataUrl: string;
    nonScaledImageDataUrl: string;
  }>;

  startChangeDetection: (
    callback: (scaledImage: string, nonScaledImage: string) => void,
    options?: ChangeDetectionOptions
  ) => void;
  stopChangeDetection: () => void;
  pauseChangeDetection: () => void;
  resumeChangeDetection: () => void;
  pauseChangeDetectionTemporarily: (durationMs?: number) => void;
  setIsAnalyzingScreenChange: (value: boolean) => void;
}

interface ChangeDetectionOptions {
  threshold?: number; // 0-100, percentage of pixels that changed
  checkIntervalMs?: number; // How often to check for changes
  scaleFactor?: number; // Scale down images for faster comparison (0-1)
  captureDelayMs?: number; // Delay after a change is detected and captured
}

export const useScreenShare = create<ScreenShareState>((set, get) => {
  let changeDetectionTimer: NodeJS.Timeout | null = null;
  let previousImageData: ImageData | null = null;
  let temporaryPauseTimer: NodeJS.Timeout | null = null;

  const imagePixelSize = 1_500_000;
  const imageSizeForChangeDetection = 800_000;

  return {
    stream: null,
    isSharing: false,
    isRequestingScreenShare: false,
    changeDetectionEnabled: false,
    isChangeDetectionPaused: false,
    isAnalyzingScreenChange: false,
    pipDetailsGetter: null,
    setPipDetailsGetter: (getter) => set({ pipDetailsGetter: getter }),
    pipCloseCallback: null,
    setPipCloseCallback: (callback) => set({ pipCloseCallback: callback }),
    setIsAnalyzingScreenChange: (value) =>
      set({ isAnalyzingScreenChange: value }),

    requestScreenShare: async () => {
      console.log(
        `[${performance.now().toFixed(2)}ms] requestScreenShare: START`
      );
      set({ isRequestingScreenShare: true });
      try {
        console.log(
          `[${performance
            .now()
            .toFixed(2)}ms] requestScreenShare: calling getDisplayMedia`
        );
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
            width: 1920,
            height: 1080,
          },
          audio: false,
        });

        // sleep for 150ms
        await new Promise((resolve) => setTimeout(resolve, 150));

        console.log(
          `[${performance
            .now()
            .toFixed(
              2
            )}ms] requestScreenShare: getDisplayMedia returned, calling startSharing`
        );
        get().startSharing(stream);
        console.log(
          `[${performance
            .now()
            .toFixed(
              2
            )}ms] requestScreenShare: startSharing completed, returning true`
        );
        return true;
      } catch (error) {
        console.error("Error sharing screen:", error);
        return false;
      } finally {
        set({ isRequestingScreenShare: false });
      }
    },

    startSharing: (stream: MediaStream) => {
      console.log(
        `[${performance
          .now()
          .toFixed(2)}ms] startSharing: setting isSharing=true`
      );
      set({ stream, isSharing: true });
      console.log(
        `[${performance
          .now()
          .toFixed(2)}ms] startSharing: isSharing set to true`
      );

      // Auto-stop when user stops via browser
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        get().stopSharing();
      });
    },

    stopSharing: () => {
      const { stream, pipCloseCallback } = get();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      // Clean up change detection
      get().stopChangeDetection();

      // Close PiP window if open
      pipCloseCallback?.();

      set({ stream: null, isSharing: false });
    },

    captureImageFromStream: (
      options?: CaptureImageOptions
    ): Promise<{
      scaledImageDataUrl: string;
      nonScaledImageDataUrl: string;
    }> => {
      return new Promise((resolve, reject) => {
        const { stream } = get();

        if (!stream) {
          resolve({ scaledImageDataUrl: "", nonScaledImageDataUrl: "" });
          return;
        }

        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.style.display = "none";
        document.body.appendChild(video);

        if (options?.whiteout) {
          const overlay = document.createElement("div");
          overlay.id = "screenshare-whiteout-overlay";
          overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: hsl(var(--background));
            z-index: 999999;
            pointer-events: none;
          `;
          document.body.appendChild(overlay);
        }

        video.onloadedmetadata = () => {
          video.play();

          setTimeout(() => {
            const maxPixels =
              options?.size === "sm"
                ? 800_000
                : options?.isLocalLlm
                ? 1_000_000
                : imagePixelSize;

            const { width, height } = getScaledDimensions(
              video.videoWidth,
              video.videoHeight,
              maxPixels
            );

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) {
              reject(new Error("Could not get canvas context"));
              return;
            }

            ctx.drawImage(video, 0, 0, width, height);

            const pipDetails = get().pipDetailsGetter?.();
            if (pipDetails) {
              maskPipWindow(ctx, pipDetails, width, height);
            }

            const imageData = ctx.getImageData(0, 0, width, height);
            detectAndMaskPopup(imageData.data, width, height);
            ctx.putImageData(imageData, 0, 0);

            const scaledImageDataUrl = canvas.toDataURL("image/jpeg");

            const nonScaledCanvas = document.createElement("canvas");
            nonScaledCanvas.width = video.videoWidth;
            nonScaledCanvas.height = video.videoHeight;
            const nonScaledCtx = nonScaledCanvas.getContext("2d", {
              willReadFrequently: true,
            });

            let nonScaledImageDataUrl = "";
            if (nonScaledCtx) {
              nonScaledCtx.drawImage(
                video,
                0,
                0,
                video.videoWidth,
                video.videoHeight
              );
              nonScaledImageDataUrl = nonScaledCanvas.toDataURL("image/jpeg");
            }

            if (options?.whiteout) {
              const overlay = document.getElementById(
                "screenshare-whiteout-overlay"
              );
              if (overlay) {
                overlay.remove();
              }
            }

            video.pause();
            video.srcObject = null;
            video.remove();

            resolve({ scaledImageDataUrl, nonScaledImageDataUrl });
          }, 100);
        };

        video.onerror = () => {
          video.remove();
          reject(new Error("Error loading video"));
        };
      });
    },

    startChangeDetection: (
      callback: (scaledImage: string, nonScaledImage: string) => void,
      options: ChangeDetectionOptions = {}
    ) => {
      const {
        threshold = 1,
        checkIntervalMs = 200,
        scaleFactor = 0.1,
        captureDelayMs = 100,
      } = options;

      const { stream } = get();
      if (!stream) return;

      // Stop any existing detection
      get().stopChangeDetection();

      set({ changeDetectionEnabled: true, isChangeDetectionPaused: false });

      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.style.display = "none";
      document.body.appendChild(video);

      video.onloadedmetadata = () => {
        video.play();

        const runDetection = () => {
          const { isChangeDetectionPaused, changeDetectionEnabled } = get();

          // Stop if detection was disabled
          if (!changeDetectionEnabled) return;

          // Schedule next check if paused
          if (isChangeDetectionPaused) {
            changeDetectionTimer = setTimeout(runDetection, checkIntervalMs);
            return;
          }

          const canvas = document.createElement("canvas");
          const width = Math.floor(video.videoWidth * scaleFactor);
          const height = Math.floor(video.videoHeight * scaleFactor);

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            changeDetectionTimer = setTimeout(runDetection, checkIntervalMs);
            return;
          }

          ctx.drawImage(video, 0, 0, width, height);

          const pipDetails = get().pipDetailsGetter?.();
          if (pipDetails) {
            maskPipWindow(ctx, pipDetails, width, height);
          }

          const currentImageData = ctx.getImageData(0, 0, width, height);
          detectAndMaskPopup(currentImageData.data, width, height);

          let changeDetected = false;

          if (previousImageData) {
            const changePercent = calculateImageDifference(
              previousImageData,
              currentImageData
            );

            if (changePercent >= threshold) {
              changeDetected = true;
            }
          }

          if (changeDetected) {
            set({ isAnalyzingScreenChange: true });
            // Wait before capturing
            changeDetectionTimer = setTimeout(() => {
              // Capture High Res Image
              const { width: captureWidth, height: captureHeight } =
                getScaledDimensions(
                  video.videoWidth,
                  video.videoHeight,
                  imageSizeForChangeDetection
                );

              const captureCanvas = document.createElement("canvas");
              captureCanvas.width = captureWidth;
              captureCanvas.height = captureHeight;

              const captureCtx = captureCanvas.getContext("2d", {
                willReadFrequently: true,
              });

              if (captureCtx) {
                captureCtx.drawImage(video, 0, 0, captureWidth, captureHeight);

                // Mask PiP in final capture
                const currentPipDetails = get().pipDetailsGetter?.();
                if (currentPipDetails) {
                  maskPipWindow(
                    captureCtx,
                    currentPipDetails,
                    captureWidth,
                    captureHeight
                  );
                }

                // Post-processing
                const captureImageData = captureCtx.getImageData(
                  0,
                  0,
                  captureWidth,
                  captureHeight
                );
                detectAndMaskPopup(
                  captureImageData.data,
                  captureWidth,
                  captureHeight
                );
                captureCtx.putImageData(captureImageData, 0, 0);

                const scaledImageDataUrl =
                  captureCanvas.toDataURL("image/jpeg");

                // Generate full resolution image (original screen size)
                const nonScaledCanvas = document.createElement("canvas");
                nonScaledCanvas.width = video.videoWidth;
                nonScaledCanvas.height = video.videoHeight;
                const nonScaledCtx = nonScaledCanvas.getContext("2d", {
                  willReadFrequently: true,
                });

                let nonScaledImageDataUrl = "";
                if (nonScaledCtx) {
                  nonScaledCtx.drawImage(
                    video,
                    0,
                    0,
                    video.videoWidth,
                    video.videoHeight
                  );
                  nonScaledImageDataUrl =
                    nonScaledCanvas.toDataURL("image/jpeg");
                }

                callback(scaledImageDataUrl, nonScaledImageDataUrl);
              }

              // Update previousImageData to current state (using small scale)
              // so next check isn't immediately triggered by the same change
              const resetCanvas = document.createElement("canvas");
              resetCanvas.width = width;
              resetCanvas.height = height;
              const resetCtx = resetCanvas.getContext("2d", {
                willReadFrequently: true,
              });
              if (resetCtx) {
                resetCtx.drawImage(video, 0, 0, width, height);
                if (pipDetails)
                  maskPipWindow(resetCtx, pipDetails, width, height);
                const newSmallData = resetCtx.getImageData(0, 0, width, height);
                detectAndMaskPopup(newSmallData.data, width, height);
                previousImageData = newSmallData;
              }

              // Wait before resuming detection
              changeDetectionTimer = setTimeout(runDetection, captureDelayMs);
            }, captureDelayMs);

            return;
          }

          previousImageData = currentImageData;
          changeDetectionTimer = setTimeout(runDetection, checkIntervalMs);
        };

        // Start the loop
        changeDetectionTimer = setTimeout(runDetection, checkIntervalMs);
      };
    },

    stopChangeDetection: () => {
      if (changeDetectionTimer) {
        clearTimeout(changeDetectionTimer);
        changeDetectionTimer = null;
      }
      previousImageData = null;

      set({ changeDetectionEnabled: false, isChangeDetectionPaused: false });

      // Clean up video element if it exists
      const videos = document.querySelectorAll('video[style*="display: none"]');
      videos.forEach((v) => v.remove());
    },

    pauseChangeDetection: () => {
      const { changeDetectionEnabled } = get();
      if (!changeDetectionEnabled) return;

      set({ isChangeDetectionPaused: true });
    },

    resumeChangeDetection: () => {
      const { changeDetectionEnabled } = get();
      if (!changeDetectionEnabled) return;

      set({ isChangeDetectionPaused: false });
      previousImageData = null;
    },

    pauseChangeDetectionTemporarily: (durationMs: number = 200) => {
      const { changeDetectionEnabled } = get();
      if (!changeDetectionEnabled) return;

      if (temporaryPauseTimer) {
        clearTimeout(temporaryPauseTimer);
      }

      set({ isChangeDetectionPaused: true });

      temporaryPauseTimer = setTimeout(() => {
        set({ isChangeDetectionPaused: false });
        previousImageData = null;
        temporaryPauseTimer = null;
      }, durationMs);
    },
  };
});

const calculateImageDifference = (
  imageData1: ImageData,
  imageData2: ImageData
): number => {
  const data1 = imageData1.data;
  const data2 = imageData2.data;

  let differentPixels = 0;
  const totalPixels = imageData1.width * imageData1.height;

  const pixelThreshold = 10;

  for (let i = 0; i < data1.length; i += 4) {
    const rDiff = Math.abs(data1[i] - data2[i]);
    const gDiff = Math.abs(data1[i + 1] - data2[i + 1]);
    const bDiff = Math.abs(data1[i + 2] - data2[i + 2]);

    // If any color channel differs significantly, count as changed
    if (
      rDiff > pixelThreshold ||
      gDiff > pixelThreshold ||
      bDiff > pixelThreshold
    ) {
      differentPixels++;
    }
  }

  return (differentPixels / totalPixels) * 100;
};

const maskPipWindow = (
  ctx: CanvasRenderingContext2D,
  pipDetails: PipDetails,
  canvasWidth: number,
  canvasHeight: number
) => {
  if (!pipDetails.isActive || !pipDetails.isVisible) return;

  // Assume capturing the screen where the window is, or primary screen
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  // Scale factor from Screen CSS pixels to Canvas pixels
  // canvasWidth corresponds to the full screen width in the captured video (scaled)
  const scaleX = canvasWidth / screenWidth;
  const scaleY = canvasHeight / screenHeight;

  ctx.fillStyle = "black";
  ctx.fillRect(
    pipDetails.x * scaleX,
    pipDetails.y * scaleY,
    pipDetails.width * scaleX,
    pipDetails.height * scaleY
  );
};

const getScaledDimensions = (
  width: number,
  height: number,
  maxPixels: number
) => {
  const currentPixels = width * height;
  if (currentPixels > maxPixels) {
    const scaleFactor = Math.sqrt(maxPixels / currentPixels);
    return {
      width: Math.floor(width * scaleFactor),
      height: Math.floor(height * scaleFactor),
    };
  }
  return { width, height };
};

const detectAndMaskPopup = (
  data: Uint8ClampedArray,
  width: number,
  height: number
) => {
  // Static Heuristic: Assume the banner is always centered at the bottom
  // Standard Chrome "Sharing this tab" banner is roughly:
  // - Width: ~40-50% of screen width (depends on screen size, but usually centered)
  // - Height: ~50-60px
  // - Position: Fixed at bottom, ~10-20% from bottom edge depending on window size

  // We define a mask area relative to screen dimensions
  const maskWidth = Math.floor(width * 0.3); // Mask 45% of width in center
  const maskHeight = 100; // Fixed height in pixels (safe upper bound for banner + shadow)

  // Center X
  const maskX = Math.floor((width - maskWidth) / 2);

  // Position from bottom.
  // The banner usually sits above the bottom edge.
  // We'll mask a region from (Height - 150px) down to (Height - 30px) approximately,
  // or just mask a fixed zone from bottom-up if we assume it's always there.

  // More precise: The banner is usually ~15% up from the bottom.
  const maskY = Math.floor(height * 0.85);

  // Ensure we don't go out of bounds
  const startX = Math.max(0, maskX);
  const endX = Math.min(width, maskX + maskWidth);
  const startY = Math.max(0, maskY);
  const endY = Math.min(height, startY + maskHeight);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = 0; // R
      data[idx + 1] = 0; // G
      data[idx + 2] = 0; // B
    }
  }
};
