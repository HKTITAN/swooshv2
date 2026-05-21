/**
 * Welcome — the very first tutorial screen.
 *
 * Sets the tone: bold Baloo extrabold headline, animated hand
 * illustration, one-line value prop. The "Let's go" CTA is rendered
 * in the shell footer (it's the same Next button every step uses).
 */

import { AnimatedHand } from '../../shared-ui/components/AnimatedHand';

export function Welcome() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <AnimatedHand size={144} />
      <h1 className="text-5xl font-extrabold tracking-tight text-fg">
        Hi, I&apos;m Swoosh.
      </h1>
      <p className="max-w-md text-xl font-semibold text-fg-mute">
        I turn your webcam into a hand-tracker. Pinch to click. Wave to scroll.
        No mouse required.
      </p>
      <p className="text-base font-semibold text-fg-dim">
        We&apos;ll get you to your first pinch-click in under a minute.
      </p>
    </div>
  );
}
