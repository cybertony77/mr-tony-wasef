import { newQuestionClientKey } from './onlineItemQuestionFormHelpers';
import { createEmptyMcqQuestion, normalizeLoadedQuestion } from './onlineQuestionTypes';

function mapHomeworkQuestion(q) {
  return normalizeLoadedQuestion({
    ...q,
    _clientKey: q._clientKey || newQuestionClientKey(),
    question_picture: q.question_picture || null,
    ...Object.keys(q || {})
      .filter((key) => /^question_picture_\d+$/.test(key))
      .reduce((acc, key) => ({ ...acc, [key]: q[key] || null }), {}),
  });
}

export function buildHomeworkImportFormState(hw) {
  if (!hw) return null;
  const homeworkType = hw.homework_type || 'questions';
  const questions =
    homeworkType === 'questions' && hw.questions && Array.isArray(hw.questions)
      ? hw.questions.map(mapHomeworkQuestion)
      : [createEmptyMcqQuestion({ answers: ['A', 'B', 'C', 'D'], answer_texts: ['', '', '', ''] })];

  return {
    formData: {
      lesson_name: hw.lesson_name || '',
      comment: hw.comment || '',
      deadline_type: hw.deadline_type || (hw.deadline_date ? 'with_deadline' : 'no_deadline'),
      deadline_date: hw.deadline_date || '',
      deadline_time: hw.deadline_time || null,
      homework_type: homeworkType,
      book_name: hw.book_name || '',
      from_page: hw.from_page != null ? String(hw.from_page) : '',
      to_page: hw.to_page != null ? String(hw.to_page) : '',
      timer_type: hw.timer === null || hw.timer === undefined ? 'no_timer' : 'with_timer',
      timer: hw.timer || null,
      shuffle_questions_and_answers:
        hw.shuffle_questions_and_answers === true || hw.shuffle_questions_and_answers === 'true',
      show_details_after_submitting:
        hw.show_details_after_submitting === true || hw.show_details_after_submitting === 'true',
      pdf_file_name: hw.pdf_file_name || '',
      pdf_url: hw.pdf_url || '',
      allow_downloading: hw.allow_downloading !== false && hw.allow_downloading !== 'false',
      questions,
    },
    selectedCourse: hw.course || '',
    selectedCourseType: hw.courseType || '',
    selectedLesson: hw.lesson || '',
    selectedCenter: hw.center || '',
    accountState: hw.state || hw.account_state || 'Activated',
    activeTab: homeworkType,
  };
}

function mapQuizQuestion(q) {
  return normalizeLoadedQuestion({
    ...q,
    _clientKey: q._clientKey || newQuestionClientKey(),
    question_picture: q.question_picture || null,
    ...Object.keys(q || {})
      .filter((key) => /^question_picture_\d+$/.test(key))
      .reduce((acc, key) => ({ ...acc, [key]: q[key] || null }), {}),
  });
}

export function buildQuizImportFormState(quiz) {
  if (!quiz) return null;
  const quizType = quiz.quiz_type || 'questions';
  const questions =
    quizType === 'questions' && quiz.questions && Array.isArray(quiz.questions)
      ? quiz.questions.map(mapQuizQuestion)
      : [createEmptyMcqQuestion()];

  return {
    formData: {
      lesson_name: quiz.lesson_name || '',
      comment: quiz.comment || '',
      deadline_type: quiz.deadline_type || (quiz.deadline_date ? 'with_deadline' : 'no_deadline'),
      deadline_date: quiz.deadline_date || '',
      deadline_time: quiz.deadline_time || null,
      quiz_type: quizType,
      timer_type: quiz.timer === null || quiz.timer === undefined ? 'no_timer' : 'with_timer',
      timer: quiz.timer || null,
      shuffle_questions_and_answers:
        quiz.shuffle_questions_and_answers === true || quiz.shuffle_questions_and_answers === 'true',
      show_details_after_submitting:
        quiz.show_details_after_submitting === true || quiz.show_details_after_submitting === 'true',
      pdf_file_name: quiz.pdf_file_name || '',
      pdf_url: quiz.pdf_url || '',
      allow_downloading: quiz.allow_downloading !== false && quiz.allow_downloading !== 'false',
      questions,
    },
    selectedCourse: quiz.course || '',
    selectedCourseType: quiz.courseType || '',
    selectedLesson: quiz.lesson || '',
    selectedCenter: quiz.center || '',
    accountState: quiz.state || quiz.account_state || 'Activated',
    activeTab: quizType,
  };
}

export function buildMockExamImportFormState(me) {
  if (!me) return null;
  const meType = me.mock_exam_type || 'questions';
  const questions =
    meType === 'questions' && me.questions && Array.isArray(me.questions)
      ? me.questions.map(mapQuizQuestion)
      : [createEmptyMcqQuestion()];

  return {
    formData: {
      lesson_name: me.lesson_name || '',
      comment: me.comment || '',
      deadline_type: me.deadline_type || (me.deadline_date ? 'with_deadline' : 'no_deadline'),
      deadline_date: me.deadline_date || '',
      deadline_time: me.deadline_time || null,
      mock_exam_type: meType,
      timer_type: me.timer === null || me.timer === undefined ? 'no_timer' : 'with_timer',
      timer: me.timer || null,
      shuffle_questions_and_answers:
        me.shuffle_questions_and_answers === true || me.shuffle_questions_and_answers === 'true',
      show_details_after_submitting:
        me.show_details_after_submitting === true || me.show_details_after_submitting === 'true',
      pdf_file_name: me.pdf_file_name || '',
      pdf_url: me.pdf_url || '',
      allow_downloading: me.allow_downloading !== false && me.allow_downloading !== 'false',
      questions,
    },
    selectedCourse: me.course || '',
    selectedCourseType: me.courseType || '',
    selectedMockExam: me.lesson || '',
    selectedCenter: me.center || '',
    accountState: me.state || me.account_state || 'Activated',
    activeTab: meType,
  };
}
