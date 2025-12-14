import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/navbar";
import { TaskProvider } from "./providers/TaskProvider";
import { AnalyticsProvider } from "./providers/AnalyticsProvider";
import { SettingsProvider } from "./providers/SettingsProvider";
import { Inter } from "next/font/google";
import { PostHogProvider } from "./providers/PosthogProvider";

export const metadata = {
  title: "Screen Vision",
  description: "Share your screen and let AI walk you through the solution",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  // openGraph: {
  //   images: [
  //     {
  //       url: "/og?title=Screen Vision",
  //     },
  //   ],
  // },
  // twitter: {
  //   card: "summary_large_image",
  //   images: [
  //     {
  //       url: "/og?title=Screen Vision",
  //     },
  //   ],
  // },
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
        <PostHogProvider>
          <AnalyticsProvider>
            <SettingsProvider>
              <TaskProvider>{children}</TaskProvider>
            </SettingsProvider>
          </AnalyticsProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
