/**
 * Tutorial entry — mounts the React tree into #root.
 *
 * The shell is a small step machine. Each step is independently
 * gated by its requirements (e.g., Permission step blocks Next until
 * getUserMedia succeeds). On the final step's success, we tell the
 * main process to close the tutorial and open the overlay.
 */

import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { TutorialShell } from './TutorialShell';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <TutorialShell />
    </StrictMode>,
  );
}
