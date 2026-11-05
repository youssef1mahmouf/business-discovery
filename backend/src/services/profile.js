const PROFILE_FIELDS = ['username', 'displayName', 'headline', 'bio', 'location', 'skills', 'experience', 'education', 'website'];

function normalizeProfile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const username = String(body.username || '').trim().toLowerCase();
  const profile = {
    ...(username ? { username } : {}),
    displayName: String(body.displayName || '').trim(),
    headline: String(body.headline || '').trim(),
    bio: String(body.bio || '').trim(),
    location: String(body.location || '').trim(),
    skills: Array.isArray(body.skills) ? body.skills.map((item) => String(item).trim()).filter(Boolean) : [],
    experience: Array.isArray(body.experience) ? body.experience.map((item) => ({
      role: String(item && item.role || '').trim(),
      organization: String(item && item.organization || '').trim(),
      period: String(item && item.period || '').trim(),
      details: String(item && item.details || '').trim()
    })) : [],
    education: Array.isArray(body.education) ? body.education.map((item) => ({
      qualification: String(item && item.qualification || '').trim(),
      institution: String(item && item.institution || '').trim(),
      period: String(item && item.period || '').trim()
    })) : [],
    website: String(body.website || '').trim()
  };
  const lengths = [
    [profile.displayName, 80], [profile.headline, 120], [profile.bio, 3000],
    [profile.location, 120], [profile.website, 500]
  ];
  if ((username && !/^[a-z0-9_]{3,30}$/.test(username)) ||
      lengths.some(([value, max]) => value.length > max) ||
      profile.skills.length > 30 || profile.skills.some((item) => item.length > 60) ||
      profile.experience.length > 15 || profile.education.length > 15 ||
      profile.experience.some((item) => Object.values(item).some((value) => value.length > 1000)) ||
      profile.education.some((item) => Object.values(item).some((value) => value.length > 160))) {
    return null;
  }
  if (profile.website && !/^https?:\/\/[^\s]+$/i.test(profile.website)) return null;
  return profile;
}

module.exports = { PROFILE_FIELDS, normalizeProfile };
