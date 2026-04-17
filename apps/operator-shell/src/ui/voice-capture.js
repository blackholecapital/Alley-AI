/**
 * voice-capture.js — Browser mic permission, recording state, and audio send.
 *
 * State machine:
 *   idle        — default; no capture in progress
 *   requesting  — getUserMedia call in flight; browser permission prompt shown
 *   recording   — mic open, MediaRecorder active
 *   processing  — MediaRecorder stopped, audio uploading to backend
 *   sent        — upload complete (ok or failed); auto-resets to idle after 3 s
 *   denied      — permission was denied (NotAllowedError / NotFoundError)
 *   unsupported — getUserMedia or MediaRecorder unavailable in this browser
 *   error       — unexpected runtime failure
 *
 * Endpoint:
 *   POST /voice/capture
 *     Body:    multipart/form-data, field "audio", filename "recording.webm"
 *     Success: { ok: true, session_id?: string }
 *     Failure: { ok: false, error: { code: string, message: string } }
 */

'use strict';

const VOICE_ENDPOINT = '/voice/capture';

let _state = 'idle';
let _stream = null;
let _recorder = null;
let _chunks = [];
let _onStateChange = null;

/**
 * Returns true if the current browser supports getUserMedia + MediaRecorder.
 * HTTPS is required for getUserMedia on most browsers.
 */
function isSupported() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices != null &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

function getState() {
  return _state;
}

/** Register a callback invoked on every state transition: cb(state, extra|null). */
function onStateChange(cb) {
  _onStateChange = cb;
}

function _setState(next, extra) {
  _state = next;
  if (_onStateChange) _onStateChange(next, extra != null ? extra : null);
}

/**
 * Request mic permission and start recording.
 * No-op if already in any non-idle state.
 * If the browser is unsupported, transitions to 'unsupported' immediately.
 */
async function startCapture() {
  if (!isSupported()) {
    _setState('unsupported', null);
    return;
  }
  // Allow retry from denied/error states by treating them as idle
  if (_state !== 'idle' && _state !== 'denied' && _state !== 'error') return;

  _setState('requesting', null);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      _setState('denied', null);
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      _setState('denied', { message: 'No microphone found.' });
    } else {
      _setState('error', { message: err ? err.message : 'getUserMedia failed.' });
    }
    return;
  }

  _stream = stream;
  _chunks = [];

  const mimeType = _pickMimeType();
  let recorder;
  try {
    recorder = new MediaRecorder(_stream, mimeType ? { mimeType } : {});
  } catch (err) {
    _stopStream();
    _setState('error', { message: 'MediaRecorder initialisation failed.' });
    return;
  }
  _recorder = recorder;

  _recorder.addEventListener('dataavailable', (e) => {
    if (e.data && e.data.size > 0) _chunks.push(e.data);
  });

  _recorder.start();
  _setState('recording', null);
}

/**
 * Stop the active recording and POST the audio blob to /voice/capture.
 * Returns the send result: { ok: true } or { ok: false, error: { code, message } }.
 * No-op if not currently recording.
 */
async function stopAndSend() {
  if (_state !== 'recording' || !_recorder) return null;

  await _stopRecorder();
  _stopStream();

  const blob = new Blob(_chunks, { type: _recorder.mimeType || 'audio/webm' });
  _chunks = [];
  _recorder = null;

  _setState('processing', null);
  const result = await _sendAudio(blob);
  _setState('sent', result);
  setTimeout(() => _setState('idle', null), 3000);
  return result;
}

/**
 * Abort an in-progress recording without sending.
 * Safe to call from any state; always returns to idle.
 */
function cancelCapture() {
  if (_recorder && _recorder.state !== 'inactive') {
    _recorder.stop();
  }
  _stopStream();
  _chunks = [];
  _recorder = null;
  _setState('idle', null);
}

// ── private helpers ────────────────────────────────────────────────────────

function _stopRecorder() {
  return new Promise((resolve) => {
    if (!_recorder || _recorder.state === 'inactive') {
      resolve();
      return;
    }
    _recorder.addEventListener('stop', resolve, { once: true });
    _recorder.stop();
  });
}

function _stopStream() {
  if (_stream) {
    _stream.getTracks().forEach((t) => t.stop());
    _stream = null;
  }
}

/** Pick the best supported MIME type in preference order. */
function _pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

async function _sendAudio(blob) {
  try {
    const form = new FormData();
    form.append('audio', blob, 'recording.webm');
    const res = await fetch(VOICE_ENDPOINT, { method: 'POST', body: form });
    if (!res.ok) {
      return { ok: false, error: { code: `http_${res.status}`, message: `HTTP ${res.status}` } };
    }
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true) {
      return { ok: false, error: { code: 'bad_response', message: 'Unexpected response from voice endpoint.' } };
    }
    return { ok: true, session_id: data.session_id ?? null };
  } catch (err) {
    return {
      ok: false,
      error: { code: 'network', message: err ? err.message : 'Network error.' },
    };
  }
}

export {
  VOICE_ENDPOINT,
  isSupported,
  getState,
  onStateChange,
  startCapture,
  stopAndSend,
  cancelCapture,
};
