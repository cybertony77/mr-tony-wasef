import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Group, Rating, Text } from '@mantine/core';
import CourseSelect from '../../components/CourseSelect';
import FullPageActionLoader from '../../components/FullPageActionLoader';
import { useNationalSystem, getCourseFieldLabels } from '../../lib/api/system';
import styles from '../../styles/leave-a-review.module.css';

const RATING_COLOR = 'rgba(242, 207, 5, 1)';

const emptyFieldErrors = () => ({
  name: '',
  course: '',
  score: '',
  message: '',
  rating: '',
});

export default function LeaveAReviewPage() {
  const router = useRouter();
  const prefilledRef = useRef(false);
  const formRef = useRef(null);
  const alertRef = useRef(null);

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [course, setCourse] = useState('');
  const [score, setScore] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [courseOpen, setCourseOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState(emptyFieldErrors);
  const [submitted, setSubmitted] = useState(false);

  const isNational = useNationalSystem();
  const courseLabels = getCourseFieldLabels(isNational);

  const { data: profile } = useQuery({
    queryKey: ['auth', 'profile', 'leave-a-review'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/api/auth/me', { withCredentials: true });
        return data;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (prefilledRef.current || !profile || profile.role !== 'student') return;
    prefilledRef.current = true;
    const studentName = profile.name || profile.student_name || profile.studentName;
    if (studentName) setName(String(studentName).trim());
    const studentCourse = profile.course || profile.grade;
    if (studentCourse) setCourse(String(studentCourse));
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await axios.get('/api/leave-a-review');
        if (!cancelled) setPage(data.page);
      } catch (err) {
        if (!cancelled) {
          if (err?.response?.status === 404) {
            router.replace(`/404?path=${encodeURIComponent('/leave-a-review')}`);
            return;
          }
          setLoadError(
            err?.response?.data?.error || 'This review page could not be found.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const clearFieldError = (key) => {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
    if (error) setError('');
  };

  const parseScore = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return NaN;
    return n;
  };

  const validateForm = () => {
    const next = emptyFieldErrors();
    let firstKey = '';

    if (!name.trim()) {
      next.name = 'Name is required';
      firstKey = firstKey || 'name';
    }
    if (!String(course || '').trim()) {
      next.course = `${courseLabels.course} is required`;
      firstKey = firstKey || 'course';
    }
    const parsedScore = parseScore(score);
    if (Number.isNaN(parsedScore)) {
      next.score = `${courseLabels.score} must be a valid number`;
      firstKey = firstKey || 'score';
    }
    if (!message.trim()) {
      next.message = 'Message is required';
      firstKey = firstKey || 'message';
    }
    if (!rating || rating <= 0) {
      next.rating = 'Star rating is required';
      firstKey = firstKey || 'rating';
    }

    setFieldErrors(next);
    return { ok: !firstKey, firstKey, parsedScore, next };
  };

  const scrollToAlert = () => {
    requestAnimationFrame(() => {
      alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { ok, firstKey, parsedScore, next } = validateForm();
    if (!ok) {
      const missing = Object.values(next).filter(Boolean);
      setError(
        missing.length > 1
          ? 'Please fill in all required fields highlighted below.'
          : missing[0] || 'Please complete the form.'
      );
      scrollToAlert();
      const el = formRef.current?.querySelector(`[data-field="${firstKey}"]`);
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    setError('');
    setFieldErrors(emptyFieldErrors());
    const started = Date.now();
    try {
      await axios.post('/api/leave-a-review', {
        name: name.trim(),
        course: String(course).trim(),
        score: parsedScore,
        text: message.trim(),
        rating,
      });
      const elapsed = Date.now() - started;
      const wait = Math.max(0, 1200 - elapsed);
      await new Promise((r) => setTimeout(r, wait));
      setSubmitted(true);
    } catch (err) {
      const status = err?.response?.status;
      let msg = err?.response?.data?.error || 'Failed to submit review. Please try again.';
      if (!err?.response) {
        msg = 'Network error. Check your connection and try again.';
      } else if (status === 404) {
        msg = 'This review page is no longer available.';
      } else if (status === 400) {
        msg = err?.response?.data?.error || 'Some fields are invalid. Please check and try again.';
      } else if (status >= 500) {
        msg = 'Server error. Please try again in a moment.';
      }
      setError(String(msg).replace(/^❌\s*/, ''));
      scrollToAlert();
    } finally {
      setSubmitting(false);
    }
  };

  const posX = Number.isFinite(Number(page?.imagePosX)) ? Number(page.imagePosX) : 50;
  const posY = Number.isFinite(Number(page?.imagePosY)) ? Number(page.imagePosY) : 50;

  return (
    <div className={styles.page}>
      <FullPageActionLoader
        active={loading || submitting}
        label={submitting ? 'Submitting' : 'Loading'}
        sub={
          submitting
            ? 'Sending your review. Please wait a moment.'
            : 'Loading review page. Please wait a moment.'
        }
      />

      {loadError || (!loading && !page) ? (
        <div className={styles.errorCard}>
          <h1>Page not found</h1>
          <p>{loadError || 'This review link is invalid or has been removed.'}</p>
        </div>
      ) : null}

      {page ? (
        <>
          <section className={styles.hero}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.image}
              alt=""
              className={styles.heroImage}
              style={{ objectPosition: `${posX}% ${posY}%` }}
            />
            <div className={styles.heroOverlay} />
            <div className={styles.heroShine} aria-hidden="true" />
            <div className={styles.heroContent}>
              <p className={styles.heroText}>{page.text}</p>
            </div>
          </section>

          <div className={styles.content}>
            {submitted ? (
              <div className={styles.thanksWrap} role="status">
                <div className={styles.thanksBurst} aria-hidden="true" />
                <div className={styles.thanksCard}>
                  <div className={styles.thanksCheck}>
                    <Image src="/success-mark3.svg" alt="" width={40} height={40} />
                  </div>
                  <h2 className={styles.thanksTitle}>Thank you for your review!</h2>
                  <p className={styles.thanksCopy}>
                    Your feedback means a lot. We appreciate you taking the time to share it.
                  </p>
                  <div className={styles.ctaRow}>
                    <Link href="/welcome" className={`${styles.ctaPrimary} ${styles.ctaAnim1}`}>
                      <Image src="/testimonials2.svg" alt="" width={18} height={18} />
                      View Reviews
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <form className={styles.formCard} onSubmit={handleSubmit} ref={formRef} noValidate>
                <h2>Leave a Review</h2>
                <p className={styles.formSub}>Share your experience with us</p>

                <div className={styles.field} data-field="name">
                  <label className={styles.label} htmlFor="review-name">
                    Name <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="review-name"
                    className={`${styles.input} ${fieldErrors.name ? styles.inputError : ''}`}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearFieldError('name');
                    }}
                    placeholder="Your name"
                    autoComplete="name"
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'review-name-error' : undefined}
                  />
                  {fieldErrors.name ? (
                    <p id="review-name-error" className={styles.fieldError}>
                      {fieldErrors.name}
                    </p>
                  ) : null}
                </div>

                <div className={styles.field} data-field="course">
                  <label className={styles.label}>
                    {courseLabels.course} <span className={styles.required}>*</span>
                  </label>
                  <div
                    className={`${styles.courseSelectWrap} ${
                      fieldErrors.course ? styles.selectError : ''
                    }`}
                  >
                    <CourseSelect
                      selectedGrade={course}
                      onGradeChange={(value) => {
                        setCourse(value);
                        clearFieldError('course');
                      }}
                      isOpen={courseOpen}
                      onToggle={() => setCourseOpen((o) => !o)}
                      onClose={() => setCourseOpen(false)}
                      required
                    />
                  </div>
                  {fieldErrors.course ? (
                    <p className={styles.fieldError}>{fieldErrors.course}</p>
                  ) : null}
                </div>

                <div className={styles.field} data-field="score">
                  <label className={styles.label} htmlFor="review-score">
                    {courseLabels.score} <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    id="review-score"
                    className={`${styles.input} ${fieldErrors.score ? styles.inputError : ''}`}
                    type="number"
                    inputMode="decimal"
                    value={score}
                    onChange={(e) => {
                      setScore(e.target.value);
                      clearFieldError('score');
                    }}
                    placeholder={isNational ? 'e.g. 60 / 60' : 'e.g. 1400'}
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.score)}
                    aria-describedby={fieldErrors.score ? 'review-score-error' : undefined}
                  />
                  {fieldErrors.score ? (
                    <p id="review-score-error" className={styles.fieldError}>
                      {fieldErrors.score}
                    </p>
                  ) : null}
                </div>

                <div className={styles.field} data-field="message">
                  <label className={styles.label} htmlFor="review-message">
                    Message <span className={styles.required}>*</span>
                  </label>
                  <div
                    className={`${styles.messageBox} ${
                      fieldErrors.message ? styles.messageBoxError : ''
                    }`}
                  >
                    <textarea
                      id="review-message"
                      className={`${styles.textarea} ${
                        fieldErrors.message ? styles.inputError : ''
                      }`}
                      value={message}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        clearFieldError('message');
                      }}
                      placeholder="Tell us about your experience…"
                      rows={5}
                      disabled={submitting}
                      maxLength={1000}
                      aria-invalid={Boolean(fieldErrors.message)}
                      aria-describedby={
                        fieldErrors.message ? 'review-message-error' : 'review-message-hint'
                      }
                    />
                    <div className={styles.messageMeta}>
                      <span id="review-message-hint" className={styles.messageHint}>
                        Share what you liked or how the course helped you
                      </span>
                      <span className={styles.messageCount}>{message.length}/1000</span>
                    </div>
                  </div>
                  {fieldErrors.message ? (
                    <p id="review-message-error" className={styles.fieldError}>
                      {fieldErrors.message}
                    </p>
                  ) : null}
                </div>

                <div className={styles.field} data-field="rating">
                  <label className={styles.label}>
                    Rating <span className={styles.required}>*</span>
                  </label>
                  <div
                    className={`${styles.ratingBlock} ${
                      fieldErrors.rating ? styles.ratingBlockError : ''
                    }`}
                  >
                    <Rating
                      value={rating}
                      onChange={(value) => {
                        setRating(value);
                        clearFieldError('rating');
                      }}
                      fractions={2}
                      allowClear
                      color={RATING_COLOR}
                      size={35}
                      readOnly={submitting}
                    />
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">
                        Current rating:
                      </Text>
                      <Text size="sm" fw={600}>
                        {rating === 0 ? 'Not rated' : rating}
                      </Text>
                    </Group>
                  </div>
                  {fieldErrors.rating ? (
                    <p className={styles.fieldError}>{fieldErrors.rating}</p>
                  ) : null}
                </div>

                <button type="submit" className={styles.submitBtn} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>

                <div ref={alertRef}>
                  {error ? (
                    <div className={styles.errorMsg} role="alert">
                      <span className={styles.alertIcon} aria-hidden="true">
                        !
                      </span>
                      <span>{error}</span>
                    </div>
                  ) : null}
                </div>
              </form>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
