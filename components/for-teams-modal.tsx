"use client";

import { useState } from "react";
import { X } from "@geist-ui/icons";
import { usePostHog } from "posthog-js/react";
import { Button } from "./ui/button";

interface ForTeamsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ForTeamsModal({ isOpen, onClose }: ForTeamsModalProps) {
  const posthog = usePostHog();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !role.trim()) return;

    setIsSubmitting(true);

    posthog.capture("for_teams_inquiry", {
      email: email.trim(),
      role: role.trim(),
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  const handleClose = () => {
    setEmail("");
    setRole("");
    setIsSubmitted(false);
    onClose();
  };

  const canSubmit = email.trim() && role.trim() && !isSubmitting;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">For Teams</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {isSubmitted ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Thank you!
              </h3>
              <p className="text-gray-600">We&apos;ll be in touch soon.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Interested in Screen Vision for your team? Leave your details
                and we&apos;ll get in touch.
              </p>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Company Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=""
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Your Role
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder=""
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
                />
              </div>
            </>
          )}

          <div className="p-3 rounded-xl text-sm bg-gray-50 text-gray-600">
            You can also contact us at{" "}
            <a
              href="mailto:mail@screen.vision"
              className="text-black font-medium hover:underline"
            >
              mail@screen.vision
            </a>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          {isSubmitted ? (
            <Button
              onClick={handleClose}
              className="px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800"
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
