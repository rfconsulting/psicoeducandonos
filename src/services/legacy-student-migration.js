const PROFILE_FIELDS = Object.freeze(['phone', 'city', 'pathway', 'motivation']);

function clean(value, maxLength) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function legacyProfileValues(application) {
  return {
    phone: clean(application.phone, 40),
    city: clean(application.location, 100),
    pathway: ['accompaniment', 'health-professional'].includes(application.pathway)
      ? application.pathway
      : null,
    motivation: clean(application.motivation, 3000)
  };
}

function missingProfileFields(profile) {
  const required = ['phone', 'country', 'city', 'birth_date', 'document_type',
    'document_number', 'profession', 'education_level', 'pathway', 'motivation'];
  if (profile.pathway === 'health-professional') required.push('license_number');
  return required.filter(field => profile[field] === null || profile[field] === undefined || profile[field] === '');
}

function fieldsToImport(currentProfile, application) {
  const legacy = legacyProfileValues(application);
  return PROFILE_FIELDS.filter(field => legacy[field] !== null
    && (!currentProfile || currentProfile[field] === null || currentProfile[field] === ''));
}

module.exports = { legacyProfileValues, missingProfileFields, fieldsToImport };
