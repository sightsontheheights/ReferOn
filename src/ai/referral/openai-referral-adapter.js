import { buildReferralGenerationInput, REFERRAL_PROMPT_VERSION } from './prompt-builder.js';
import {
  assertValidReferralGenerationResponse,
  getOpenAIResponseFormat
} from './referral-generation.schema.js';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_REFERRAL_MODEL = 'gpt-5.5';

export class OpenAIReferralAdapter {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_REFERRAL_MODEL ?? DEFAULT_REFERRAL_MODEL,
    baseUrl = process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  async generateReferralAnalysis(input) {
    this.#assertConfigured();

    const requestBody = {
      model: this.model,
      input: buildReferralGenerationInput(input),
      text: {
        format: getOpenAIResponseFormat()
      }
    };

    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseJson = await safeReadJson(response);
    if (!response.ok) {
      throw new OpenAIReferralAdapterError(
        `OpenAI referral generation request failed with status ${response.status}`,
        { status: response.status, response: responseJson }
      );
    }

    const parsed = parseReferralGenerationOutput(responseJson);
    assertValidReferralGenerationResponse(parsed);

    return {
      ...parsed,
      metadata: {
        openaiResponseId: responseJson.id ?? null,
        model: responseJson.model ?? this.model,
        promptVersion: REFERRAL_PROMPT_VERSION
      }
    };
  }

  #assertConfigured() {
    if (!this.apiKey) {
      throw new OpenAIReferralAdapterError('OPENAI_API_KEY is required for referral generation');
    }
    if (!this.fetchImpl) {
      throw new OpenAIReferralAdapterError('A fetch implementation is required for referral generation');
    }
  }
}

export function parseReferralGenerationOutput(responseJson) {
  const outputText = extractOutputText(responseJson);
  if (!outputText) {
    throw new OpenAIReferralAdapterError('OpenAI response did not include output text', { response: responseJson });
  }

  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new OpenAIReferralAdapterError('OpenAI response output was not valid JSON', {
      cause: error,
      outputText
    });
  }
}

export function extractOutputText(responseJson) {
  if (typeof responseJson?.output_text === 'string') {
    return responseJson.output_text;
  }

  const output = responseJson?.output;
  if (!Array.isArray(output)) {
    return null;
  }

  const textParts = [];
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (typeof part?.text === 'string' && (part.type === 'output_text' || part.type === 'text')) {
        textParts.push(part.text);
      }
    }
  }

  return textParts.length > 0 ? textParts.join('') : null;
}

export class OpenAIReferralAdapterError extends Error {
  constructor(message, details = {}) {
    super(message, { cause: details.cause });
    this.name = 'OpenAIReferralAdapterError';
    this.details = details;
  }
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
