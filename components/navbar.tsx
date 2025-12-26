"use client";

import { useState } from "react";
import { Github, Cpu, Users } from "@geist-ui/icons";
import { ForTeamsModal } from "./for-teams-modal";

interface NavbarProps {
  githubStars: number;
  openSettings: () => void;
  showLocalMode?: boolean;
  grayMode?: boolean;
  showForTeams?: boolean;
}

export function Navbar({
  githubStars,
  openSettings,
  showLocalMode = true,
  grayMode = false,
  showForTeams = false,
}: NavbarProps) {
  const [isForTeamsOpen, setIsForTeamsOpen] = useState(false);

  return (
    <>
      <div className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-2">
          <img src="/logo.png" className="h-[26px] md:h-[26px] w-auto" />
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/bullmeza/screen.vision"
            target="_blank"
            className={`flex items-center gap-1.5 md:gap-2 px-2 py-1 md:px-3 md:py-1.5 border border-gray-300 rounded-lg transition-colors ${
              grayMode
                ? "hover:bg-gray-50"
                : "bg-black text-white hover:bg-gray-700"
            }`}
          >
            <Github size={14} className="md:w-4 md:h-4" />
            <span className="text-xs md:text-sm">Star on GitHub</span>
            <span
              className={`text-[10px] md:text-xs font-medium px-1 md:px-1.5 py-0.5 rounded-md ${
                grayMode ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-black"
              }`}
            >
              {githubStars >= 1000
                ? `${(githubStars / 1000).toFixed(1)}k`
                : githubStars}
            </span>
          </a>

          {showForTeams && (
            <button
              onClick={() => setIsForTeamsOpen(true)}
              className="flex items-center gap-1.5 md:gap-2 px-2 py-1 md:px-3 md:py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Users size={14} className="md:w-4 md:h-4" />
              <span className="text-xs md:text-sm">For Teams</span>
            </button>
          )}

          {showLocalMode && (
            <button
              onClick={openSettings}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Cpu size={16} />
              <span className="text-sm">Local Mode</span>
            </button>
          )}
        </div>
      </div>

      <ForTeamsModal
        isOpen={isForTeamsOpen}
        onClose={() => setIsForTeamsOpen(false)}
      />
    </>
  );
}
