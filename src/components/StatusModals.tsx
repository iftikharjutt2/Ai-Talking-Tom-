import React from 'react';
import type { TomVitalityStats } from '../game/tomState';

export interface StatusModalsProps {
  mode: 'paused' | 'gameover';
  stats: TomVitalityStats;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const StatusModals: React.FC<StatusModalsProps> = ({
  mode,
  stats,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  const isPaused = mode === 'paused';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isPaused ? 'Studio Paused' : 'Stage Complete Summary'}
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75"
    >
      <div className="w-full max-w-md bg-[#23192E] border-2 border-[#854D27] rounded-3xl p-6 md:p-8 shadow-2xl text-[#FBF7F0]">
        <div className="text-center mb-6">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">
            {isPaused ? 'STUDIO INTERMISSION' : 'STAGE COMPLETE · PURR-FECT RUN'}
          </div>
          <h2
            className="text-2xl md:text-3xl font-bold text-amber-100"
            style={{ fontFamily: "'Fredoka', sans-serif" }}
          >
            {isPaused ? 'Tom is Taking a Catnap' : 'Master Companion Milestone!'}
          </h2>
          <p className="text-sm text-[#CFC4E0] mt-1">
            {isPaused
              ? 'Take a breather or review your friendship stats below.'
              : 'You caught every mischievous toy mouse and shared wonderful conversations!'}
          </p>
        </div>

        {/* 3 Tabular-Nums Mastery Stat Tiles */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#181120] border border-[#4A385E] rounded-2xl p-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300/80">
              SCORE / BEST
            </div>
            <div
              className="text-xl font-bold text-white mt-1 tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.round(stats.friendshipPoints)} / {Math.round(stats.bestScore)}
            </div>
          </div>

          <div className="bg-[#181120] border border-[#4A385E] rounded-2xl p-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/80">
              CHATS HAD
            </div>
            <div
              className="text-xl font-bold text-white mt-1 tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.round(stats.conversationsCount)}
            </div>
          </div>

          <div className="bg-[#181120] border border-[#4A385E] rounded-2xl p-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300/80">
              MICE CAUGHT
            </div>
            <div
              className="text-xl font-bold text-white mt-1 tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.round(stats.miceCaught)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          {isPaused ? (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              Resume Session [Esc / P]
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              Play Again
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="py-2.5 px-4 rounded-xl bg-[#322440] hover:bg-[#3F2E52] border border-[#584370] text-xs font-semibold text-amber-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              Reset Stats [R]
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onReturnTitle();
              }}
              className="py-2.5 px-4 rounded-xl bg-[#322440] hover:bg-[#3F2E52] border border-[#584370] text-xs font-semibold text-amber-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              Title Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
