import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { Group, Rating, Text } from '@mantine/core';
import Title from '../../components/Title';
import apiClient from '../../lib/axios';
import { formatEgyptDateTime } from '../../lib/egyptDateTime';
import { useSystemConfig, useNationalSystem, getCourseFieldLabels } from '../../lib/api/system';
import styles from '../../styles/pending_reviews.module.css';

const RATING_COLOR = 'rgba(242, 207, 5, 1)';

const api = {
  getPending: async () => {
    const { data } = await apiClient.get('/api/public_testimonials/pending');
    return data;
  },
  reviewAction: async ({ id, action }) => {
    const { data } = await apiClient.post('/api/public_testimonials/pending', {
      id,
      action,
    });
    return data;
  },
};

export default function PendingReviewsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNational = useNationalSystem();
  const courseLabels = getCourseFieldLabels(isNational);

  const { data: systemConfig, isLoading: systemConfigLoading } = useSystemConfig();
  const marketingPageEnabled =
    systemConfig?.marketing_page === true || systemConfig?.marketing_page === 'true';

  useEffect(() => {
    if (systemConfigLoading) return;
    if (!marketingPageEnabled) {
      router.replace(`/404?path=${encodeURIComponent('/dashboard/pending_reviews')}`);
    }
  }, [systemConfigLoading, marketingPageEnabled, router]);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // { id, action }

  const { data, isLoading, error: fetchError, refetch } = useQuery({
    queryKey: ['public_testimonials_pending'],
    queryFn: api.getPending,
    enabled: marketingPageEnabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const reviews = data?.reviews || [];

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }) => api.reviewAction({ id, action }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['public_testimonials'] });
      queryClient.invalidateQueries({ queryKey: ['public_testimonials_pending'] });
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
      setSuccess(vars.action === 'approve' ? '✅ Review approved' : '✅ Review rejected');
      setPendingAction(null);
      refetch();
    },
    onError: (err) => {
      setError(err?.response?.data?.error || '❌ Failed to update review');
      setPendingAction(null);
    },
  });

  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  if (systemConfigLoading || !marketingPageEnabled) {
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <Title href="/dashboard/students_reviews" backText="Back">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/history.svg" alt="" width={32} height={32} />
            Pending Reviews
          </div>
        </Title>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Pending Reviews</h2>
              <p>Approve or reject reviews submitted from the public review page</p>
            </div>
          </div>

          {fetchError ? (
            <div className={`${styles.alert} ${styles.alertError}`}>
              ❌{' '}
              {fetchError?.response?.data?.error ||
                fetchError.message ||
                'Failed to load pending reviews'}
            </div>
          ) : null}

          {isLoading ? (
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              Loading pending reviews…
            </div>
          ) : reviews.length === 0 ? (
            <div className={styles.empty}>
              <h3>No pending reviews</h3>
              <p>Public submissions will appear here for approval.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {reviews.map((review, index) => {
                const reviewKey = String(review.id ?? review._id ?? '');
                const isThisItem =
                  pendingAction != null &&
                  String(pendingAction.id) === reviewKey &&
                  reviewMutation.isPending;
                const isApproving = isThisItem && pendingAction.action === 'approve';
                const isRejecting = isThisItem && pendingAction.action === 'reject';
                const busy = reviewMutation.isPending;

                return (
                  <article
                    key={reviewKey || index}
                    className={styles.item}
                    style={{ animationDelay: `${Math.min(index, 8) * 0.05}s` }}
                  >
                    <div className={styles.itemMain}>
                      <div className={styles.itemTop}>
                        <h4 className={styles.itemTitle}>
                          <span className={styles.itemName}>{review.name}</span>
                          {review.course ? (
                            <>
                              <span className={styles.itemDot} aria-hidden="true">
                                •
                              </span>
                              <span className={styles.itemCourse}>{review.course}</span>
                            </>
                          ) : null}
                          <span className={styles.itemDot} aria-hidden="true">
                            •
                          </span>
                          <span className={styles.itemDateInline}>
                            {review.createdAtEgypt ||
                              (review.createdAt ? formatEgyptDateTime(review.createdAt) : '—')}
                          </span>
                        </h4>
                        <div className={styles.itemTags}>
                          <span className={styles.pendingBadge}>Pending</span>
                        </div>
                      </div>
                      {review.score != null && review.score !== '' ? (
                        <p className={styles.itemText}>
                          {courseLabels.score}: <strong>{review.score}</strong>
                        </p>
                      ) : null}
                      {review.text ? <p className={styles.itemText}>{review.text}</p> : null}
                      <div className={styles.itemMetaRow}>
                        <Group gap="xs">
                          <Rating
                            value={Number(review.rating) || 0}
                            readOnly
                            fractions={2}
                            color={RATING_COLOR}
                            size="md"
                          />
                          <Text size="sm" c="dimmed">
                            {review.rating}
                          </Text>
                        </Group>
                      </div>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.approveBtn}
                        disabled={busy}
                        onClick={() => {
                          setPendingAction({ id: reviewKey, action: 'approve' });
                          reviewMutation.mutate({
                            id: Number(review.id),
                            action: 'approve',
                          });
                        }}
                      >
                        {isApproving ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className={styles.rejectBtn}
                        disabled={busy}
                        onClick={() => {
                          setPendingAction({ id: reviewKey, action: 'reject' });
                          reviewMutation.mutate({
                            id: Number(review.id),
                            action: 'reject',
                          });
                        }}
                      >
                        {isRejecting ? 'Rejecting...' : 'Reject'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {success ? (
            <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
              {success}
            </div>
          ) : null}
          {error ? (
            <div className={`${styles.alert} ${styles.alertError}`} role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
