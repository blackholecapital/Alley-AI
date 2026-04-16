// Transcription provider factory and adapters.
// Resolves the configured provider at call time from env and returns a
// concrete TranscriptionProvider. Ships with:
//   - NoopTranscriptionProvider   (safe default; reports unconfigured)
//   - DeepgramTranscriptionProvider (real-ready; requires DEEPGRAM_API_KEY)
// Ref: build-sheet-EXEC-AI-STAGE2-003 S4. Deepgram reference noted in
// build sheet reference_materials.

import type {
  TranscribeInput,
  TranscribeResult,
  TranscriptionEnv,
  TranscriptionProvider,
} from './provider';

export class NoopTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'noop';
  readonly ready = false;

  async transcribe(_input: TranscribeInput): Promise<TranscribeResult> {
    return {
      ok: false,
      provider: this.name,
      reason: 'no transcription provider configured',
      retryable: false,
    };
  }
}

interface DeepgramChannelAlternative {
  transcript?: string;
}

interface DeepgramChannel {
  alternatives?: DeepgramChannelAlternative[];
  detected_language?: string;
}

interface DeepgramResults {
  channels?: DeepgramChannel[];
}

interface DeepgramResponse {
  results?: DeepgramResults;
  err_code?: string;
  err_msg?: string;
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'deepgram';
  readonly ready: boolean;

  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string = 'nova-2') {
    this.apiKey = apiKey;
    this.model = model;
    this.ready = Boolean(apiKey);
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    if (!this.ready) {
      return {
        ok: false,
        provider: this.name,
        reason: 'missing DEEPGRAM_API_KEY',
        retryable: false,
      };
    }

    const params = new URLSearchParams({
      model: this.model,
      smart_format: 'true',
      punctuate: 'true',
    });
    const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': input.mime_type,
        },
        body: input.audio,
      });
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        reason: err instanceof Error ? err.message : 'network error',
        retryable: true,
      };
    }

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        // ignore
      }
      return {
        ok: false,
        provider: this.name,
        reason: `deepgram ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    let payload: DeepgramResponse;
    try {
      payload = (await response.json()) as DeepgramResponse;
    } catch {
      return {
        ok: false,
        provider: this.name,
        reason: 'non-json response from deepgram',
        retryable: true,
      };
    }

    const channel = payload.results?.channels?.[0];
    const text = channel?.alternatives?.[0]?.transcript;
    if (typeof text !== 'string' || text.trim().length === 0) {
      return {
        ok: false,
        provider: this.name,
        reason: 'empty transcript',
        retryable: false,
      };
    }

    return {
      ok: true,
      provider: this.name,
      text,
      language: channel?.detected_language,
      duration_ms: Date.now() - startedAt,
    };
  }
}

export function getTranscriptionProvider(env: TranscriptionEnv): TranscriptionProvider {
  const chosen = (env.TRANSCRIPTION_PROVIDER ?? '').toLowerCase().trim();

  if (chosen === 'deepgram' || (chosen === '' && env.DEEPGRAM_API_KEY)) {
    return new DeepgramTranscriptionProvider(
      env.DEEPGRAM_API_KEY ?? '',
      env.DEEPGRAM_MODEL ?? 'nova-2',
    );
  }

  if (chosen === 'noop' || chosen === '') {
    return new NoopTranscriptionProvider();
  }

  return new NoopTranscriptionProvider();
}

export type {
  TranscribeInput,
  TranscribeResult,
  TranscriptionEnv,
  TranscriptionProvider,
} from './provider';
