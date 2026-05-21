/**
 * Local MediaPipe asset URLs.
 *
 * Both the WASM bundle and the hand_landmarker model file ship inside
 * the renderer build output under `mediapipe/`. The actual files live
 * at `apps/desktop/src/renderer/public/mediapipe/` and Vite copies the
 * whole `public/` directory verbatim into `out/renderer/`.
 *
 * Resolving via `document.baseURI` ".." gives the renderer-root URL
 * in both modes:
 *   - dev:  `http://localhost:5173/{entry}/` → `..` → `http://localhost:5173/`
 *   - prod: `file:///…/out/renderer/{entry}/index.html` → `..` → `file:///…/out/renderer/`
 *
 * Loading from these URLs means Swoosh never touches the network for
 * hand tracking — per constitution principle I (Privacy is the Product).
 */

function rendererRootHref(): string {
  // document.baseURI is the URL of the current document. It's safe to
  // call this at module-eval time because each renderer entry's main
  // script is loaded after the HTML is parsed.
  return new URL('..', document.baseURI).href;
}

export const MEDIAPIPE_WASM_URL = `${rendererRootHref()}mediapipe/wasm`;

export const HAND_LANDMARKER_MODEL_URL = `${rendererRootHref()}mediapipe/models/hand_landmarker.task`;
