export const REFERRAL_PROMPT_VERSION = 'referon-referral-generation-v1';

const DEVELOPER_INSTRUCTIONS = `You are ReferOn's referral generation assistant for a proof-of-concept medical referral workflow.

Your task is to review synthetic or de-identified patient chart history and return one structured JSON object matching the provided schema. Generate both the relevant chart summary and the likely specialist recommendation in the same response.

Rules:
- Do not diagnose the patient.
- Do not invent facts that are not present in the supplied chart entries.
- Cite source chartEntryIds for clinically relevant claims.
- Use empty arrays when information is unavailable.
- Use "unknown" urgency if urgency cannot be inferred from the supplied context.
- Treat confidence as a calibrated demonstration score from 0 to 1, not a clinical certainty.
- Flag missing data that would matter to a real referral.
- If prior rejection feedback is supplied, use it to avoid repeating referral drafting or routing issues.`;

export function buildReferralGenerationInput({
  patient,
  chartEntries,
  manualTriggerContext = {},
  patientPreferences = {},
  priorReferralFeedback = []
}) {
  if (!patient?.id) {
    throw new TypeError('patient.id is required to build a referral generation prompt');
  }
  if (!Array.isArray(chartEntries) || chartEntries.length === 0) {
    throw new TypeError('chartEntries must contain at least one chart entry');
  }

  const promptPayload = {
    promptVersion: REFERRAL_PROMPT_VERSION,
    patient: normalizePatient(patient),
    manualTriggerContext,
    patientPreferences,
    chartEntries: chartEntries.map(normalizeChartEntry),
    priorReferralFeedback: priorReferralFeedback.map(normalizeFeedback)
  };

  return [
    {
      role: 'developer',
      content: [
        {
          type: 'input_text',
          text: DEVELOPER_INSTRUCTIONS
        }
      ]
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: `Create a referral analysis from this JSON payload:\n${JSON.stringify(promptPayload, null, 2)}`
        }
      ]
    }
  ];
}

export function buildReferralPromptPreview(input) {
  return buildReferralGenerationInput(input)
    .map((message) => ({
      role: message.role,
      text: message.content.map((part) => part.text).join('\n')
    }));
}

function normalizePatient(patient) {
  return {
    id: patient.id,
    name: patient.name ?? 'Demo Patient',
    birthDate: patient.birthDate ?? null,
    sex: patient.sex ?? null,
    address: patient.address ?? null,
    coordinates: patient.coordinates ?? null
  };
}

function normalizeChartEntry(entry, index) {
  return {
    chartEntryId: entry.chartEntryId ?? entry.id ?? `chart-entry-${index + 1}`,
    date: entry.date ?? entry.recordedAt ?? null,
    type: entry.type ?? entry.resourceType ?? 'unknown',
    title: entry.title ?? entry.code?.text ?? entry.description ?? 'Untitled chart entry',
    text: entry.text ?? entry.summary ?? entry.note ?? '',
    raw: entry.raw ?? null
  };
}

function normalizeFeedback(feedback, index) {
  return {
    referralId: feedback.referralId ?? `prior-referral-${index + 1}`,
    rejectedSpecialty: feedback.rejectedSpecialty ?? null,
    rejectedSpecialistId: feedback.rejectedSpecialistId ?? null,
    reason: feedback.reason ?? feedback.rejectionReason ?? '',
    date: feedback.date ?? null
  };
}
