# Sonic Prism visualizer

`/visualizer` embeds `public/visualizer/index.html`. The WebGL app has seven worlds, local-file playback, tab/system audio capture and Spotify playback/transport.

## Audio contract

Only local-file PCM or an explicitly shared audio stream drives the analyzer. Spotify metadata and playback events are not PCM: an uncaptured Spotify player displays a waiting state, not synthetic visualization. The old title-derived tempo, generated fallback spectrum and independently looping preview-buffer analysis were removed.

The analyzer connects through a zero-gain sink so capture is processed without playing it again. Local files have their own audible destination connection. Shared audio can coexist with Spotify controls in either selection order. Stopping/replacing capture stops tracks and disconnects the graph; a stale ended event cannot stop the replacement stream. The picker explicitly includes the current tab for embedded Spotify. Capture still requires browser support and the user's permission each time.

`audio-reactivity.mjs` extracts sample-rate-aware frequency ranges, RMS level, onset pulses and approximate tempo from real samples. These are frequency bands, not source-separated instruments. The GPU spectrum uses logarithmic 30 Hz–16 kHz spacing; silence gates spectrum to zero and waveform to its midpoint. Status has a 450 ms hold across brief musical gaps. Shader motion slows in idle preview and pauses when input is unavailable or paused. Rendering has a two-million-pixel budget.

## Interface

A single bottom dock holds world selection, sources and transport. Customize and Spotify stay in secondary drawers. Signal status, a level meter, optional band details and Stop sharing audio distinguish real input from ambient movement. File input and world tabs support keyboard operation; Focus mode is reversible with Escape or Show controls.

Spotify playback shows a prominent Connect Spotify audio banner beside transport until shared audio is available. The button directly opens the browser picker on a user click; playback events never open it automatically. Instructions name this Sonic Prism tab, Share tab audio, and Share. Cancellation and video-only shares preserve Spotify playback and show retry instructions. Unsupported browsers explain that Spotify playback and audio capture are separate capabilities. Captured-but-quiet input shows reconnection guidance after three seconds; muted tracks cannot create a live signal. The capture request includes the nonmandatory restrictOwnAudio:false hint to include this page's playback.

## Validation, October 31, 2026

`npm run visualizer:test`: 28 tests pass. Generated PCM tones at 44.1, 48 and 96 kHz check band response, silence, onset-based tempo and bass/treble texture coverage. The full-app runtime harness checks audio-to-GPU uniforms, source replacement/cleanup, both Spotify/capture selection orders, errors, pause, stopped capture and honest waiting states. The harness mocks browser APIs and does not validate physical capture or Spotify authentication.

The production build passes. Native Chrome visual checks verified the redesigned desktop, scene switching and real local WAV playback: a 900 Hz tone produced a concentrated spectrum and a measured -25 dB live signal; a silent passage stayed flat during playback, and Pause reported paused. OS capture permission and authenticated Spotify playback were not exercised. Real mobile hardware remains untested.

Spotify connection follow-up: regression checks cover the guided connection, cancellation/retry, unsupported capture APIs, audio-less shares, muted tracks and a blocked AudioContext. The new banner's browser spot-check was unavailable because native automation could not verify the newly opened tab URL; the earlier rendered-audio checks above predate the banner.
