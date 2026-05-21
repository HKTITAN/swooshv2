/**
 * TutorialShell — five-step onboarding sequence.
 *
 *   Welcome → Permission → CameraPick → HandFraming → FirstClick
 *
 * Step gating: each step exposes a `canAdvance` flag (via the
 * useTutorialStep hook); the Next button stays disabled until that
 * step's requirements are satisfied. Steps animate in/out with
 * framer-motion (skipped under prefers-reduced-motion).
 *
 * On FirstClick success, we call `window.swoosh.tutorial.complete()`
 * which persists `tutorialSeen = true` and tells main to open the
 * overlay.
 */

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../shared-ui/components/Button';
import { Welcome } from './steps/Welcome';
import { Permission } from './steps/Permission';
import { CameraPick } from './steps/CameraPick';
import { HandFraming } from './steps/HandFraming';
import { FirstClick } from './steps/FirstClick';

export type TutorialStepKey = 'welcome' | 'permission' | 'camera' | 'framing' | 'click';

const STEP_ORDER: TutorialStepKey[] = ['welcome', 'permission', 'camera', 'framing', 'click'];

export interface TutorialContext {
  /** Whether the camera permission has been granted. */
  permissionGranted: boolean;
  setPermissionGranted: (next: boolean) => void;
  /** Persisted camera device ID. */
  cameraId: string | null;
  setCameraId: (id: string | null) => void;
  /** Tracked frames where a hand has been seen with score ≥ 0.7. */
  handDetectedFrames: number;
  setHandDetectedFrames: (n: number) => void;
}

function StepIndicator({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex justify-center gap-2" role="presentation">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            'h-2 w-2 rounded-full transition-colors duration-300 ' +
            (i === index
              ? 'bg-swoosh-400 shadow-glow'
              : i < index
                ? 'bg-swoosh-600'
                : 'bg-ink-700')
          }
        />
      ))}
    </div>
  );
}

export function TutorialShell() {
  const [stepIdx, setStepIdx] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [handDetectedFrames, setHandDetectedFrames] = useState(0);

  const ctx: TutorialContext = useMemo(
    () => ({
      permissionGranted,
      setPermissionGranted,
      cameraId,
      setCameraId,
      handDetectedFrames,
      setHandDetectedFrames,
    }),
    [permissionGranted, cameraId, handDetectedFrames],
  );

  const stepKey = STEP_ORDER[stepIdx]!;

  const canAdvance = useMemo(() => {
    switch (stepKey) {
      case 'welcome':
        return true;
      case 'permission':
        return permissionGranted;
      case 'camera':
        return cameraId !== null;
      case 'framing':
        return handDetectedFrames >= 30;
      case 'click':
        // Advancing past the click step is owned by the step itself
        // (it triggers `complete` once a real click lands on target).
        return false;
    }
  }, [stepKey, permissionGranted, cameraId, handDetectedFrames]);

  const goBack = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setStepIdx((i) => Math.min(STEP_ORDER.length - 1, i + 1));
  }, []);

  const onComplete = useCallback(async () => {
    try {
      await window.swoosh.tutorial.complete();
    } catch (err) {
      console.error('tutorial.complete failed', err);
    }
  }, []);

  return (
    <div className="flex h-full flex-col bg-ink-950 text-fg">
      <header className="px-8 py-6">
        <StepIndicator index={stepIdx} total={STEP_ORDER.length} />
      </header>
      <main className="flex flex-1 items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl"
          >
            {stepKey === 'welcome' && <Welcome />}
            {stepKey === 'permission' && <Permission ctx={ctx} />}
            {stepKey === 'camera' && <CameraPick ctx={ctx} />}
            {stepKey === 'framing' && <HandFraming ctx={ctx} />}
            {stepKey === 'click' && <FirstClick ctx={ctx} onSuccess={onComplete} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="flex items-center justify-between px-8 py-6">
        <Button
          variant="ghost"
          size="md"
          onClick={goBack}
          disabled={stepIdx === 0}
          aria-label="Back"
        >
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={goNext}
          disabled={!canAdvance || stepIdx === STEP_ORDER.length - 1}
          aria-label="Next"
        >
          {stepIdx === 0 ? "Let's go" : 'Next'}
        </Button>
      </footer>
    </div>
  );
}
