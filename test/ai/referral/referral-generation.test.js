import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OpenAIReferralAdapter,
  buildReferralGenerationInput,
  extractOutputText,
  validateReferralGenerationResponse
} from '../../../src/ai/referral/index.js';

const validReferralResponse = {
  patientId: 'patient-1',
  chartSummary: {
    summary: 'Persistent knee pain after conservative management.',
    relevantHistory: [
      {
        chartEntryId: 'chart-1',
        date: '2026-06-01',
        title: 'Primary care visit',
        summary: 'Knee pain persists after physiotherapy.',
        reasonRelevant: 'Supports orthopedic referral.'
      }
    ],
    activeMedications: ['Ibuprofen as needed'],
    allergies: [],
    recentInvestigations: [
      {
        chartEntryId: 'chart-2',
        date: '2026-06-03',
        title: 'Knee x-ray',
        summary: 'Degenerative changes noted.',
        reasonRelevant: 'Relevant imaging for specialist.'
      }
    ]
  },
  specialtyRecommendation: {
    specialty: 'Orthopedic Surgery',
    subspecialty: 'Knee',
    confidence: 0.82,
    rationale: 'Persistent knee symptoms and imaging abnormality suggest orthopedic review.',
    sourceChartEntryIds: ['chart-1', 'chart-2'],
    differentialSpecialties: [
      {
        specialty: 'Sports Medicine',
        rationale: 'Could assess non-operative management.'
      }
    ]
  },
  draftReferral: {
    reasonForReferral: 'Persistent knee pain with abnormal imaging.',
    suggestedUrgency: 'routine',
    clinicalSummary: 'Patient has ongoing knee pain despite conservative treatment.',
    pertinentPositives: ['Persistent pain', 'Abnormal x-ray'],
    pertinentNegatives: [],
    questionsForSpecialist: ['Please assess for surgical or procedural options.'],
    missingInformationWarnings: []
  },
  warnings: []
};

test('validates a complete referral generation response', () => {
  const result = validateReferralGenerationResponse(validReferralResponse);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('rejects malformed referral generation response', () => {
  const result = validateReferralGenerationResponse({ patientId: 'patient-1' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /chartSummary is required/);
  assert.match(result.errors.join('\n'), /specialtyRecommendation is required/);
});

test('builds a Responses API input with chart entries and rejection feedback', () => {
  const input = buildReferralGenerationInput({
    patient: { id: 'patient-1', name: 'Demo Patient' },
    chartEntries: [{ id: 'chart-1', date: '2026-06-01', title: 'Visit', text: 'Knee pain' }],
    manualTriggerContext: { urgency: 'routine' },
    priorReferralFeedback: [{ referralId: 'ref-old', reason: 'Missing imaging report' }]
  });

  assert.equal(input[0].role, 'developer');
  assert.equal(input[1].role, 'user');
  assert.match(input[1].content[0].text, /chart-1/);
  assert.match(input[1].content[0].text, /Missing imaging report/);
});

test('extracts output text from Responses API shapes', () => {
  assert.equal(extractOutputText({ output_text: '{"ok":true}' }), '{"ok":true}');
  assert.equal(
    extractOutputText({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: '{"ok":true}' }]
        }
      ]
    }),
    '{"ok":true}'
  );
});

test('adapter calls OpenAI and validates the structured response', async () => {
  const calls = [];
  const adapter = new OpenAIReferralAdapter({
    apiKey: 'test-key',
    model: 'gpt-5.5',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'resp_123',
          model: 'gpt-5.5',
          output_text: JSON.stringify(validReferralResponse)
        })
      };
    }
  });

  const result = await adapter.generateReferralAnalysis({
    patient: { id: 'patient-1', name: 'Demo Patient' },
    chartEntries: [{ id: 'chart-1', date: '2026-06-01', title: 'Visit', text: 'Knee pain' }]
  });

  assert.equal(result.patientId, 'patient-1');
  assert.equal(result.metadata.openaiResponseId, 'resp_123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'gpt-5.5');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
});
