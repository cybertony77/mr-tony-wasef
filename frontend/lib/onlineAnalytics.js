import { isEssayAnswerCorrect, isEssayQuestion } from './onlineQuestionTypes';

function getStudentAnswerRaw(studentAnswers, index) {
  if (!studentAnswers || typeof studentAnswers !== 'object') return undefined;
  return studentAnswers[index] ?? studentAnswers[String(index)];
}

function parseMcqLetter(value) {
  if (value == null) return null;
  if (Array.isArray(value) && value.length > 0) {
    return typeof value[0] === 'string' ? value[0].toUpperCase() : null;
  }
  if (typeof value === 'string') return value.toUpperCase();
  return null;
}

function parseMcqText(value) {
  if (Array.isArray(value) && value.length > 1) return value[1] || null;
  return null;
}

function parseCorrectAnswer(question) {
  const raw = question?.correct_answer;
  if (!raw) return { letter: null, text: null };
  if (Array.isArray(raw) && raw.length > 0) {
    return {
      letter: typeof raw[0] === 'string' ? raw[0].toUpperCase() : null,
      text: raw[1] || null,
    };
  }
  if (typeof raw === 'string') {
    return { letter: raw.toUpperCase(), text: null };
  }
  return { letter: null, text: null };
}

export function isStudentQuestionCorrect(question, studentAnswer) {
  if (isEssayQuestion(question)) {
    const essay = typeof studentAnswer === 'string' ? studentAnswer : '';
    return isEssayAnswerCorrect(essay, question?.valid_correct_answers);
  }

  const studentLetter = parseMcqLetter(studentAnswer);
  const studentText = parseMcqText(studentAnswer);
  const { letter: correctLetter, text: correctText } = parseCorrectAnswer(question);

  if (!studentLetter || !correctLetter) return false;
  if (correctText && studentText) return studentText === correctText;
  return studentLetter === correctLetter;
}

/**
 * 1-based question numbers the student got wrong or left unanswered,
 * using the shuffled order they saw (shuffle_mapping.questionOrder).
 * Falls back to original order when there is no shuffle mapping.
 */
export function getWrongQuestionNumbers(questions, studentAnswers, shuffleMapping) {
  if (!Array.isArray(questions) || questions.length === 0) return [];

  const questionOrder = shuffleMapping?.questionOrder;
  const displaySlots = [];

  if (Array.isArray(questionOrder) && questionOrder.length > 0) {
    [...questionOrder]
      .sort((a, b) => Number(a.shuffledIndex) - Number(b.shuffledIndex))
      .forEach(({ shuffledIndex, originalIndex }) => {
        displaySlots.push({
          displayIndex: Number(shuffledIndex),
          originalIndex: Number(originalIndex),
        });
      });
  } else {
    questions.forEach((_, index) => {
      displaySlots.push({ displayIndex: index, originalIndex: index });
    });
  }

  const wrong = [];
  displaySlots.forEach(({ displayIndex, originalIndex }) => {
    const question = questions[originalIndex];
    if (!question) return;
    const raw = getStudentAnswerRaw(studentAnswers, originalIndex);
    if (!isStudentQuestionCorrect(question, raw)) {
      wrong.push(displayIndex + 1);
    }
  });
  return wrong;
}

export function formatWrongQuestions(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return '—';
  return numbers.join(', ');
}

export function categorizePercentage(hasResult, percentage) {
  if (!hasResult || percentage === 0) return 'notAnswered';
  if (percentage === 100) return 'exactly100';
  if (percentage >= 50) return 'between50And100';
  return 'lessThan50';
}

export function buildAnalyticsStudentRow({
  student,
  hasResult,
  percentage,
  degree,
  questions,
  studentAnswers,
  shuffleMapping,
}) {
  const category = categorizePercentage(hasResult, percentage);
  const canComputeWrong = hasResult && studentAnswers && typeof studentAnswers === 'object';
  const wrongQuestions = canComputeWrong
    ? formatWrongQuestions(getWrongQuestionNumbers(questions, studentAnswers, shuffleMapping))
    : '—';

  return {
    id: student.id ?? student._id?.toString() ?? '',
    name: student.name || '—',
    course: student.course || '—',
    courseType: student.courseType || '—',
    degree: hasResult && degree ? String(degree) : '—',
    percentage: hasResult ? `${percentage}%` : '—',
    wrongQuestions,
    category,
  };
}

export const ANALYTICS_CATEGORY_META = [
  { key: 'notAnswered', label: 'Not Answered', color: '#a71e2a' },
  { key: 'lessThan50', label: '< 50%', color: '#dc3545' },
  { key: 'between50And100', label: '50-99%', color: '#17a2b8' },
  { key: 'exactly100', label: '100%', color: '#28a745' },
  { key: 'totalStudents', label: 'Total Students', color: '#212529' },
];
