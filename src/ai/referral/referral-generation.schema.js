export const REFERRAL_GENERATION_SCHEMA_NAME = 'referon_referral_generation';

export const referralGenerationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'patientId',
    'chartSummary',
    'specialtyRecommendation',
    'draftReferral',
    'warnings'
  ],
  properties: {
    patientId: { type: 'string', minLength: 1 },
    chartSummary: {
      type: 'object',
      additionalProperties: false,
      required: [
        'summary',
        'relevantHistory',
        'activeMedications',
        'allergies',
        'recentInvestigations'
      ],
      properties: {
        summary: { type: 'string' },
        relevantHistory: {
          type: 'array',
          items: { $ref: '#/$defs/chartReferenceSummary' }
        },
        activeMedications: {
          type: 'array',
          items: { type: 'string' }
        },
        allergies: {
          type: 'array',
          items: { type: 'string' }
        },
        recentInvestigations: {
          type: 'array',
          items: { $ref: '#/$defs/chartReferenceSummary' }
        }
      }
    },
    specialtyRecommendation: {
      type: 'object',
      additionalProperties: false,
      required: [
        'specialty',
        'subspecialty',
        'confidence',
        'rationale',
        'sourceChartEntryIds',
        'differentialSpecialties'
      ],
      properties: {
        specialty: { type: 'string' },
        subspecialty: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        rationale: { type: 'string' },
        sourceChartEntryIds: {
          type: 'array',
          items: { type: 'string' }
        },
        differentialSpecialties: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['specialty', 'rationale'],
            properties: {
              specialty: { type: 'string' },
              rationale: { type: 'string' }
            }
          }
        }
      }
    },
    draftReferral: {
      type: 'object',
      additionalProperties: false,
      required: [
        'reasonForReferral',
        'suggestedUrgency',
        'clinicalSummary',
        'pertinentPositives',
        'pertinentNegatives',
        'questionsForSpecialist',
        'missingInformationWarnings'
      ],
      properties: {
        reasonForReferral: { type: 'string' },
        suggestedUrgency: {
          type: 'string',
          enum: ['routine', 'semi_urgent', 'urgent', 'unknown']
        },
        clinicalSummary: { type: 'string' },
        pertinentPositives: {
          type: 'array',
          items: { type: 'string' }
        },
        pertinentNegatives: {
          type: 'array',
          items: { type: 'string' }
        },
        questionsForSpecialist: {
          type: 'array',
          items: { type: 'string' }
        },
        missingInformationWarnings: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  $defs: {
    chartReferenceSummary: {
      type: 'object',
      additionalProperties: false,
      required: ['chartEntryId', 'date', 'title', 'summary', 'reasonRelevant'],
      properties: {
        chartEntryId: { type: 'string' },
        date: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        reasonRelevant: { type: 'string' }
      }
    }
  }
};

export function getOpenAIResponseFormat() {
  return {
    type: 'json_schema',
    name: REFERRAL_GENERATION_SCHEMA_NAME,
    strict: true,
    schema: referralGenerationResponseSchema
  };
}

export function validateReferralGenerationResponse(value) {
  const errors = [];
  validateObject(value, referralGenerationResponseSchema, '$', referralGenerationResponseSchema, errors);
  return { valid: errors.length === 0, errors };
}

export function assertValidReferralGenerationResponse(value) {
  const result = validateReferralGenerationResponse(value);
  if (!result.valid) {
    throw new ReferralGenerationSchemaError(result.errors);
  }
  return value;
}

export class ReferralGenerationSchemaError extends Error {
  constructor(errors) {
    super(`Referral generation response failed schema validation: ${errors.join('; ')}`);
    this.name = 'ReferralGenerationSchemaError';
    this.errors = errors;
  }
}

function validateObject(value, schema, path, rootSchema, errors) {
  if (schema.$ref) {
    validateObject(value, resolveRef(schema.$ref, rootSchema), path, rootSchema, errors);
    return;
  }

  if (schema.type === 'object') {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return;
    }

    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in value)) {
        errors.push(`${path}.${requiredKey} is required`);
      }
    }

    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          errors.push(`${path}.${key} is not allowed`);
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) {
        validateObject(value[key], propertySchema, `${path}.${key}`, rootSchema, errors);
      }
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }
    value.forEach((item, index) => validateObject(item, schema.items, `${path}[${index}]`, rootSchema, errors));
    return;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${path} must be a string`);
      return;
    }
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(`${path} must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
    }
    return;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(`${path} must be a number`);
      return;
    }
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path} must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path} must be <= ${schema.maximum}`);
    }
  }
}

function resolveRef(ref, rootSchema) {
  const prefix = '#/$defs/';
  if (!ref.startsWith(prefix)) {
    throw new Error(`Unsupported schema ref: ${ref}`);
  }
  const name = ref.slice(prefix.length);
  const resolved = rootSchema.$defs?.[name];
  if (!resolved) {
    throw new Error(`Unknown schema ref: ${ref}`);
  }
  return resolved;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
