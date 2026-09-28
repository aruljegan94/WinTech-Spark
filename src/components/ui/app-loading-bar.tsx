'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface AppLoadingBarProps {
  message?: string;
  isComplete?: boolean;
}

export function AppLoadingBar({
  message = 'Starting WinTech-Spark...',
  isComplete = false,
}: AppLoadingBarProps) {
  const [percent, setPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>(message);

  useEffect(() => {
    let currentPercent = 0;
    let timer: NodeJS.Timeout | null = null;

    if (isComplete) {
      setPercent(100);
      setStatusMessage('Ready!');
      return;
    }

    // Smooth progress simulation that rapidly advances then eases
    const updateProgress = () => {
      // Step sizes gradually diminish as percent approaches 95%
      let increment = 0;
      if (currentPercent < 30) {
        increment = Math.floor(Math.random() * 8) + 6; // +6 to 13
      } else if (currentPercent < 60) {
        increment = Math.floor(Math.random() * 6) + 4; // +4 to 9
      } else if (currentPercent < 85) {
        increment = Math.floor(Math.random() * 4) + 2; // +2 to 5
      } else if (currentPercent < 95) {
        increment = 1;
      } else {
        increment = 0;
      }

      currentPercent = Math.min(currentPercent + increment, 97);
      setPercent(currentPercent);

      // Contextual status text based on progress
      if (currentPercent < 35) {
        setStatusMessage(message || 'Initializing system...');
      } else if (currentPercent < 75) {
        setStatusMessage('Syncing services & authentication...');
      } else if (currentPercent < 95) {
        setStatusMessage('Loading workspace...');
      }

      if (currentPercent < 95) {
        const delay = currentPercent < 50 ? 60 : 120;
        timer = setTimeout(updateProgress, delay);
      }
    };

    timer = setTimeout(updateProgress, 30);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isComplete, message]);

  // If marked complete from outside, animate smoothly to 100%
  useEffect(() => {
    if (isComplete) {
      setPercent(100);
      setStatusMessage('Ready!');
    }
  }, [isComplete]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading application"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-zinc-950 px-4 select-none"
    >
      {/* Background Soft Red Radial Ambient Glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-500/10 via-rose-500/5 to-transparent blur-2xl" />

      <div className="relative w-full max-w-sm flex flex-col items-center text-center space-y-6">
        {/* Brand Icon & Name */}
        <div className="flex flex-col items-center space-y-3">
          <div className="relative p-3 rounded-2xl bg-white dark:bg-zinc-900 border-2 border-red-500/30 shadow-lg shadow-red-500/10 flex items-center justify-center">
            <Image
              src="/logo.png"
              width={40}
              height={40}
              alt="WinTech-Spark Logo"
              className="h-10 w-10 object-contain drop-shadow"
              priority
            />
          </div>

          <div className="flex flex-col items-center">
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-[#F62440] to-rose-600">
              WinTech-Spark
            </h1>
            <p className="text-xs font-medium text-muted-foreground mt-0.5 tracking-wider uppercase">
              Automobile Shop Management
            </p>
          </div>
        </div>

        {/* Red & White Loading Bar & Percentage */}
        <div className="w-full space-y-2">
          {/* Progress Track & Animated Fill */}
          <div className="relative h-3.5 w-full bg-white dark:bg-zinc-900 rounded-full border border-red-300 dark:border-red-900/60 p-0.5 overflow-hidden shadow-sm shadow-red-500/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-600 via-[#F62440] to-rose-500 shadow-[0_0_12px_rgba(246,36,64,0.5)] transition-all duration-150 ease-out relative overflow-hidden"
              style={{ width: `${percent}%` }}
            >
              {/* Shimmer sweep effect inside the red bar */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-[shimmer_1.5s_infinite] -skew-x-12" />
            </div>
          </div>

          {/* Status Label & Bold Red Percentage */}
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground font-medium truncate max-w-[240px]">
              {statusMessage}
            </span>
            <span className="font-extrabold text-[#F62440] text-sm tabular-nums tracking-tight">
              {percent}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
