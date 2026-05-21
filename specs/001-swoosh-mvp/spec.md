# Feature Specification: Swoosh MVP

**Feature Branch**: `001-swoosh-mvp`

**Created**: 2026-05-21

**Status**: Approved

**Input**: User description: "Cross-platform desktop app that lets people control their computer with hand gestures via webcam — pinch to click, scroll, switch windows. Outlined hand overlay like Meta Quest. Configurable, system-tray resident, tutorial-first."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First-Run Tutorial That Teaches a Pinch-Click in Under 60 Seconds (Priority: P1) 🎯 MVP

A user installs Swoosh and launches it for the first time. The app
walks them through granting camera permission, picking which camera to
use, framing their hand in view, and successfully performing their
first pinch-click. By the end of the tutorial, they have moved the
system cursor and clicked at least one on-screen target without
touching the mouse.

**Why this priority**: This is Swoosh. Without a working tutorial-to-click
pipeline, nothing else matters — a user who can't get past first
launch has zero reason to discover any other feature. This is the
demoable MVP.

**Independent Test**: Install Swoosh on a fresh machine, launch it,
complete the tutorial, and verify the user has performed at least one
real OS-level click on a target outside the Swoosh window.

**Acceptance Scenarios**:

1. **Given** Swoosh has never been launched, **When** the user opens
   it, **Then** the tutorial window appears front-and-center, the
   system tray icon is registered, and the user is asked for camera
   permission with a clear "what we use this for" explanation.
2. **Given** camera permission is granted, **When** the user is shown
   the camera-picker step, **Then** they see a live thumbnail of each
   available camera and can select one with a single click or by
   pinching the on-screen camera card.
3. **Given** a camera is selected, **When** the user holds their hand
   in frame, **Then** an outlined hand overlay tracks their hand on
   screen within 200ms of first detection, and a "Nice — I can see
   your hand!" success state appears.
4. **Given** the hand overlay is visible, **When** the user pinches
   their thumb and index finger together while pointing at the
   tutorial's pulsing target, **Then** a click event fires on that
   target, a soft snap sound plays, and the tutorial advances to the
   next step.
5. **Given** the user has completed all tutorial steps, **When** the
   tutorial window closes, **Then** Swoosh continues running from the
   system tray with hand tracking active, and the user can
   immediately use pinch-click on any application.

---

### User Story 2 — Pinch-to-Click as a Background System Service (Priority: P1) 🎯 MVP

Once the tutorial is complete, Swoosh runs in the background and the
user can pinch to click anywhere in the operating system. Their hand
position drives the system cursor; pinching the thumb and index finger
together fires a left mouse-button click. Holding the pinch drags;
releasing the pinch drops. The app sits in the system tray and
exposes a "Pause Tracking" toggle.

**Why this priority**: Pinch-click is the single most important
gesture. Without it, there's no value beyond a tech demo. Ships
alongside US1 in the MVP cut.

**Independent Test**: With Swoosh running, open any application
(browser, text editor, file manager) and click on UI elements using
only pinch gestures. Drag a window title bar by pinching, moving the
hand, and releasing. Verify the system cursor follows hand position
in real time.

**Acceptance Scenarios**:

1. **Given** Swoosh is running with tracking active, **When** the
   user moves their open hand in front of the camera, **Then** the
   OS cursor follows the hand at 30+ FPS with smoothed motion.
2. **Given** the cursor is over a clickable element, **When** the user
   pinches thumb-and-index, **Then** a left-click event is dispatched
   to the OS, a snap sound plays, and the pinch point briefly glows
   in the overlay.
3. **Given** the user is pinching, **When** they move their hand
   while still pinched, **Then** a drag operation occurs (mouse down
   → move → mouse up on release).
4. **Given** Swoosh is tracking, **When** the user clicks the
   system-tray "Pause Tracking" item, **Then** tracking stops within
   200ms, the camera handle is released, the overlay disappears, and
   the tray icon shows the paused state.
5. **Given** tracking is paused, **When** the user clicks "Resume
   Tracking" or presses the global resume hotkey, **Then** tracking
   resumes within 500ms.

---

### User Story 3 — Two-Finger Pinch for Right-Click (Priority: P2)

The user can right-click on anything by pinching their thumb and
middle finger together (instead of thumb + index). The gesture is
distinct enough from a left-click that misfires are rare.

**Why this priority**: Right-click is essential for productivity
(context menus, "Open in new tab", file ops) but Swoosh is still
usable without it via the keyboard menu key.

**Independent Test**: Right-click on a desktop icon, a browser link,
and a file in the file manager using only the thumb+middle pinch.
Verify a context menu appears each time.

**Acceptance Scenarios**:

1. **Given** the cursor is over a right-clickable element, **When**
   the user pinches thumb-and-middle (index extended), **Then** a
   right-click is dispatched and the context menu appears.
2. **Given** the user is uncertain which finger they pinched,
   **When** the gesture is ambiguous (both index and middle close to
   thumb), **Then** the system favors the more-recently-extended
   finger and shows a brief hint in the overlay.

---

### User Story 4 — Open-Palm Scroll and Swipe (Priority: P2)

With an open palm facing the camera, the user can scroll vertically
by moving their hand up or down, and switch between application
windows or browser tabs by swiping their hand left or right with a
flick motion.

**Why this priority**: Scrolling is the second-most-used input after
clicking. Window/tab switching is icing that makes the experience
feel complete.

**Independent Test**: Open a long webpage. With Swoosh active, hold
an open palm to the camera and move it up/down to scroll. Then
perform a quick left swipe to switch to the previous browser tab.

**Acceptance Scenarios**:

1. **Given** the user's hand is open (all five fingers extended) and
   stationary, **When** they move the hand up or down, **Then** the
   focused application scrolls in that direction proportionally to
   hand speed, with smooth deceleration.
2. **Given** the user's hand is open, **When** they flick the hand
   left or right within ~200ms, **Then** Swoosh dispatches a
   ctrl+tab / ctrl+shift+tab (browser) or alt+tab / alt+shift+tab
   (window switching) depending on the focused app's type.
3. **Given** scrolling is active, **When** the user closes their
   hand to a fist or pinches, **Then** scrolling ends immediately.

---

### User Story 5 — Settings With Live Camera Preview (Priority: P2)

A settings panel accessible from the system tray exposes all
configurable behaviors: camera selection, sensitivity, pinch
threshold, sound on/off, hand-outline style, tutorial replay, and an
"Experimental Gestures" section. Crucially, the settings panel
includes a **live camera preview** with the hand overlay rendered on
top, so the user can adjust thresholds and immediately see the
effect on detection quality.

**Why this priority**: Without a settings panel, users are stuck
with defaults that may not work for their setup (small hands,
low-light room, off-axis camera). The live preview is what turns
"adjust until it works" from frustration into a single 30-second task.

**Independent Test**: Open Settings from the tray, change the pinch
sensitivity slider, see the threshold indicator on the live preview
update in real time, and confirm that pinches now register sooner or
later as expected.

**Acceptance Scenarios**:

1. **Given** Swoosh is running, **When** the user clicks the tray
   icon's "Settings" item, **Then** a settings window opens with a
   live camera preview pane occupying the top half of the window
   and configuration controls below.
2. **Given** the settings window is open, **When** the user adjusts
   the pinch-distance slider, **Then** the on-preview threshold ring
   on each fingertip resizes immediately to reflect the new value.
3. **Given** multiple cameras are connected, **When** the user
   switches the camera via the dropdown, **Then** the live preview
   swaps to the new feed within 1 second.
4. **Given** the user toggles "High Contrast Outline", **When** the
   change is applied, **Then** the hand overlay in both the preview
   and the desktop overlay switches style immediately, no restart
   needed.
5. **Given** the user clicks "Replay Tutorial", **When** confirmed,
   **Then** the tutorial window re-launches and walks them through
   the flow again.

---

### User Story 6 — Two-Hand Pinch to Resize Active Window (Priority: P3)

When both hands are visible and both are pinching, the user can
spread or close their hands to resize the currently focused window,
matching the reference Quest/Vision Pro interaction. Visual feedback
shows the two pinch points connected by a line with a resize
indicator.

**Why this priority**: Delightful and demoable, but not on the
critical path. Many users will rarely use it.

**Independent Test**: Open any resizable window. Pinch both hands
simultaneously, spread them apart — the window grows. Bring them
closer — it shrinks.

**Acceptance Scenarios**:

1. **Given** both hands are detected and both pinching, **When**
   the user moves them apart, **Then** the focused window grows
   from its center in proportion to the inter-hand distance change.
2. **Given** the two-hand pinch is active, **When** the user
   releases one pinch, **Then** resize mode exits and the window
   stays at its current size.
3. **Given** resize mode is active, **When** the hands move,
   **Then** a faint line is drawn between the two pinch points and
   a "↔ Resize" badge appears near the window's edge.

---

### User Story 7 — System Tray Resident With Quick Toggles (Priority: P2)

Swoosh lives in the system tray (Windows / Linux) or menu bar
(macOS). The tray icon visually indicates state: tracking active,
paused, or no-hand-detected. Clicking the icon opens a small popover
with quick toggles and links to Settings, Tutorial, and Quit.

**Why this priority**: Without a tray presence, users can't easily
pause tracking before screen-sharing or release the camera for
another app. This is table stakes for a background utility.

**Independent Test**: Right-click (OS-level) the tray icon —
options appear. Click "Pause" — tracking stops and the tray icon
state changes. Quit from the tray — Swoosh exits cleanly and the
camera handle is released.

**Acceptance Scenarios**:

1. **Given** Swoosh is launched, **When** the main window is closed,
   **Then** the app continues running in the tray and tracking
   continues unless paused.
2. **Given** the tray icon is right-clicked, **When** the menu
   appears, **Then** it includes: Pause/Resume, Settings, Replay
   Tutorial, About, Quit Swoosh.
3. **Given** the user selects Quit, **When** Swoosh exits, **Then**
   all camera handles, OS hooks, and tray entries are removed within
   1 second.

---

### User Story 8 — Adaptive Performance Benchmark (Priority: P3)

On first launch and on demand, Swoosh runs a quick benchmark to
determine the optimal camera resolution and FPS for the user's
hardware. The result is shown plainly ("Running at 60 FPS — Great!"
or "Running at 30 FPS — Adequate") and applied automatically.

**Why this priority**: The user-facing benefit is "it just works on
my machine". Static defaults handle 80% of cases; adaptive handles
the rest. Worth shipping but not blocking.

**Independent Test**: On a low-end machine (or with CPU throttled),
launch Swoosh. The benchmark picks 30 FPS. On a high-end machine,
it picks 60. The choice persists across launches.

**Acceptance Scenarios**:

1. **Given** Swoosh is launched for the first time, **When** the
   benchmark runs, **Then** it measures sustained tracking
   throughput for ~5 seconds and writes the chosen FPS/resolution
   to settings.
2. **Given** the user clicks "Re-run benchmark" in settings,
   **When** the benchmark completes, **Then** the new value is
   applied and a confirmation appears.

---

### User Story 9 — Auto-Update via GitHub Releases (Priority: P3)

Swoosh checks for updates from a configured GitHub Releases endpoint
on launch (debounced once per 24h) and prompts the user when a new
version is available. Update is one-click; rollback is supported.

**Why this priority**: Important for a real product, low priority
for the MVP demo.

**Independent Test**: Publish a higher-version release; launch
Swoosh on a machine with an older version; verify the update prompt
appears, the user can install, and the app restarts on the new
version.

---

### Edge Cases

- **No camera available**: Tutorial shows a clear "No camera
  detected" state with instructions to connect one. App remains
  installed and tray-resident; tracking stays off.
- **Camera permission denied**: Tutorial shows OS-specific
  instructions for granting permission and a "Try again" button.
- **Camera in use by another app**: Detected via error code; user
  sees "Camera is being used by [App]" message with retry.
- **Hand leaves frame**: Cursor freezes in place; no clicks fire
  until a hand re-enters. Overlay shows ghosted "Show me your hand"
  hint after 3s.
- **Both hands visible during single-hand gesture**: The hand whose
  pinch crossed the threshold most recently wins; the other is
  treated as visual only.
- **Pinch held longer than 5 seconds (drag-lock prevention)**:
  After 5s of continuous pinch with no significant motion, Swoosh
  auto-releases the drag and shows a hint.
- **Low light**: If MediaPipe confidence drops below threshold for
  3+ seconds, show a "Lighting too low?" hint with a "boost
  exposure" toggle.
- **Off-axis or partial hand**: Confidence-weighted; cursor freezes
  rather than jitters when confidence is poor.
- **Multi-monitor**: Hand position maps to whichever monitor the
  cursor was last on; explicit monitor switch via "swipe to next
  monitor" gesture (P3).
- **High-DPI / fractional scaling**: Cursor coordinates are in OS
  logical pixels, not pixel grid.
- **Sleep / lock screen**: Tracking auto-pauses on lock, resumes on
  unlock.
- **Camera disconnected mid-session**: Tracking pauses, tray icon
  shows "no camera" state, user is notified once.
- **Wayland without uinput permission**: Setup guide explains
  required permissions; tracking stays off until granted.

## Requirements *(mandatory)*

### Functional Requirements

#### Tracking & Gestures
- **FR-001**: System MUST detect a human hand in the camera feed and
  report 21 landmarks per hand at minimum 30 FPS on reference
  hardware.
- **FR-002**: System MUST classify pinch state (open / closed) per
  finger pair (thumb-index, thumb-middle) with hysteresis to
  prevent flicker.
- **FR-003**: System MUST map hand position in camera frame to OS
  cursor position with configurable smoothing (default 1-Euro
  filter with β=0.05, mincutoff=1.0).
- **FR-004**: System MUST dispatch OS-level mouse events (move,
  left click, right click, scroll, drag) via a native input layer.
- **FR-005**: System MUST support all four gestures defined in
  US2–US6 with documented pinch thresholds.

#### UI & Onboarding
- **FR-010**: System MUST render an outlined hand overlay on top of
  the desktop at 60 FPS when tracking is active.
- **FR-011**: System MUST show an interactive tutorial on first
  launch that culminates in a real pinch-click.
- **FR-012**: Users MUST be able to replay the tutorial from
  settings.
- **FR-013**: System MUST provide a settings panel with a live
  camera preview that renders the hand overlay on the preview.
- **FR-014**: System MUST allow the user to switch between any
  available camera devices and persist the choice.
- **FR-015**: System MUST use Baloo 2 as the primary UI typeface,
  loaded locally.

#### System Integration
- **FR-020**: System MUST register a system tray (Win/Linux) or
  menu bar (macOS) entry on launch.
- **FR-021**: System MUST support Pause/Resume of tracking via
  tray menu and a global hotkey (default Ctrl+Alt+Space, rebindable).
- **FR-022**: System MUST release the camera handle and stop OS
  event dispatch on pause within 200ms.
- **FR-023**: System MUST auto-pause when the OS reports lock /
  sleep / display-off.
- **FR-024**: System MUST start at login if the user opts in
  (toggleable in settings).
- **FR-025**: System MUST show a recording-indicator (tray badge
  + on-screen dot) whenever the camera is active.

#### Privacy & Data
- **FR-030**: System MUST NOT transmit camera frames, hand
  landmarks, or gesture events off-device.
- **FR-031**: System MUST NOT persist camera frames to disk by
  default.
- **FR-032**: System MUST allow the user to opt out of update
  checks.
- **FR-033**: System MUST log only locally to a rotating file
  under the user's app-data directory; logs are deletable from
  the settings panel.

#### Performance
- **FR-040**: Gesture-to-OS-event latency MUST be < 100ms p95 on
  reference hardware.
- **FR-041**: System MUST adapt camera resolution/FPS based on
  measured tracking throughput, with a one-time benchmark on first
  launch.
- **FR-042**: Idle (paused) CPU MUST be < 3%.
- **FR-043**: Memory footprint MUST be < 500MB.

#### Accessibility
- **FR-050**: All gesture sensitivity values MUST be user-adjustable.
- **FR-051**: System MUST provide a "Reduced Motion" toggle that
  disables overlay animations.
- **FR-052**: System MUST provide a "High Contrast" hand outline
  mode.
- **FR-053**: System MUST be operable end-to-end from the keyboard
  within the settings/tutorial UI.
- **FR-054**: Every two-hand gesture MUST have a documented
  single-hand fallback.

#### Distribution
- **FR-060**: System MUST be distributable as a signed installer
  (or unsigned dev build) for Windows (.exe), macOS (.dmg),
  Linux (.AppImage and .deb).
- **FR-061**: System SHOULD check GitHub Releases for updates on
  launch (debounced 24h) and prompt the user.

### Key Entities

- **CameraSource**: A discovered video input device. Attributes:
  device id, label, default resolution, default FPS, in-use flag.
- **HandLandmarks**: A 21-point skeletal representation of a
  detected hand. Attributes: frame timestamp, landmark coordinates
  (normalized 0..1), per-landmark confidence, handedness.
- **Gesture**: A classified intent emitted by the gesture state
  machine. Variants: PinchClick, RightClick, ScrollUp/Down,
  SwipeLeft/Right, TwoHandResize, OpenPalm, Idle.
- **InputEvent**: An OS-level event Swoosh dispatches. Variants:
  MouseMove, MouseDown, MouseUp, MouseClick (left/right), Scroll,
  Hotkey.
- **UserSettings**: Persisted configuration. Includes camera id,
  pinch threshold, smoothing, sound volume, sound on/off, outline
  style, tutorial-seen flag, autostart flag, hotkey bindings,
  performance profile (resolution+FPS), reduced motion,
  high-contrast, update-check enabled.
- **TutorialProgress**: Per-step completion state for first-run
  walkthrough. Includes: cameraGranted, cameraSelected, handSeen,
  firstPinchClicked, completed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 90% of first-time users complete the tutorial
  (reach a successful pinch-click) within 60 seconds of launching
  Swoosh.
- **SC-002**: Gesture-to-OS-event latency stays under 100ms p95
  on reference hardware (Intel UHD 620 / Apple M1) during a
  10-minute usage session.
- **SC-003**: 99% of pinch attempts performed within the on-screen
  hint area are detected and dispatched as the correct mouse event
  (no false negative; no incorrect-button misfire).
- **SC-004**: Idle CPU usage measured over 30 seconds with
  tracking paused is < 3% on reference hardware.
- **SC-005**: Active CPU usage with tracking on at the
  benchmark-selected FPS is < 25% on reference hardware.
- **SC-006**: A user can pause tracking from the tray and the
  camera LED turns off within 200ms.
- **SC-007**: On a fresh install, the user reaches their first
  pinch-click on a real OS target without reading any text
  outside the app.
- **SC-008**: Settings changes (sensitivity, sound, outline style)
  take effect immediately, with no app restart needed, 100% of
  the time.
- **SC-009**: All four MVP gestures (left click, right click,
  scroll, two-hand resize) work identically on Windows 11,
  macOS 13+, Ubuntu 22.04 X11, and Ubuntu 22.04 Wayland.

## Assumptions

- Users have a built-in or USB webcam capable of at least 480p @
  30 FPS in adequate lighting.
- Users have a multi-core CPU produced after 2018 and at least
  8 GB RAM.
- Users have administrator/sudo rights to grant camera and
  accessibility permissions during install/first run.
- On Linux Wayland, users have (or can install) `uinput` access
  via the `input` group; Swoosh provides setup instructions but
  does not modify system permissions automatically.
- Code signing certificates (Apple Developer ID, Windows EV cert)
  are out of scope for the first dev cut; unsigned builds are
  acceptable for early users. Signed builds become a release-blocker
  before public 1.0.
- The reference hardware for performance baselining is: a 2020-era
  laptop with Intel UHD 620 graphics, 8 GB RAM, integrated webcam.
- MediaPipe Hands (via `@mediapipe/tasks-vision`) is sufficient
  for the gesture set in v1; custom ML models are out of scope.
