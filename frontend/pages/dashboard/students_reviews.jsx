import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { IconArrowRight, IconSearch } from '@tabler/icons-react';
import {
  ActionIcon,
  Group,
  Rating,
  Text,
  TextInput,
  useMantineTheme,
} from '@mantine/core';
import Title from '../../components/Title';
import AccountStateSelect from '../../components/AccountStateSelect';
import FromPublicSelect from '../../components/FromPublicSelect';
import CourseSelect from '../../components/CourseSelect';
import apiClient from '../../lib/axios';
import { formatEgyptDateTime } from '../../lib/egyptDateTime';
import { useSystemConfig, useNationalSystem, getCourseFieldLabels } from '../../lib/api/system';
import styles from '../../styles/students_reviews.module.css';
import manageStyles from '../../styles/public_page_manage.module.css';

const RATING_COLOR = 'rgba(242, 207, 5, 1)';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PUBLIC_PATH = '/leave-a-review';

function buildPublicUrl() {
  if (typeof window === 'undefined') return PUBLIC_PATH;
  return `${window.location.origin}${PUBLIC_PATH}`;
}

function ModalPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function InputWithButton({ onButtonClick, onKeyDown, ...props }) {
  const theme = useMantineTheme();

  const handleKeyDown = (e) => {
    if (onKeyDown) onKeyDown(e);
    if (props.onKeyDown) props.onKeyDown(e);
  };

  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder="Search by name or text"
      rightSectionWidth={42}
      leftSection={<IconSearch size={18} stroke={1.5} />}
      rightSection={
        <ActionIcon
          size={32}
          radius="xl"
          color={theme.primaryColor}
          variant="filled"
          onClick={onButtonClick}
          style={{ cursor: 'pointer' }}
          aria-label="Search"
        >
          <IconArrowRight size={18} stroke={1.5} />
        </ActionIcon>
      }
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

const testimonialsAPI = {
  getAll: async () => {
    const { data } = await apiClient.get('/api/testimonials');
    return data;
  },
  create: async (payload) => {
    const { data } = await apiClient.post('/api/testimonials', payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await apiClient.put(`/api/testimonials/${id}`, payload);
    return data;
  },
  remove: async (id) => {
    const { data } = await apiClient.delete(`/api/testimonials/${id}`);
    return data;
  },
};

const publicPageAPI = {
  get: async () => {
    const { data } = await apiClient.get('/api/public_testimonials');
    return data;
  },
  save: async (payload) => {
    const { data } = await apiClient.put('/api/public_testimonials', payload);
    return data;
  },
};

const emptyForm = () => ({
  name: '',
  course: '',
  score: '',
  text: '',
  rating: 0,
  state: null,
});

const emptyItemFieldErrors = () => ({
  name: '',
  course: '',
  score: '',
  text: '',
  rating: '',
  state: '',
});

const emptyManageFieldErrors = () => ({
  image: '',
  text: '',
  visibilityState: '',
});

const stripAlertPrefix = (msg) => String(msg || '').replace(/^❌\s*/, '').replace(/^✅\s*/, '');

const emptyManageForm = () => ({
  text: '',
  image: '',
  preview: '',
  imagePosX: 50,
  imagePosY: 50,
  visibilityState: null,
});

export default function StudentsReviewsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const manageFileRef = useRef(null);

  const { data: systemConfig, isLoading: systemConfigLoading } = useSystemConfig();
  const isNational = useNationalSystem();
  const courseLabels = getCourseFieldLabels(isNational);
  const marketingPageEnabled =
    systemConfig?.marketing_page === true || systemConfig?.marketing_page === 'true';

  useEffect(() => {
    if (systemConfigLoading) return;
    if (!marketingPageEnabled) {
      router.replace(`/404?path=${encodeURIComponent('/dashboard/students_reviews')}`);
    }
  }, [systemConfigLoading, marketingPageEnabled, router]);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState(null);
  const [fromPublicFilter, setFromPublicFilter] = useState(null);
  const [courseFilter, setCourseFilter] = useState('');
  const [filterCourseOpen, setFilterCourseOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [editItem, setEditItem] = useState(emptyForm);
  const [error, setError] = useState('');
  const [showAddSuccess, setShowAddSuccess] = useState(false);
  const [showEditSuccess, setShowEditSuccess] = useState(false);
  const [listSuccess, setListSuccess] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const [showManageModal, setShowManageModal] = useState(false);
  const [manageItem, setManageItem] = useState(emptyManageForm);
  const [manageError, setManageError] = useState('');
  const [manageSuccess, setManageSuccess] = useState('');
  const [manageSaved, setManageSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [copySuccess, setCopySuccess] = useState('');
  const [addCourseOpen, setAddCourseOpen] = useState(false);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [addFieldErrors, setAddFieldErrors] = useState(emptyItemFieldErrors);
  const [editFieldErrors, setEditFieldErrors] = useState(emptyItemFieldErrors);
  const [manageFieldErrors, setManageFieldErrors] = useState(emptyManageFieldErrors);
  const manageBaselineRef = useRef(null);

  const { data, isLoading, error: fetchError } = useQuery({
    queryKey: ['testimonials'],
    queryFn: testimonialsAPI.getAll,
    enabled: marketingPageEnabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
  });

  const testimonials = data?.testimonials || [];
  const canManage = Boolean(data?.canManage);

  const { data: publicPageData } = useQuery({
    queryKey: ['public_testimonials'],
    queryFn: publicPageAPI.get,
    enabled: marketingPageEnabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const pendingCount = publicPageData?.pendingCount || 0;
  const publicPage = publicPageData?.page || null;

  const createMutation = useMutation({
    mutationFn: (payload) => testimonialsAPI.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
      setShowAddSuccess(true);
      setError('');
      setAddFieldErrors(emptyItemFieldErrors());
      setTimeout(() => {
        setShowAddForm(false);
        setNewItem(emptyForm());
        setAddCourseOpen(false);
        setShowAddSuccess(false);
      }, 2000);
    },
    onError: (err) => {
      setError(stripAlertPrefix(err?.response?.data?.error || 'Failed to create review'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => testimonialsAPI.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
      setShowEditSuccess(true);
      setError('');
      setEditFieldErrors(emptyItemFieldErrors());
      setTimeout(() => {
        setEditing(null);
        setEditItem(emptyForm());
        setEditCourseOpen(false);
        setShowEditSuccess(false);
      }, 2000);
    },
    onError: (err) => {
      setError(stripAlertPrefix(err?.response?.data?.error || 'Failed to update review'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => testimonialsAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] });
      setListSuccess('✅ Review deleted successfully!');
      setError('');
      setShowConfirm(false);
      setToDelete(null);
    },
    onError: (err) => {
      setError(err?.response?.data?.error || '❌ Failed to delete review');
      setShowConfirm(false);
      setToDelete(null);
    },
  });

  const saveManageMutation = useMutation({
    mutationFn: (payload) => publicPageAPI.save(payload),
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({ queryKey: ['public_testimonials'] });
      setManageSuccess('Public page updated successfully!');
      setManageError('');
      setManageSaved(true);
      setManageFieldErrors(emptyManageFieldErrors());
      manageBaselineRef.current = {
        text: payload.text,
        image: payload.image,
        imagePosX: payload.imagePosX,
        imagePosY: payload.imagePosY,
        visibilityState: payload.visibilityState,
      };
      setManageItem((s) => ({
        ...s,
        text: payload.text,
        image: payload.image,
        preview: payload.image,
        imagePosX: payload.imagePosX,
        imagePosY: payload.imagePosY,
        visibilityState: payload.visibilityState,
      }));
    },
    onError: (err) => {
      setManageError(stripAlertPrefix(err?.response?.data?.error || 'Failed to update public page'));
    },
  });

  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!listSuccess) return undefined;
    const t = setTimeout(() => setListSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [listSuccess]);

  useEffect(() => {
    if (!manageError) return undefined;
    const t = setTimeout(() => setManageError(''), 5000);
    return () => clearTimeout(t);
  }, [manageError]);

  useEffect(() => {
    if (!copySuccess) return undefined;
    const t = setTimeout(() => setCopySuccess(''), 2500);
    return () => clearTimeout(t);
  }, [copySuccess]);

  useEffect(() => {
    if (searchInput.trim() === '' && searchTerm !== '') {
      setSearchTerm('');
    }
  }, [searchInput, searchTerm]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return testimonials.filter((t) => {
      if (stateFilter && t.state !== stateFilter) return false;
      if (fromPublicFilter !== null && fromPublicFilter !== undefined) {
        const isPublic = Boolean(t.from_public);
        if (isPublic !== fromPublicFilter) return false;
      }
      if (courseFilter && String(t.course || '') !== String(courseFilter)) return false;
      if (!q) return true;
      const name = String(t.name || '').toLowerCase();
      const text = String(t.text || '').toLowerCase();
      return name.includes(q) || text.includes(q);
    });
  }, [testimonials, searchTerm, stateFilter, fromPublicFilter, courseFilter]);

  const handleSearch = () => setSearchTerm(searchInput.trim());

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const openAdd = () => {
    setShowAddForm(true);
    setEditing(null);
    setEditItem(emptyForm());
    setNewItem(emptyForm());
    setError('');
    setShowAddSuccess(false);
    setAddCourseOpen(false);
    setAddFieldErrors(emptyItemFieldErrors());
  };

  const cancelAdd = () => {
    setShowAddForm(false);
    setNewItem(emptyForm());
    setError('');
    setShowAddSuccess(false);
    setAddCourseOpen(false);
    setAddFieldErrors(emptyItemFieldErrors());
  };

  const startEdit = (item) => {
    setEditing(item);
    setEditItem({
      name: item.name || '',
      course: item.course || '',
      score: item.score != null && item.score !== '' ? String(item.score) : '',
      text: item.text || '',
      rating: Number(item.rating) || 0,
      state: item.state === 'Activated' || item.state === 'Deactivated' ? item.state : null,
    });
    setShowAddForm(false);
    setNewItem(emptyForm());
    setError('');
    setShowEditSuccess(false);
    setEditCourseOpen(false);
    setEditFieldErrors(emptyItemFieldErrors());
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditItem(emptyForm());
    setError('');
    setShowEditSuccess(false);
    setEditCourseOpen(false);
    setEditFieldErrors(emptyItemFieldErrors());
  };

  const parseScore = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return NaN;
    return n;
  };

  const validateItemFields = (item) => {
    const next = emptyItemFieldErrors();
    if (!item.name.trim()) next.name = 'Name is required';
    if (!String(item.course || '').trim()) next.course = `${courseLabels.course} is required`;
    const score = parseScore(item.score);
    if (Number.isNaN(score)) next.score = `${courseLabels.score} must be a valid number`;
    if (!String(item.text || '').trim()) next.text = 'Message is required';
    if (!item.rating || item.rating <= 0) next.rating = 'Star rating is required';
    if (item.state !== 'Activated' && item.state !== 'Deactivated') {
      next.state = 'Visibility state is required';
    }
    const messages = Object.values(next).filter(Boolean);
    return {
      ok: messages.length === 0,
      next,
      summary:
        messages.length > 1
          ? 'Please fill in all required fields highlighted below.'
          : messages[0] || '',
    };
  };

  const clearAddFieldError = (key) => {
    setAddFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
    if (error) setError('');
  };

  const clearEditFieldError = (key) => {
    setEditFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
    if (error) setError('');
  };

  const clearManageFieldError = (key) => {
    setManageFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
    if (manageError) setManageError('');
  };

  const handleAdd = () => {
    const { ok, next, summary } = validateItemFields(newItem);
    setAddFieldErrors(next);
    if (!ok) {
      setError(summary);
      return;
    }
    createMutation.mutate({
      name: newItem.name.trim(),
      course: String(newItem.course || '').trim(),
      score: parseScore(newItem.score),
      text: String(newItem.text || '').trim(),
      rating: newItem.rating,
      state: newItem.state,
    });
  };

  const handleUpdate = () => {
    const { ok, next, summary } = validateItemFields(editItem);
    setEditFieldErrors(next);
    if (!ok) {
      setError(summary);
      return;
    }
    updateMutation.mutate({
      id: editing.id,
      payload: {
        name: editItem.name.trim(),
        course: String(editItem.course || '').trim(),
        score: parseScore(editItem.score),
        text: String(editItem.text || '').trim(),
        rating: editItem.rating,
        state: editItem.state,
      },
    });
  };

  const openManage = () => {
    const next = {
      text: publicPage?.text || '',
      image: publicPage?.image || '',
      preview: publicPage?.image || '',
      imagePosX: Number.isFinite(Number(publicPage?.imagePosX)) ? Number(publicPage.imagePosX) : 50,
      imagePosY: Number.isFinite(Number(publicPage?.imagePosY)) ? Number(publicPage.imagePosY) : 50,
      visibilityState:
        publicPage?.visibilityState === 'Activated' || publicPage?.visibilityState === 'Deactivated'
          ? publicPage.visibilityState
          : null,
    };
    setManageItem(next);
    manageBaselineRef.current = {
      text: next.text,
      image: next.image,
      imagePosX: next.imagePosX,
      imagePosY: next.imagePosY,
      visibilityState: next.visibilityState,
    };
    setManageError('');
    setManageSuccess('');
    setManageSaved(false);
    setCopySuccess('');
    setManageFieldErrors(emptyManageFieldErrors());
    setShowManageModal(true);
  };

  const closeManage = () => {
    setShowManageModal(false);
    setManageError('');
    setManageSuccess('');
    setManageFieldErrors(emptyManageFieldErrors());
  };

  const validateManageFields = (item) => {
    const next = emptyManageFieldErrors();
    if (!String(item.image || '').trim()) next.image = 'Hero image is required';
    if (!String(item.text || '').trim()) next.text = 'Text is required';
    if (item.visibilityState !== 'Activated' && item.visibilityState !== 'Deactivated') {
      next.visibilityState = 'Visibility state is required';
    }
    const messages = Object.values(next).filter(Boolean);
    return {
      ok: messages.length === 0,
      next,
      summary:
        messages.length > 1
          ? 'Please fill in all required fields highlighted below.'
          : messages[0] || '',
    };
  };

  const handleSaveManage = () => {
    const { ok, next, summary } = validateManageFields(manageItem);
    setManageFieldErrors(next);
    if (!ok) {
      setManageError(summary);
      return;
    }
    saveManageMutation.mutate({
      text: manageItem.text.trim(),
      image: manageItem.image.trim(),
      imagePosX: manageItem.imagePosX,
      imagePosY: manageItem.imagePosY,
      visibilityState: manageItem.visibilityState,
    });
  };

  const uploadImage = async (file) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
      setManageError('Invalid file type. Only JPEG, PNG, GIF, WEBP are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setManageError('Sorry, Max image size is 10 MB, Please try another picture');
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setManageError('');
    clearManageFieldError('image');

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setUploadProgress(40);
      const { data: uploadData } = await apiClient.post(
        '/api/upload/public-testimonial-image',
        { file: dataUrl, fileType: file.type },
        {
          onUploadProgress: (evt) => {
            if (!evt.total) return;
            setUploadProgress(40 + Math.round((evt.loaded / evt.total) * 50));
          },
        }
      );

      const url = uploadData?.url;
      if (!url) throw new Error('No image URL returned');

      setManageItem((s) => ({ ...s, image: url, preview: url, imagePosX: 50, imagePosY: 50 }));
      setUploadProgress(100);
    } catch (err) {
      setManageError(stripAlertPrefix(err?.response?.data?.error || err.message || 'Failed to upload image'));
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 400);
    }
  };

  const dragStateRef = useRef(null);
  const clampPos = (n) => Math.min(100, Math.max(0, n));

  const onPreviewPointerDown = (e) => {
    if (uploading) return;
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: Number(manageItem.imagePosX) || 50,
      posY: Number(manageItem.imagePosY) || 50,
      width: el.clientWidth || 1,
      height: el.clientHeight || 1,
    };
  };

  const onPreviewPointerMove = (e) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = ((e.clientX - drag.startX) / drag.width) * 100;
    const dy = ((e.clientY - drag.startY) / drag.height) * 100;
    const nextX = clampPos(drag.posX - dx);
    const nextY = clampPos(drag.posY - dy);
    setManageItem((s) => ({ ...s, imagePosX: nextX, imagePosY: nextY }));
  };

  const onPreviewPointerUp = (e) => {
    if (dragStateRef.current) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      dragStateRef.current = null;
    }
  };

  const copyLink = async () => {
    const url = buildPublicUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess('Link copied to clipboard!');
    } catch {
      setManageError('Failed to copy link');
    }
  };

  const shareLink = async () => {
    const url = buildPublicUrl();
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Leave a Review',
          text: 'Share your review with us',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopySuccess('Link copied (share not supported on this device)');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setManageError('Failed to share link');
    }
  };

  const showLinkBox = manageSaved || Boolean(publicPage);
  const hasImage = Boolean(manageItem.preview || manageItem.image);
  const posX = Number.isFinite(Number(manageItem.imagePosX)) ? Number(manageItem.imagePosX) : 50;
  const posY = Number.isFinite(Number(manageItem.imagePosY)) ? Number(manageItem.imagePosY) : 50;

  const manageHasChanges = useMemo(() => {
    const baseline = manageBaselineRef.current;
    if (!baseline) return true;
    return (
      String(manageItem.text || '').trim() !== String(baseline.text || '').trim() ||
      String(manageItem.image || '').trim() !== String(baseline.image || '').trim() ||
      Number(manageItem.imagePosX) !== Number(baseline.imagePosX) ||
      Number(manageItem.imagePosY) !== Number(baseline.imagePosY) ||
      manageItem.visibilityState !== baseline.visibilityState
    );
  }, [manageItem]);

  if (systemConfigLoading || !marketingPageEnabled) {
    return null;
  }

  if (fetchError) {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <Title href="/dashboard">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Image src="/testimonials2.svg" alt="" width={32} height={32} />
              Students Reviews
            </div>
          </Title>
          <div className={`${styles.alert} ${styles.alertError}`}>
            ❌{' '}
            {fetchError?.response?.data?.error ||
              fetchError.message ||
              'Failed to load students reviews'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <Title href="/dashboard" style={{ justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/testimonials2.svg" alt="" width={32} height={32} />
            Students Reviews
          </div>
        </Title>

        <div className={styles.searchWrap}>
          <InputWithButton
            placeholder="Search by name or text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyPress}
            onButtonClick={handleSearch}
          />
        </div>

        <div className={styles.filtersContainer}>
          <div className={styles.filterRow}>
            <div className={styles.filterGroup}>
              <AccountStateSelect
                value={stateFilter}
                onChange={setStateFilter}
                label="Filter by Visibility State"
                placeholder="Select Visibility State"
                includePending
                style={{ marginBottom: 0 }}
              />
            </div>
            <div className={styles.filterGroup}>
              <FromPublicSelect
                value={fromPublicFilter}
                onChange={setFromPublicFilter}
                label="Filter by From Public Page"
                placeholder="Select From Public Page"
                style={{ marginBottom: 0 }}
              />
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>{courseLabels.filterByCourse}</label>
              <CourseSelect
                selectedGrade={courseFilter}
                onGradeChange={setCourseFilter}
                isOpen={filterCourseOpen}
                onToggle={() => setFilterCourseOpen((o) => !o)}
                onClose={() => setFilterCourseOpen(false)}
              />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Students Reviews</h2>
              <p>Manage students reviews and star ratings</p>
            </div>
            {canManage ? (
              <div className={manageStyles.headerActions}>
                <button type="button" className={styles.addBtn} onClick={openAdd}>
                  <Image src="/plus.svg" alt="" width={18} height={18} />
                  Add Review
                </button>
                <button type="button" className={manageStyles.manageBtn} onClick={openManage}>
                  <Image src="/settings.svg" alt="" width={18} height={18} />
                  Manage Public Page
                </button>
                <button
                  type="button"
                  className={manageStyles.pendingBtn}
                  onClick={() => router.push('/dashboard/pending_reviews')}
                >
                  <Image src="/history.svg" alt="" width={18} height={18} />
                  Pending Reviews
                  <span className={manageStyles.pendingCount} aria-label={`${pendingCount} pending`}>
                    {pendingCount}
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              Loading reviews…
            </div>
          ) : testimonials.length === 0 ? (
            <div className={styles.empty}>
              <h3>No reviews yet</h3>
              <p>Click “Add Review” to create your first story.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <h3>No reviews match</h3>
              <p>Try a different search term.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {filtered.map((item) => (
                <article key={item.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTop}>
                      <h4 className={styles.itemTitle}>
                        <span className={styles.itemName}>{item.name}</span>
                        {item.course ? (
                          <>
                            <span className={styles.itemDot} aria-hidden="true">
                              •
                            </span>
                            <span className={styles.itemCourse}>{item.course}</span>
                          </>
                        ) : null}
                        <span className={styles.itemDot} aria-hidden="true">
                          •
                        </span>
                        <span className={styles.itemDateInline}>
                          {item.createdAtEgypt ||
                            (item.createdAt ? formatEgyptDateTime(item.createdAt) : '—')}
                        </span>
                      </h4>
                      <div className={styles.itemTags}>
                        {item.state ? (
                          <span
                            className={`${styles.stateBadge} ${
                              item.state === 'Activated'
                                ? styles.stateActive
                                : item.state === 'Pending'
                                  ? styles.statePending
                                  : styles.stateInactive
                            }`}
                          >
                            {item.state === 'Activated'
                              ? '✅ Activated'
                              : item.state === 'Pending'
                                ? '⏳ Pending'
                                : '❌ Deactivated'}
                          </span>
                        ) : null}
                        <span
                          className={`${styles.stateBadge} ${
                            item.from_public ? styles.fromPublicYes : styles.fromPublicNo
                          }`}
                        >
                          {item.from_public
                            ? 'From Public Page · Yes'
                            : 'From Public Page · No'}
                        </span>
                      </div>
                    </div>
                    {item.score != null && item.score !== '' ? (
                      <p className={styles.itemText}>
                        {courseLabels.score}: <strong>{item.score}</strong>
                      </p>
                    ) : null}
                    {item.text ? <p className={styles.itemText}>{item.text}</p> : null}
                    <div className={styles.itemMetaRow}>
                      <div className={styles.itemRating}>
                        <Rating
                          value={Number(item.rating) || 0}
                          readOnly
                          fractions={2}
                          color={RATING_COLOR}
                          size="md"
                        />
                      </div>
                    </div>
                  </div>
                  {canManage ? (
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.btnEdit}
                        onClick={() => startEdit(item)}
                      >
                        <Image src="/edit.svg" alt="" width={16} height={16} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => {
                          setToDelete(item);
                          setShowConfirm(true);
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Image src="/trash2.svg" alt="" width={16} height={16} />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}

          {listSuccess ? (
            <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
              {listSuccess}
            </div>
          ) : null}
          {error && !showAddForm && !editing ? (
            <div className={`${styles.alert} ${styles.alertError}`} role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <ModalPortal>
      {/* Add Modal */}
      {showAddForm ? (
        <div
          className={styles.formModal}
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelAdd();
          }}
        >
          <div className={styles.formModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>
                <Image src="/plus.svg" alt="" width={24} height={24} />
                Add New Review
              </h3>
              <button type="button" className={styles.closeModalBtn} onClick={cancelAdd} title="Close">
                ✕
              </button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.formField}>
                <label>
                  Name <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => {
                    setNewItem((s) => ({ ...s, name: e.target.value }));
                    clearAddFieldError('name');
                  }}
                  placeholder="Enter student name"
                  className={`${styles.modalInput} ${addFieldErrors.name ? styles.inputError : ''}`}
                  autoFocus
                />
                {addFieldErrors.name ? (
                  <p className={styles.fieldError}>{addFieldErrors.name}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label>
                  {courseLabels.course} <span className={styles.requiredStar}>*</span>
                </label>
                <div className={addFieldErrors.course ? styles.selectError : undefined}>
                  <CourseSelect
                    selectedGrade={newItem.course}
                    onGradeChange={(course) => {
                      setNewItem((s) => ({ ...s, course }));
                      clearAddFieldError('course');
                    }}
                    isOpen={addCourseOpen}
                    onToggle={() => setAddCourseOpen((o) => !o)}
                    onClose={() => setAddCourseOpen(false)}
                    required
                  />
                </div>
                {addFieldErrors.course ? (
                  <p className={styles.fieldError}>{addFieldErrors.course}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label>
                  {courseLabels.score} <span className={styles.optionalLabel}>(optional)</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={newItem.score}
                  onChange={(e) => {
                    setNewItem((s) => ({ ...s, score: e.target.value }));
                    clearAddFieldError('score');
                  }}
                  placeholder={isNational ? 'e.g. 60 / 60' : `Optional ${courseLabels.scoreLower}`}
                  className={`${styles.modalInput} ${addFieldErrors.score ? styles.inputError : ''}`}
                />
                {addFieldErrors.score ? (
                  <p className={styles.fieldError}>{addFieldErrors.score}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label>
                  Message <span className={styles.requiredStar}>*</span>
                </label>
                <div
                  className={`${styles.messageBox} ${
                    addFieldErrors.text ? styles.messageBoxError : ''
                  }`}
                >
                  <textarea
                    value={newItem.text}
                    onChange={(e) => {
                      setNewItem((s) => ({ ...s, text: e.target.value }));
                      clearAddFieldError('text');
                    }}
                    placeholder="Write the review message"
                    className={styles.messageTextarea}
                    rows={4}
                    maxLength={1000}
                  />
                  <div className={styles.messageMeta}>
                    <span className={styles.messageHint}>Student review message</span>
                    <span className={styles.messageCount}>{String(newItem.text || '').length}/1000</span>
                  </div>
                </div>
                {addFieldErrors.text ? (
                  <p className={styles.fieldError}>{addFieldErrors.text}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <div className={addFieldErrors.state ? styles.selectError : undefined}>
                  <AccountStateSelect
                    value={newItem.state}
                    onChange={(state) => {
                      setNewItem((s) => ({ ...s, state }));
                      clearAddFieldError('state');
                    }}
                    label="Visibility State"
                    placeholder="Select Visibility State"
                    required
                    style={{ marginBottom: 0 }}
                    error={addFieldErrors.state || null}
                  />
                </div>
                {addFieldErrors.state ? (
                  <p className={styles.fieldError}>{addFieldErrors.state}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label>From Public Page</label>
                <div className={`${styles.readonlyValue} ${styles.fromPublicNo}`}>No</div>
              </div>

              <div className={styles.formField}>
                <label>
                  Star rating <span className={styles.requiredStar}>*</span>
                </label>
                <div
                  className={`${styles.ratingBlock} ${
                    addFieldErrors.rating ? styles.ratingBlockError : ''
                  }`}
                >
                  <Rating
                    value={newItem.rating}
                    onChange={(rating) => {
                      setNewItem((s) => ({ ...s, rating }));
                      clearAddFieldError('rating');
                    }}
                    fractions={2}
                    allowClear
                    color={RATING_COLOR}
                    size={35}
                  />
                  <Group gap="xs" justify="center">
                    <Text size="sm" c="dimmed">
                      Current rating:
                    </Text>
                    <Text size="sm" fw={600}>
                      {newItem.rating === 0 ? 'Not rated' : newItem.rating}
                    </Text>
                  </Group>
                </div>
                {addFieldErrors.rating ? (
                  <p className={styles.fieldError}>{addFieldErrors.rating}</p>
                ) : null}
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="button"
                  className={styles.modalSaveBtn}
                  onClick={handleAdd}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Saving...' : 'Add Review'}
                </button>
                <button
                  type="button"
                  className={styles.modalCancelBtn}
                  onClick={cancelAdd}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </button>
              </div>

              {error ? (
                <div className={styles.errorPopup} role="alert">
                  <span className={styles.alertIcon} aria-hidden="true">
                    !
                  </span>
                  <span>{stripAlertPrefix(error)}</span>
                </div>
              ) : null}
              {showAddSuccess ? (
                <div className={styles.successPopup} role="status">
                  <span className={styles.alertIcon} aria-hidden="true">
                    ✓
                  </span>
                  <span>Review created successfully!</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit Modal */}
      {editing ? (
        <div
          className={styles.formModal}
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelEdit();
          }}
        >
          <div className={styles.formModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>
                <Image src="/edit.svg" alt="" width={24} height={24} />
                Edit Review
              </h3>
              <button type="button" className={styles.closeModalBtn} onClick={cancelEdit} title="Close">
                ✕
              </button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.formField}>
                <label>
                  Name <span className={styles.requiredStar}>*</span>
                </label>
                <input
                  type="text"
                  value={editItem.name}
                  onChange={(e) => {
                    setEditItem((s) => ({ ...s, name: e.target.value }));
                    clearEditFieldError('name');
                  }}
                  placeholder="Enter student name"
                  className={`${styles.modalInput} ${editFieldErrors.name ? styles.inputError : ''}`}
                  autoFocus
                />
                {editFieldErrors.name ? (
                  <p className={styles.fieldError}>{editFieldErrors.name}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label>
                  {courseLabels.course} <span className={styles.requiredStar}>*</span>
                </label>
                <div className={editFieldErrors.course ? styles.selectError : undefined}>
                  <CourseSelect
                    selectedGrade={editItem.course}
                    onGradeChange={(course) => {
                      setEditItem((s) => ({ ...s, course }));
                      clearEditFieldError('course');
                    }}
                    isOpen={editCourseOpen}
                    onToggle={() => setEditCourseOpen((o) => !o)}
                    onClose={() => setEditCourseOpen(false)}
                    required
                  />
                </div>
                {editFieldErrors.course ? (
                  <p className={styles.fieldError}>{editFieldErrors.course}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label>
                  {courseLabels.score} <span className={styles.optionalLabel}>(optional)</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editItem.score}
                  onChange={(e) => {
                    setEditItem((s) => ({ ...s, score: e.target.value }));
                    clearEditFieldError('score');
                  }}
                  placeholder={isNational ? 'e.g. 60 / 60' : `Optional ${courseLabels.scoreLower}`}
                  className={`${styles.modalInput} ${editFieldErrors.score ? styles.inputError : ''}`}
                />
                {editFieldErrors.score ? (
                  <p className={styles.fieldError}>{editFieldErrors.score}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label>
                  Message <span className={styles.requiredStar}>*</span>
                </label>
                <div
                  className={`${styles.messageBox} ${
                    editFieldErrors.text ? styles.messageBoxError : ''
                  }`}
                >
                  <textarea
                    value={editItem.text}
                    onChange={(e) => {
                      setEditItem((s) => ({ ...s, text: e.target.value }));
                      clearEditFieldError('text');
                    }}
                    placeholder="Write the review message"
                    className={styles.messageTextarea}
                    rows={4}
                    maxLength={1000}
                  />
                  <div className={styles.messageMeta}>
                    <span className={styles.messageHint}>Student review message</span>
                    <span className={styles.messageCount}>{String(editItem.text || '').length}/1000</span>
                  </div>
                </div>
                {editFieldErrors.text ? (
                  <p className={styles.fieldError}>{editFieldErrors.text}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <div className={editFieldErrors.state ? styles.selectError : undefined}>
                  <AccountStateSelect
                    value={editItem.state}
                    onChange={(state) => {
                      setEditItem((s) => ({ ...s, state }));
                      clearEditFieldError('state');
                    }}
                    label="Visibility State"
                    placeholder="Select Visibility State"
                    required
                    style={{ marginBottom: 0 }}
                    error={editFieldErrors.state || null}
                  />
                </div>
                {editFieldErrors.state ? (
                  <p className={styles.fieldError}>{editFieldErrors.state}</p>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label>From Public Page</label>
                <div
                  className={`${styles.readonlyValue} ${
                    editing?.from_public ? styles.fromPublicYes : styles.fromPublicNo
                  }`}
                >
                  {editing?.from_public ? 'Yes' : 'No'}
                </div>
              </div>

              <div className={styles.formField}>
                <label>
                  Star rating <span className={styles.requiredStar}>*</span>
                </label>
                <div
                  className={`${styles.ratingBlock} ${
                    editFieldErrors.rating ? styles.ratingBlockError : ''
                  }`}
                >
                  <Rating
                    value={editItem.rating}
                    onChange={(rating) => {
                      setEditItem((s) => ({ ...s, rating }));
                      clearEditFieldError('rating');
                    }}
                    fractions={2}
                    allowClear
                    color={RATING_COLOR}
                    size={35}
                  />
                  <Group gap="xs" justify="center">
                    <Text size="sm" c="dimmed">
                      Current rating:
                    </Text>
                    <Text size="sm" fw={600}>
                      {editItem.rating === 0 ? 'Not rated' : editItem.rating}
                    </Text>
                  </Group>
                </div>
                {editFieldErrors.rating ? (
                  <p className={styles.fieldError}>{editFieldErrors.rating}</p>
                ) : null}
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="button"
                  className={styles.modalSaveBtn}
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className={styles.modalCancelBtn}
                  onClick={cancelEdit}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </button>
              </div>

              {error ? (
                <div className={styles.errorPopup} role="alert">
                  <span className={styles.alertIcon} aria-hidden="true">
                    !
                  </span>
                  <span>{stripAlertPrefix(error)}</span>
                </div>
              ) : null}
              {showEditSuccess && !error ? (
                <div className={styles.successPopup} role="status">
                  <span className={styles.alertIcon} aria-hidden="true">
                    ✓
                  </span>
                  <span>Review updated successfully!</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete Confirm */}
      {showConfirm ? (
        <div
          className={styles.formModal}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowConfirm(false);
              setToDelete(null);
            }
          }}
        >
          <div className={styles.confirmContent} onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p>
              Are you sure you want to delete the review from{' '}
              <strong>{toDelete?.name}</strong>?
            </p>
            <p>
              <strong>This action cannot be undone!</strong>
            </p>
            <div className={styles.confirmButtons}>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={() => deleteMutation.mutate(toDelete.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete Review'}
              </button>
              <button
                type="button"
                className={styles.confirmCancelBtn}
                onClick={() => {
                  setShowConfirm(false);
                  setToDelete(null);
                }}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Manage Public Page Modal */}
      {showManageModal ? (
        <div
          className={manageStyles.formModal}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeManage();
          }}
        >
          <div className={manageStyles.formModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={manageStyles.modalHeader}>
              <h3>
                <Image src="/settings.svg" alt="" width={24} height={24} />
                Manage Public Page
              </h3>
              <button type="button" className={manageStyles.closeModalBtn} onClick={closeManage}>
                ✕
              </button>
            </div>

            <div className={manageStyles.modalForm}>
              <div className={manageStyles.formField}>
                <label>
                  Hero Image <span className={manageStyles.requiredStar}>*</span>
                </label>
                <div
                  className={`${manageStyles.imageBox} ${
                    manageFieldErrors.image ? manageStyles.imageBoxError : ''
                  }`}
                >
                  {hasImage ? (
                    <div
                      className={manageStyles.imagePreviewWrap}
                      onPointerDown={onPreviewPointerDown}
                      onPointerMove={onPreviewPointerMove}
                      onPointerUp={onPreviewPointerUp}
                      onPointerCancel={onPreviewPointerUp}
                      title="Drag to reposition the visible area"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={manageItem.preview || manageItem.image}
                        alt="Preview"
                        className={manageStyles.imagePreview}
                        style={{ objectPosition: `${posX}% ${posY}%` }}
                        draggable={false}
                      />
                      <div className={manageStyles.dragHint}>Drag to reposition</div>
                      {uploading ? (
                        <div className={manageStyles.uploadOverlay}>
                          <div className={manageStyles.uploadProgressTrack}>
                            <div
                              className={manageStyles.uploadProgressBar}
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <span className={manageStyles.uploadProgressLabel}>
                            Uploading… {uploadProgress}%
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={manageStyles.dropzone}
                      disabled={uploading}
                      onClick={() => manageFileRef.current?.click()}
                    >
                      {uploading ? (
                        <div className={manageStyles.dropzoneUploading}>
                          <div className={manageStyles.uploadProgressTrack}>
                            <div
                              className={manageStyles.uploadProgressBar}
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <span>Uploading… {uploadProgress}%</span>
                        </div>
                      ) : (
                        <>
                          <Image src="/camera.svg" alt="" width={28} height={28} />
                          <span className={manageStyles.dropzoneTitle}>
                            Drop image here or click to upload
                          </span>
                          <span className={manageStyles.dropzoneHint}>
                            JPEG, PNG, GIF, WEBP · max 10 MB
                          </span>
                        </>
                      )}
                    </button>
                  )}

                  <input
                    ref={manageFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) uploadImage(file);
                    }}
                  />

                  {hasImage && !uploading ? (
                    <div className={manageStyles.imageActions}>
                      <button
                        type="button"
                        className={manageStyles.changeImageBtn}
                        onClick={() => manageFileRef.current?.click()}
                      >
                        <Image src="/camera.svg" alt="" width={16} height={16} />
                        Change image
                      </button>
                      <button
                        type="button"
                        className={manageStyles.removeImageBtn}
                        onClick={() =>
                          setManageItem((s) => ({
                            ...s,
                            image: '',
                            preview: '',
                            imagePosX: 50,
                            imagePosY: 50,
                          }))
                        }
                      >
                        <Image src="/trash2.svg" alt="" width={16} height={16} />
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
                {manageFieldErrors.image ? (
                  <p className={manageStyles.fieldError}>{manageFieldErrors.image}</p>
                ) : null}
              </div>

              <div className={manageStyles.formField}>
                <label>
                  Text <span className={manageStyles.requiredStar}>*</span>
                </label>
                <div
                  className={`${manageStyles.messageBox} ${
                    manageFieldErrors.text ? manageStyles.messageBoxError : ''
                  }`}
                >
                  <textarea
                    value={manageItem.text}
                    onChange={(e) => {
                      setManageItem((s) => ({ ...s, text: e.target.value }));
                      clearManageFieldError('text');
                    }}
                    placeholder="Text shown under the hero image"
                    className={manageStyles.messageTextarea}
                    rows={4}
                    maxLength={1000}
                  />
                  <div className={manageStyles.messageMeta}>
                    <span className={manageStyles.messageHint}>Hero text under the image</span>
                    <span className={manageStyles.messageCount}>
                      {String(manageItem.text || '').length}/1000
                    </span>
                  </div>
                </div>
                {manageFieldErrors.text ? (
                  <p className={manageStyles.fieldError}>{manageFieldErrors.text}</p>
                ) : null}
              </div>

              <div className={manageStyles.formField}>
                <div className={manageFieldErrors.visibilityState ? manageStyles.selectError : undefined}>
                  <AccountStateSelect
                    value={manageItem.visibilityState}
                    onChange={(visibilityState) => {
                      setManageItem((s) => ({ ...s, visibilityState }));
                      clearManageFieldError('visibilityState');
                    }}
                    label="Visibility State"
                    placeholder="Select Visibility State"
                    required
                    style={{ marginBottom: 0 }}
                    error={manageFieldErrors.visibilityState || null}
                  />
                </div>
                {manageFieldErrors.visibilityState ? (
                  <p className={manageStyles.fieldError}>{manageFieldErrors.visibilityState}</p>
                ) : null}
              </div>

              {showLinkBox ? (
                <div className={manageStyles.linkBox}>
                  <div className={manageStyles.linkBoxHeader}>
                    <span className={manageStyles.linkBoxLabel}>Leave a Review Link</span>
                    <span className={manageStyles.linkBoxHint}>Share this public link with students</span>
                  </div>
                  <code className={manageStyles.linkCode}>{buildPublicUrl()}</code>
                  <div className={manageStyles.linkActions}>
                    <button type="button" className={manageStyles.copyBtn} onClick={copyLink}>
                      <Image src="/copy2.svg" alt="" width={16} height={16} />
                      Copy Link
                    </button>
                    <button type="button" className={manageStyles.shareBtn} onClick={shareLink}>
                      <Image src="/share.svg" alt="" width={16} height={16} />
                      Share Link
                    </button>
                  </div>
                </div>
              ) : null}

              <div className={manageStyles.modalButtons}>
                <button
                  type="button"
                  className={manageStyles.modalSaveBtn}
                  onClick={handleSaveManage}
                  disabled={saveManageMutation.isPending || uploading || !manageHasChanges}
                >
                  {saveManageMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className={manageStyles.modalCancelBtn}
                  onClick={closeManage}
                  disabled={saveManageMutation.isPending || uploading}
                >
                  Close
                </button>
              </div>

              {manageError ? (
                <div className={manageStyles.errorPopup} role="alert">
                  <span className={manageStyles.alertIcon} aria-hidden="true">
                    !
                  </span>
                  <span>{stripAlertPrefix(manageError)}</span>
                </div>
              ) : null}
              {manageSuccess && !manageError ? (
                <div className={manageStyles.successPopup} role="status">
                  <span className={manageStyles.alertIcon} aria-hidden="true">
                    ✓
                  </span>
                  <span>{stripAlertPrefix(manageSuccess)}</span>
                </div>
              ) : null}
              {copySuccess ? (
                <div className={manageStyles.successPopup} role="status">
                  <span className={manageStyles.alertIcon} aria-hidden="true">
                    ✓
                  </span>
                  <span>{stripAlertPrefix(copySuccess)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </ModalPortal>
    </div>
  );
}
