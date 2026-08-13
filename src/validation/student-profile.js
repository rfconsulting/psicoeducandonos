const FIELD_RULES = Object.freeze({
  phone: { column: 'phone', max: 40 },
  country: { column: 'country', max: 80 },
  province: { column: 'province', max: 100 },
  city: { column: 'city', max: 100 },
  documentNumber: { column: 'document_number', max: 80 },
  profession: { column: 'profession', max: 120 },
  specialization: { column: 'specialization', max: 160 },
  institution: { column: 'institution', max: 180 },
  licenseNumber: { column: 'license_number', max: 80 },
  motivation: { column: 'motivation', max: 3000 },
  bio: { column: 'bio', max: 2000 }
});
const ENUMS = Object.freeze({
  documentType: { column: 'document_type', values: ['national_id', 'passport', 'other'] },
  educationLevel: { column: 'education_level', values: ['secondary', 'technical', 'university', 'postgraduate', 'other'] },
  pathway: { column: 'pathway', values: ['accompaniment', 'health-professional', 'undecided'] }
});
const REQUIRED = ['phone', 'country', 'city', 'birthDate', 'documentType', 'documentNumber', 'profession', 'educationLevel', 'pathway', 'motivation'];

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function validAdultBirthDate(value, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1900) return false;
  const adult = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  return date <= adult;
}

function studentProfilePatch(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') return null;
  const values = {};
  for (const [name, rule] of Object.entries(FIELD_RULES)) {
    if (!Object.hasOwn(body, name)) continue;
    const value = clean(body[name]);
    if (value.length > rule.max) return null;
    values[rule.column] = value || null;
  }
  for (const [name, rule] of Object.entries(ENUMS)) {
    if (!Object.hasOwn(body, name)) continue;
    const value = clean(body[name]);
    if (value && !rule.values.includes(value)) return null;
    values[rule.column] = value || null;
  }
  if (Object.hasOwn(body, 'birthDate')) {
    const value = clean(body.birthDate);
    if (value && !validAdultBirthDate(value)) return null;
    values.birth_date = value || null;
  }
  if (Object.hasOwn(body, 'yearsExperience')) {
    const raw = body.yearsExperience;
    if (raw === '' || raw === null) values.years_experience = null;
    else {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > 80) return null;
      values.years_experience = value;
    }
  }
  return Object.keys(values).length ? values : null;
}

function completion(profile = {}) {
  const required = [...REQUIRED];
  if (profile.pathway === 'health-professional') required.push('licenseNumber');
  const completed = required.filter(field => {
    const value = profile[field];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
  return {
    percentage: Math.round((completed.length / required.length) * 100),
    complete: completed.length === required.length,
    missingFields: required.filter(field => !completed.includes(field))
  };
}

module.exports = { studentProfilePatch, completion, validAdultBirthDate, REQUIRED };
