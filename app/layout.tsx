import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { TaskProvider } from "./providers/TaskProvider";
import { AnalyticsProvider } from "./providers/AnalyticsProvider";
import { SettingsProvider } from "./providers/SettingsProvider";
import { Inter } from "next/font/google";
import { PostHogProvider } from "./providers/PosthogProvider";
import { ChunkErrorHandler } from "./providers/ChunkErrorHandler";

export const metadata = {
  metadataBase: new URL("https://screen.vision"),
  title: "Screen Vision",
  description:
    "Share your screen with AI. Get a guided tour for anything, right on your screen.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={cn(
          GeistSans.className,
          inter.variable,
          "antialiased dark",
          "bg-background"
        )}
      >
        <Toaster position="top-center" richColors />
        <ChunkErrorHandler>
          <PostHogProvider>
            <AnalyticsProvider>
              <SettingsProvider>
                <TaskProvider>{children}</TaskProvider>
              </SettingsProvider>
            </AnalyticsProvider>
          </PostHogProvider>
        </ChunkErrorHandler>
      </body>
    </html>
  );
}
