// Transcription provider contract.
// All voice-to-text adapters implement TranscriptionProvider. The webhook
// pipeline does not depend on a specific vendor; it only depends on this
// interface. Missing-configuration is a first-class outcome, not an exception.
// Ref: build-sheet-EXEC-AI-STAGE2-003 S4.

export interface TranscribeInput {
  audio: ArrayBuffer;
  mime_type: string;
  duration_seconds?: number;
  source_id: string;
}

export type TranscribeResult =
  | {
      ok: true;
      text: string;
      provider: string;
      language?: string;
      duration_ms?: number;
    }
  | {
      ok: false;
      provider: string;
      reason: string;
      retryable: boolean;
    };

export interface TranscriptionProvider {
  readonly name: string;
  readonly ready: boolean;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}

export interface TranscriptionEnv {
  TRANSCRIPTION_PROVIDER?: string;
  DEEPGRAM_API_KEY?: string;
  DEEPGRAM_MODEL?: string;
}
