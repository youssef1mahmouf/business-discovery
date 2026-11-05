const questionnaire = require('../../../frontend/assets/data/assessment-questions.json');

const projectTypes = new Set(['saas', 'ecommerce', 'services', 'retail', 'marketplace', 'other']);
const categoriesById = new Map(questionnaire.categories.map((category) => [category.id, category]));
const questionsById = new Map(questionnaire.questions.map((question) => [question.id, question]));

function calculateAssessment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !projectTypes.has(input.projectType) || !input.answers || typeof input.answers !== 'object' ||
      Array.isArray(input.answers)) return null;

  const answerIds = Object.keys(input.answers);
  if (answerIds.length !== questionnaire.questions.length ||
      answerIds.some((id) => !questionsById.has(id))) return null;

  const scores = new Map(questionnaire.categories.map((category) => [category.id, []]));
  for (const question of questionnaire.questions) {
    const value = input.answers[question.id];
    if (!Number.isInteger(value) || value < 1 || value > 5) return null;
    scores.get(question.category).push(value);
  }

  const categories = questionnaire.categories.map((category) => {
    const values = scores.get(category.id);
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    return {
      id: category.id,
      label: category.label,
      score: Math.round(((average - 1) / 4) * 100)
    };
  });
  const score = Math.round(categories.reduce((total, category) => total + category.score, 0) / categories.length);
  const focusAreas = categories.filter((category) => category.score < 60).map((category) => category.label);
  const strengths = categories.filter((category) => category.score >= 75).map((category) => category.label);
  const readiness = score >= 75 ? 'متقدم' : score >= 55 ? 'قيد التطوير' : 'يحتاج إلى تحقق إضافي';

  return {
    version: questionnaire.version,
    projectType: input.projectType,
    score,
    readiness,
    categories,
    strengths,
    focusAreas,
    answers: input.answers,
    createdAt: new Date().toISOString()
  };
}

module.exports = { calculateAssessment, projectTypes, questionnaire, categoriesById };
