import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Playfair_Display, Caveat, Lora } from 'next/font/google';
import {
  Avatar,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  Rating,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { Carousel } from '@mantine/carousel';
import { IconCheck, IconTrash, IconX } from '@tabler/icons-react';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import TitleBar from '../components/Title';
import MarketingPageLoader from '../components/MarketingPageLoader';
import FullPageActionLoader from '../components/FullPageActionLoader';
import MarketingMultiSelect from '../components/MarketingMultiSelect';
import VideoInput from '../components/VideoInput';
import R2VideoPlayer from '../components/R2VideoPlayer';
import ZoomVideoPlayer from '../components/ZoomVideoPlayer';
import GoogleMeetVideoPlayer from '../components/GoogleMeetVideoPlayer';
import YoutubeEmbedWithProgress from '../components/YoutubeEmbedWithProgress';
import { useProfile } from '../lib/api/auth';
import { useSystemConfig } from '../lib/api/system';
import apiClient from '../lib/axios';
import {
  formatPhoneForDB,
  validateEgyptPhone,
  handleEgyptPhoneKeyDown,
} from '../lib/phoneUtils';
import { extractZoomMeetingId } from '../lib/zoomUtils';
import {
  buildCenterScheduleRows,
  formatTeached,
  formatYears,
  isWhatsAppLinkName,
  socialIconSrc,
  toYoutubeEmbed,
} from '../lib/marketingPageClientUtils';
import mp from '../styles/marketing_page.module.css';

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600'] });
const caveat = Caveat({ subsets: ['latin'], weight: ['400', '600', '700'] });
const lora = Lora({ subsets: ['latin'], weight: ['400', '500', '600'] });
const TEACHER_DESCRIPTION_MAX = 600;

function extractYouTubeId(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const match = raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  );
  return match?.[1] || null;
}

function emptySessionVideo() {
  return {
    video_name: '',
    youtube_url: '',
    video_source: 'youtube',
    r2_key: '',
    zoom_meeting_id: '',
    google_meet_id: '',
    upload_file_name: '',
    upload_progress: 0,
    upload_status: 'idle',
  };
}

function sessionVideoFromServer(json) {
  const base = emptySessionVideo();
  const type = (json?.session_video_type || '').toLowerCase();
  const id = String(json?.session_video_id || '').trim();

  if (type === 'r2' && id) {
    return {
      ...base,
      video_source: 'r2',
      r2_key: id,
      upload_status: 'done',
      upload_progress: 100,
    };
  }
  if (type === 'zoom' && id) {
    return { ...base, video_source: 'zoom', zoom_meeting_id: id };
  }
  if (type === 'google_meet' && id) {
    return { ...base, video_source: 'google_meet', google_meet_id: id };
  }
  if (type === 'youtube' && id) {
    const ytId = extractYouTubeId(id) || id;
    return {
      ...base,
      video_source: 'youtube',
      youtube_url: `https://www.youtube.com/watch?v=${ytId}`,
    };
  }
  if (json?.yt_session_link) {
    return {
      ...base,
      video_source: 'youtube',
      youtube_url: String(json.yt_session_link),
    };
  }
  return base;
}

function resolveSessionPlayback(videoOrData) {
  if (!videoOrData) return null;

  if (videoOrData.video_source || videoOrData.youtube_url || videoOrData.r2_key || videoOrData.zoom_meeting_id || videoOrData.google_meet_id) {
    if (videoOrData.r2_key && String(videoOrData.r2_key).trim()) {
      return { type: 'r2', id: String(videoOrData.r2_key).trim() };
    }
    if (videoOrData.zoom_meeting_id && String(videoOrData.zoom_meeting_id).trim()) {
      const meetingId = extractZoomMeetingId(videoOrData.zoom_meeting_id);
      if (meetingId) return { type: 'zoom', id: meetingId };
    }
    if (videoOrData.google_meet_id && String(videoOrData.google_meet_id).trim()) {
      return { type: 'google_meet', id: String(videoOrData.google_meet_id).trim() };
    }
    if (videoOrData.youtube_url && String(videoOrData.youtube_url).trim()) {
      const ytId = extractYouTubeId(videoOrData.youtube_url);
      if (ytId) return { type: 'youtube', id: ytId };
      const embed = toYoutubeEmbed(videoOrData.youtube_url);
      if (embed) {
        const m = embed.match(/embed\/([A-Za-z0-9_-]{6,})/);
        if (m?.[1]) return { type: 'youtube', id: m[1] };
      }
    }
    return null;
  }

  const type = (videoOrData.session_video_type || '').toLowerCase();
  const id = String(videoOrData.session_video_id || '').trim();
  if (type && id && ['youtube', 'r2', 'zoom', 'google_meet'].includes(type)) {
    if (type === 'youtube') {
      const ytId = extractYouTubeId(id) || id;
      return { type: 'youtube', id: ytId };
    }
    return { type, id };
  }
  if (videoOrData.yt_session_link) {
    const ytId = extractYouTubeId(videoOrData.yt_session_link);
    if (ytId) return { type: 'youtube', id: ytId };
  }
  return null;
}

function serializeSessionVideo(video) {
  const playback = resolveSessionPlayback(video);
  return playback
    ? { session_video_type: playback.type, session_video_id: playback.id }
    : { session_video_type: '', session_video_id: '' };
}

function ScheduleLocationCell({ row }) {
  const centerName = (row.center || '').trim();
  if (centerName.toLowerCase() === 'online') {
    return <span className={mp.scheduleLocationMuted}>Online</span>;
  }
  const loc = row.location && String(row.location).trim();
  if (loc) {
    return (
      <button
        type="button"
        className={mp.scheduleLocationLink}
        onClick={() => window.open(loc, '_blank', 'noopener,noreferrer')}
      >
        <Image src="/maps.svg" alt="" width={20} height={20} />
        Location
      </button>
    );
  }
  return <span className={mp.scheduleLocationMuted}>No Location</span>;
}

const HERO_SECTION_STYLE = {
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.08)',
  background:
    'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9)), url(https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1600&q=70) center/cover',
};

const PAGE_STATE_CARD = {
  background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
  border: '1px solid rgba(31, 168, 220, 0.22)',
  boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
  color: '#1e293b',
};

const MAX_TEACHER_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TEACHER_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function resolveTeacherImageMime(file) {
  const type = (file?.type || '').toLowerCase();
  if (ALLOWED_TEACHER_IMAGE_TYPES.has(type)) {
    return type === 'image/jpg' ? 'image/jpeg' : type;
  }
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();
  const byExt = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return byExt[ext] || null;
}

function readFileAsDataUrl(blobOrFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(blobOrFile);
  });
}

async function prepareTeacherImageForUpload(file) {
  const mime = resolveTeacherImageMime(file);
  if (!mime) return null;

  if (file.size > MAX_TEACHER_IMAGE_BYTES) {
    throw new Error('MAX_SIZE');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Invalid image file'));
      el.src = objectUrl;
    });

    const maxDim = 1600;
    let { naturalWidth: width, naturalHeight: height } = img;
    const shouldResize = file.size > 900 * 1024 || width > maxDim || height > maxDim;

    if (!shouldResize) {
      const dataUrl = await readFileAsDataUrl(file);
      return { dataUrl, fileType: mime };
    }

    const scale = Math.min(1, maxDim / width, maxDim / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image');
    ctx.drawImage(img, 0, 0, width, height);

    const outMime = mime === 'image/png' || mime === 'image/gif' ? mime : 'image/jpeg';
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not process image'))),
        outMime,
        outMime === 'image/jpeg' ? 0.88 : undefined
      );
    });

    if (blob.size > MAX_TEACHER_IMAGE_BYTES) {
      throw new Error('MAX_SIZE');
    }

    const dataUrl = await readFileAsDataUrl(blob);
    return { dataUrl, fileType: outMime };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick random unique activated testimonials, then reloop to fill `count` slides. */
function buildTestimonialSlides(activated, count) {
  const list = Array.isArray(activated)
    ? activated.filter((t) => t?.name && t?.course && t?.text)
    : [];
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!list.length || n <= 0) return [];

  const unique = shuffleArray(list).slice(0, Math.min(n, list.length));
  const slides = [];
  for (let i = 0; i < n; i += 1) {
    slides.push(unique[i % unique.length]);
  }
  return slides;
}

function testimonialCardSizeClass(text) {
  const len = String(text || '').trim().length;
  if (len < 80) return 'testimonialCardSm';
  if (len < 220) return 'testimonialCardMd';
  return 'testimonialCardLg';
}

function buildBaselineSnapshot(json) {
  const L = json.links?.length ? json.links : [{ name: '', link: '', phone: '' }];
  const links = L.map((row) => {
    const wa = (row.link || '').match(/^https?:\/\/wa\.me\/(\d+)/i);
    return { name: row.name || '', link: row.link || '', phone: wa ? wa[1] : '' };
  });
  return JSON.stringify({
    page_state: json.page_state !== false,
    teacher_picture: json.teacher_picture ?? null,
    teacher_name: json.teacher_name || '',
    teacher_description: json.teacher_description || '',
    students_teached:
      json.students_teached === null || json.students_teached === undefined
        ? ''
        : String(json.students_teached),
    years_of_experience:
      json.years_of_experience === null || json.years_of_experience === undefined
        ? ''
        : String(json.years_of_experience),
    ...serializeSessionVideo(
      json.sessionVideo ||
        sessionVideoFromServer(json)
    ),
    centerIds: [...(json.dates_of_session_ids || [])].sort(),
    assistantIds: [...(json.contact_assistant_ids || [])].sort(),
    contactPeople: (json.contact_people || [])
      .map((p) => ({
        id: p.id || '',
        name: p.name || '',
        phone: String(p.phone || '').replace(/[^0-9]/g, ''),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    links,
    testimonials_to_show:
      json.testimonials_to_show === null || json.testimonials_to_show === undefined
        ? ''
        : String(json.testimonials_to_show),
    outro_text: json.outro_text || '',
    note: json.note || '',
  });
}

function AnimatedInteger({ value, formatter, enabled = true }) {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setInView(true);
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (enabled && inView) setStarted(true);
  }, [enabled, inView]);

  useEffect(() => {
    if (!started || value === null || value === undefined || Number.isNaN(Number(value))) return;
    const target = Number(value);
    const dur = 1400;
    const t0 = performance.now();
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - p) ** 3;
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [started, value]);

  const v = formatter ? formatter(n) : String(n);
  return <span ref={ref}>{v}</span>;
}

function formatPhoneForWhatsApp(phone) {
  if (!phone) return '';
  return String(phone).replace(/[^0-9]/g, '');
}

function isValidHttpUrl(value) {
  const v = String(value || '').trim();
  return /^https?:\/\/\S+$/i.test(v);
}

export default function MarketingPage() {
  const router = useRouter();
  const { data: systemConfig } = useSystemConfig();
  const { data: user } = useProfile();
  const headerTitle = systemConfig?.name || 'Public Page';

  const handleMarketingLogoClick = useCallback(() => {
    const role = user?.role || '';
    if (role === 'student') {
      router.push('/student_dashboard');
    } else if (role) {
      router.push('/dashboard');
    } else {
      router.push('/');
    }
  }, [user?.role, router]);

  const [loading, setLoading] = useState(true);
  const [minLoaderElapsed, setMinLoaderElapsed] = useState(false);
  const [hidePageLoader, setHidePageLoader] = useState(false);
  const [confirmHideOpen, setConfirmHideOpen] = useState(false);
  const [formBaseline, setFormBaseline] = useState('');
  const [data, setData] = useState(null);
  const [options, setOptions] = useState({ centers: [], centersDetail: [], staff: [] });
  const [embla, setEmbla] = useState(null);

  const [pageStateChecked, setPageStateChecked] = useState(true);
  const [teacherPicture, setTeacherPicture] = useState(null);
  const [teacherPictureUrl, setTeacherPictureUrl] = useState(null);
  const [teacherName, setTeacherName] = useState('');
  const [teacherDescription, setTeacherDescription] = useState('');
  const [outroText, setOutroText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [copyLinkSuccess, setCopyLinkSuccess] = useState('');
  const [studentsTeached, setStudentsTeached] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [testimonialsToShow, setTestimonialsToShow] = useState('');
  const [sessionVideo, setSessionVideo] = useState(emptySessionVideo);
  const [sessionVideoErrors, setSessionVideoErrors] = useState({});
  const [centerIds, setCenterIds] = useState([]);
  const [assistantIds, setAssistantIds] = useState([]);
  const [contactPeople, setContactPeople] = useState([]);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactFormName, setContactFormName] = useState('');
  const [contactFormPhone, setContactFormPhone] = useState('');
  const [contactFormError, setContactFormError] = useState(null);
  const [links, setLinks] = useState([{ name: '', link: '', phone: '' }]);
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [teacherPicError, setTeacherPicError] = useState('');
  const [linksError, setLinksError] = useState('');

  const lastServerHashRef = useRef('');
  const hasFormChangesRef = useRef(false);
  const pageStateBusyRef = useRef(false);
  const testimonialAutoTimerRef = useRef(null);
  const testimonialResumeTimerRef = useRef(null);
  const testimonialPausedRef = useRef(false);
  const testimonialProgrammaticScrollRef = useRef(false);
  const teacherImageDraftRef = useRef(false);
  const TESTIMONIAL_AUTO_MS = 5000;
  const TESTIMONIAL_RESUME_MS = 3000;

  const activatedTestimonialsKey = useMemo(() => {
    return (data?.activated_testimonials || [])
      .map(
        (t) =>
          `${t.id ?? ''}:${t.name}:${t.course}:${t.text}:${t.score ?? ''}:${t.rating ?? ''}`
      )
      .sort()
      .join('|');
  }, [data?.activated_testimonials]);

  const viewTestimonials = useMemo(() => {
    return buildTestimonialSlides(
      data?.activated_testimonials,
      data?.testimonials_to_show
    );
    // Rebuild when activated set or show-count changes (not on every poll identity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activatedTestimonialsKey, data?.testimonials_to_show]);

  const viewTestimonialCount = viewTestimonials.length;

  const applyFormFromServer = useCallback((json) => {
    setPageStateChecked(json.page_state !== false);
    setTeacherPicture(json.teacher_picture);
    setTeacherPictureUrl(json.teacher_picture_url);
    if (!teacherImageDraftRef.current) {
      setImagePreview(json.teacher_picture_url || null);
    }
    setTeacherName(json.teacher_name || '');
    setTeacherDescription(String(json.teacher_description || '').slice(0, TEACHER_DESCRIPTION_MAX));
    setOutroText(json.outro_text || '');
    setNoteText(json.note || '');
    setStudentsTeached(
      json.students_teached === null || json.students_teached === undefined
        ? ''
        : String(json.students_teached)
    );
    setYearsExperience(
      json.years_of_experience === null || json.years_of_experience === undefined
        ? ''
        : String(json.years_of_experience)
    );
    setSessionVideo(sessionVideoFromServer(json));
    setSessionVideoErrors({});
    setCenterIds(json.dates_of_session_ids || []);
    setAssistantIds(json.contact_assistant_ids || []);
    setContactPeople(
      Array.isArray(json.contact_people)
        ? json.contact_people.map((p, i) => ({
            id: String(p.id || `person_${i}`),
            name: String(p.name || '').trim(),
            phone: String(p.phone || '').replace(/[^0-9]/g, ''),
          }))
        : []
    );
    const L = json.links?.length ? json.links : [{ name: '', link: '', phone: '' }];
    setLinks(
      L.map((row) => {
        const wa = (row.link || '').match(/^https?:\/\/wa\.me\/(\d+)/i);
        return {
          name: row.name || '',
          link: row.link || '',
          phone: wa ? wa[1] : '',
        };
      })
    );
    setTestimonialsToShow(
      json.testimonials_to_show === null || json.testimonials_to_show === undefined
        ? ''
        : String(json.testimonials_to_show)
    );
    setFormBaseline(buildBaselineSnapshot(json));
  }, []);

  const fetchMarketingPage = useCallback(
    async ({ silent = false, forceFormSync = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch('/api/marketing_page', { credentials: 'include' });
        if (res.status === 404) {
          router.replace(`/404?path=${encodeURIComponent('/welcome')}`);
          return;
        }
        const json = await res.json();
        const hash = buildBaselineSnapshot(json);
        const changed = hash !== lastServerHashRef.current;

        if (silent && !changed) return;

        lastServerHashRef.current = hash;
        setData(json);

        const shouldSyncForm =
          forceFormSync || (json.canEdit && !hasFormChangesRef.current);

        if (json.canEdit) {
          if (shouldSyncForm && !pageStateBusyRef.current) {
            if (forceFormSync) teacherImageDraftRef.current = false;
            applyFormFromServer(json);
          }
          if (!silent || forceFormSync) {
            try {
              const o = await apiClient.get('/api/marketing_page/options');
              setOptions(o.data);
            } catch {
              setOptions({ centers: [], centersDetail: [], staff: [] });
            }
          }
        } else if (shouldSyncForm && !pageStateBusyRef.current) {
          applyFormFromServer(json);
        }
      } catch {
        if (!silent) {
          router.replace(`/404?path=${encodeURIComponent('/welcome')}`);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [router, applyFormFromServer]
  );

  useEffect(() => {
    fetchMarketingPage({ forceFormSync: true });
  }, [fetchMarketingPage]);

  // Keep the welcome loader visible for at least 2s
  useEffect(() => {
    const timer = setTimeout(() => setMinLoaderElapsed(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchMarketingPage({ silent: true });
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchMarketingPage]);

  const canEdit = data?.canEdit;
  const isAssistant = user?.role === 'assistant';
  const dataReady = !loading && !!data;
  const showWelcomeLoader = !dataReady || !minLoaderElapsed;
  const welcomeReady = !showWelcomeLoader;

  useEffect(() => {
    if (!teacherPicError) return;
    const t = setTimeout(() => setTeacherPicError(''), 6000);
    return () => clearTimeout(t);
  }, [teacherPicError]);

  const teacherPreviewBeforeUploadRef = useRef(null);

  const processTeacherImage = async (file) => {
    if (!file || !canEdit) return;
    setTeacherPicError('');
    teacherPreviewBeforeUploadRef.current = imagePreview;

    let prepared;
    try {
      prepared = await prepareTeacherImageForUpload(file);
      if (!prepared) {
        setTeacherPicError('Please select a JPEG, PNG, GIF, or WEBP image.');
        return;
      }
    } catch (prepErr) {
      if (prepErr?.message === 'MAX_SIZE') {
        setTeacherPicError('Max size is 10 MB. Try a smaller image.');
        return;
      }
      setTeacherPicError(prepErr?.message || 'Invalid image file. Please try another picture.');
      return;
    }

    teacherImageDraftRef.current = true;
    setImagePreview(prepared.dataUrl);
    setUploadingPic(true);
    try {
      const response = await apiClient.post('/api/upload/profile-picture', {
        file: prepared.dataUrl,
        fileName: file.name,
        fileType: prepared.fileType,
        folder: 'unlisted',
      });
      if (response.data?.success && response.data?.public_id) {
        setTeacherPicture(response.data.public_id);
      }
    } catch (err) {
      setTeacherPicError(err.response?.data?.error || 'Failed to upload image. Please try again.');
      setImagePreview(teacherPreviewBeforeUploadRef.current);
    } finally {
      setUploadingPic(false);
    }
  };

  const handleTeacherDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploadingPic && canEdit) setIsDragging(true);
  };

  const handleTeacherDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleTeacherDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploadingPic || !canEdit) return;
    const file = e.dataTransfer.files?.[0];
    if (file) await processTeacherImage(file);
  };

  const handleTeacherFileInputChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) await processTeacherImage(file);
    e.target.value = '';
  };

  const clearTestimonialTimers = useCallback(() => {
    if (testimonialAutoTimerRef.current) {
      clearInterval(testimonialAutoTimerRef.current);
      testimonialAutoTimerRef.current = null;
    }
    if (testimonialResumeTimerRef.current) {
      clearTimeout(testimonialResumeTimerRef.current);
      testimonialResumeTimerRef.current = null;
    }
  }, []);

  const pauseTestimonialAutoplay = useCallback(() => {
    testimonialPausedRef.current = true;
    clearTestimonialTimers();
  }, [clearTestimonialTimers]);

  const startTestimonialAutoplay = useCallback(() => {
    if (!embla || canEdit || testimonialPausedRef.current) return;
    clearTestimonialTimers();
    testimonialAutoTimerRef.current = setInterval(() => {
      if (testimonialPausedRef.current) return;
      testimonialProgrammaticScrollRef.current = true;
      if (embla.canScrollNext()) embla.scrollNext();
      else embla.scrollTo(0);
    }, TESTIMONIAL_AUTO_MS);
  }, [embla, canEdit, clearTestimonialTimers]);

  const scheduleTestimonialResume = useCallback(() => {
    if (testimonialResumeTimerRef.current) clearTimeout(testimonialResumeTimerRef.current);
    testimonialResumeTimerRef.current = setTimeout(() => {
      testimonialPausedRef.current = false;
      startTestimonialAutoplay();
    }, TESTIMONIAL_RESUME_MS);
  }, [startTestimonialAutoplay]);

  const handleTestimonialUserInteract = useCallback(() => {
    pauseTestimonialAutoplay();
    scheduleTestimonialResume();
  }, [pauseTestimonialAutoplay, scheduleTestimonialResume]);

  const syncTestimonialCarouselHeight = useCallback(() => {
    if (!embla) return;
    const slide = embla.slideNodes()[embla.selectedScrollSnap()];
    const viewport = embla.containerNode()?.parentElement;
    if (!slide || !viewport) return;
    viewport.style.height = `${slide.offsetHeight}px`;
  }, [embla]);

  useEffect(() => {
    if (!welcomeReady || !embla || canEdit || viewTestimonialCount === 0) {
      clearTestimonialTimers();
      return undefined;
    }

    const onSelect = () => {
      syncTestimonialCarouselHeight();
      if (testimonialProgrammaticScrollRef.current) {
        testimonialProgrammaticScrollRef.current = false;
        return;
      }
      handleTestimonialUserInteract();
    };

    const root = embla.rootNode();
    const onPointerDown = () => pauseTestimonialAutoplay();
    const onPointerUp = () => scheduleTestimonialResume();

    embla.on('select', onSelect);
    embla.on('reInit', syncTestimonialCarouselHeight);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('touchstart', onPointerDown, { passive: true });
    root.addEventListener('touchend', onPointerUp, { passive: true });
    root.addEventListener('mouseenter', onPointerDown);
    root.addEventListener('mouseleave', onPointerUp);
    root.addEventListener('focusin', onPointerDown);
    root.addEventListener('focusout', onPointerUp);

    // Wait a frame so slide content (rating/fonts) can settle before measuring.
    const raf = requestAnimationFrame(() => syncTestimonialCarouselHeight());
    startTestimonialAutoplay();

    return () => {
      cancelAnimationFrame(raf);
      embla.off('select', onSelect);
      embla.off('reInit', syncTestimonialCarouselHeight);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('touchstart', onPointerDown);
      root.removeEventListener('touchend', onPointerUp);
      root.removeEventListener('mouseenter', onPointerDown);
      root.removeEventListener('mouseleave', onPointerUp);
      root.removeEventListener('focusin', onPointerDown);
      root.removeEventListener('focusout', onPointerUp);
      clearTestimonialTimers();
    };
  }, [
    welcomeReady,
    embla,
    canEdit,
    viewTestimonialCount,
    clearTestimonialTimers,
    pauseTestimonialAutoplay,
    scheduleTestimonialResume,
    startTestimonialAutoplay,
    handleTestimonialUserInteract,
    syncTestimonialCarouselHeight,
  ]);

  const patch = async (body) => {
    setSaving(true);
    try {
      await apiClient.patch('/api/marketing_page', body);
      await fetchMarketingPage({ silent: true, forceFormSync: true });
    } finally {
      setSaving(false);
    }
  };

  const currentFormSnapshot = useMemo(
    () =>
      JSON.stringify({
        page_state: pageStateChecked,
        teacher_picture: teacherPicture,
        teacher_name: teacherName,
        teacher_description: teacherDescription,
        students_teached: studentsTeached,
        years_of_experience: yearsExperience,
        ...serializeSessionVideo(sessionVideo),
        centerIds: [...centerIds].sort(),
        assistantIds: [...assistantIds].sort(),
        contactPeople: contactPeople
          .map((p) => ({
            id: p.id || '',
            name: p.name || '',
            phone: String(p.phone || '').replace(/[^0-9]/g, ''),
          }))
          .sort((a, b) => String(a.id).localeCompare(String(b.id))),
        links,
        testimonials_to_show: testimonialsToShow,
        outro_text: outroText,
        note: noteText,
      }),
    [
      pageStateChecked,
      teacherPicture,
      teacherName,
      teacherDescription,
      studentsTeached,
      yearsExperience,
      sessionVideo,
      centerIds,
      assistantIds,
      contactPeople,
      links,
      testimonialsToShow,
      outroText,
      noteText,
    ]
  );

  const hasFormChanges = canEdit && formBaseline && currentFormSnapshot !== formBaseline;

  useEffect(() => {
    hasFormChangesRef.current = !!hasFormChanges;
  }, [hasFormChanges]);

  const publishPage = async () => {
    pageStateBusyRef.current = true;
    setHidePageLoader(true);
    let succeeded = false;
    try {
      await apiClient.patch('/api/marketing_page', { page_state: true });
      succeeded = true;
    } catch {
      succeeded = false;
    } finally {
      window.setTimeout(async () => {
        if (succeeded) {
          setPageStateChecked(true);
          pageStateBusyRef.current = false;
          try {
            await fetchMarketingPage({ silent: true, forceFormSync: true });
          } catch {
            /* keep UI state */
          }
        } else {
          pageStateBusyRef.current = false;
        }
        setHidePageLoader(false);
      }, 4000);
    }
  };

  const confirmHidePage = async () => {
    setConfirmHideOpen(false);
    pageStateBusyRef.current = true;
    setHidePageLoader(true);
    let succeeded = false;
    try {
      await apiClient.patch('/api/marketing_page', { page_state: false });
      succeeded = true;
    } catch {
      succeeded = false;
    } finally {
      window.setTimeout(async () => {
        if (succeeded) {
          setPageStateChecked(false);
          pageStateBusyRef.current = false;
          try {
            await fetchMarketingPage({ silent: true, forceFormSync: true });
          } catch {
            /* keep UI state */
          }
        } else {
          pageStateBusyRef.current = false;
        }
        setHidePageLoader(false);
      }, 4000);
    }
  };

  const handlePageStateToggle = (nextChecked) => {
    if (saving || hidePageLoader || pageStateBusyRef.current) return;
    if (nextChecked) {
      publishPage();
      return;
    }
    if (pageStateChecked) {
      setConfirmHideOpen(true);
    }
  };

  const updateSessionVideo = useCallback((patchFields) => {
    setSessionVideo((prev) => ({ ...prev, ...patchFields }));
  }, []);

  const handleSessionVideoNameChange = useCallback((_index, name) => {
    updateSessionVideo({ video_name: name });
  }, [updateSessionVideo]);

  const handleSessionYouTubeUrlChange = useCallback((_index, url) => {
    updateSessionVideo({ youtube_url: url, video_source: 'youtube', r2_key: '', zoom_meeting_id: '', google_meet_id: '' });
    setSessionVideoErrors((prev) => {
      const next = { ...prev };
      delete next.video_0_youtube_url;
      return next;
    });
  }, [updateSessionVideo]);

  const handleSessionClearYouTubeUrl = useCallback(() => {
    updateSessionVideo({ youtube_url: '' });
  }, [updateSessionVideo]);

  const handleSessionZoomMeetingIdChange = useCallback((_index, meetingId) => {
    updateSessionVideo({
      zoom_meeting_id: meetingId,
      video_source: 'zoom',
      youtube_url: '',
      r2_key: '',
      google_meet_id: '',
    });
    setSessionVideoErrors((prev) => {
      const next = { ...prev };
      delete next.video_0_zoom_meeting_id;
      return next;
    });
  }, [updateSessionVideo]);

  const handleSessionClearZoomMeetingId = useCallback(() => {
    updateSessionVideo({ zoom_meeting_id: '' });
  }, [updateSessionVideo]);

  const handleSessionGoogleMeetIdChange = useCallback((_index, meetId) => {
    updateSessionVideo({
      google_meet_id: meetId,
      video_source: 'google_meet',
      youtube_url: '',
      r2_key: '',
      zoom_meeting_id: '',
    });
    setSessionVideoErrors((prev) => {
      const next = { ...prev };
      delete next.video_0_google_meet_id;
      return next;
    });
  }, [updateSessionVideo]);

  const handleSessionClearGoogleMeetId = useCallback(() => {
    updateSessionVideo({ google_meet_id: '' });
  }, [updateSessionVideo]);

  const handleSessionR2Upload = useCallback((_index, r2Key, fileName) => {
    updateSessionVideo({
      r2_key: r2Key,
      video_source: r2Key ? 'r2' : 'youtube',
      youtube_url: '',
      zoom_meeting_id: '',
      google_meet_id: '',
      upload_file_name: fileName || '',
      upload_status: r2Key ? 'done' : 'idle',
      upload_progress: r2Key ? 100 : 0,
    });
  }, [updateSessionVideo]);

  const handleSessionClearR2Upload = useCallback(() => {
    updateSessionVideo({
      r2_key: '',
      upload_file_name: '',
      upload_status: 'idle',
      upload_progress: 0,
    });
  }, [updateSessionVideo]);

  const handleSessionVideoSourceChange = useCallback((_index, source) => {
    updateSessionVideo({ video_source: source });
  }, [updateSessionVideo]);

  const openContactForm = () => {
    setContactFormName('');
    setContactFormPhone('');
    setContactFormError(null);
    setContactFormOpen(true);
  };

  const closeContactForm = () => {
    setContactFormOpen(false);
    setContactFormName('');
    setContactFormPhone('');
    setContactFormError(null);
  };

  const saveContactForm = () => {
    const name = contactFormName.trim();
    const phoneDigits = formatPhoneForDB(contactFormPhone);
    if (!name) {
      setContactFormError({ field: 'name', message: 'Name is required' });
      return;
    }
    if (!phoneDigits || phoneDigits.length <= 2) {
      setContactFormError({ field: 'phone', message: 'Valid phone number is required' });
      return;
    }
    setContactPeople((prev) => [
      ...prev,
      {
        id: `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        phone: phoneDigits,
      },
    ]);
    closeContactForm();
  };

  const removeContactRow = (row) => {
    if (row.kind === 'staff') {
      setAssistantIds((prev) => prev.filter((id) => id !== row._id));
      return;
    }
    setContactPeople((prev) => prev.filter((p) => p.id !== row._id));
  };

  const saveContent = async () => {
    const invalidLinkRow = links.find((row) => {
      const name = (row.name || '').trim();
      if (!name) return false;
      if (isWhatsAppLinkName(name)) return false;
      const link = (row.link || '').trim();
      return link && !isValidHttpUrl(link);
    });

    if (invalidLinkRow) {
      setLinksError('All URLs must start with http:// or https://');
      return;
    }

    setLinksError('');

    const sessionPlayback = resolveSessionPlayback(sessionVideo);

    const linksPayload = links
      .map((row) => {
        const name = row.name.trim();
        if (!name) return null;
        const isWa = isWhatsAppLinkName(name);
        let link = (row.link || '').trim();
        if (isWa) {
          const digits = formatPhoneForWhatsApp(row.phone || link);
          if (!digits) return null;
          link = `https://wa.me/${digits}`;
        }
        if (!link) return null;
        return { name, link };
      })
      .filter(Boolean);

    await patch({
      teacher_picture: teacherPicture,
      teacher_name: teacherName.trim() || null,
      teacher_description: teacherDescription.trim().slice(0, TEACHER_DESCRIPTION_MAX) || null,
      students_teached: studentsTeached === '' ? null : Number(studentsTeached),
      years_of_experience: yearsExperience === '' ? null : Number(yearsExperience),
      session_video_type: sessionPlayback?.type || null,
      session_video_id: sessionPlayback?.id || null,
      dates_of_sessions: centerIds,
      contact_assistants: assistantIds,
      contact_people: contactPeople
        .map((p) => ({
          id: p.id,
          name: (p.name || '').trim(),
          phone: formatPhoneForDB(p.phone || ''),
        }))
        .filter((p) => p.name && p.phone),
      links: linksPayload.length ? linksPayload : null,
      students_testimonials: null,
      testimonials_to_show: testimonialsToShow === '' ? null : Number(testimonialsToShow),
      outro_text: outroText.trim() || null,
      note: noteText.trim() || null,
    });
  };

  const cancelContent = () => {
    if (!data || saving) return;
    teacherImageDraftRef.current = false;
    applyFormFromServer(data);
  };

  const marketingPageUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/welcome`;
  }, []);

  const copyMarketingPageLink = () => {
    const url = marketingPageUrl || (typeof window !== 'undefined' ? window.location.href : '');
    navigator.clipboard.writeText(url);
    setCopyLinkSuccess('Link copied to clipboard');
    window.setTimeout(() => setCopyLinkSuccess(''), 3000);
  };

  const previewScheduleRows = useMemo(() => {
    if (!canEdit) return data?.schedule_rows || [];
    const detail = options.centersDetail || [];
    if (!centerIds.length || !detail.length) return [];
    const idSet = new Set(centerIds);
    const selected = detail.filter((c) => idSet.has(c._id));
    return buildCenterScheduleRows(selected);
  }, [canEdit, data?.schedule_rows, centerIds, options.centersDetail]);

  const previewAssistants = useMemo(() => {
    if (!canEdit) return data?.assistants || [];
    if (!assistantIds.length) return [];
    const staffMap = new Map((options.staff || []).map((s) => [s.value, s]));
    return assistantIds
      .map((id) => {
        const s = staffMap.get(id);
        if (!s) return null;
        return {
          _id: id,
          name: s.name || s.label,
          phone: s.phone || '',
          role: s.role || '',
          kind: 'staff',
        };
      })
      .filter(Boolean);
  }, [canEdit, data?.assistants, assistantIds, options.staff]);

  const previewContactPeople = useMemo(() => {
    if (!canEdit) return data?.contact_people || [];
    return contactPeople;
  }, [canEdit, data?.contact_people, contactPeople]);

  const scheduleRows = canEdit ? previewScheduleRows : data?.schedule_rows || [];

  const contactRows = useMemo(() => {
    const staffRows = (canEdit ? previewAssistants : data?.assistants || []).map((a) => ({
      _id: a._id,
      name: a.name,
      phone: a.phone || '',
      kind: 'staff',
    }));
    const peopleRows = (canEdit ? previewContactPeople : data?.contact_people || []).map((p) => ({
      _id: p.id || p._id,
      name: p.name,
      phone: p.phone || '',
      kind: 'custom',
    }));
    return [...staffRows, ...peopleRows];
  }, [canEdit, previewAssistants, previewContactPeople, data?.assistants, data?.contact_people]);

  const sessionPlayback = useMemo(
    () => (canEdit ? resolveSessionPlayback(sessionVideo) : resolveSessionPlayback(data)),
    [canEdit, sessionVideo, data]
  );

  const showUploadTab =
    systemConfig?.cloudflare_r2 === true || systemConfig?.cloudflare_r2 === 'true';

  if (!dataReady) {
    return <MarketingPageLoader active label="Welcome" />;
  }

  const viewLinks = (data.links || []).filter((l) => l.name && l.link);
  const hasHeroVisual =
    data.teacher_picture_url ||
    (data.teacher_name && data.teacher_name.trim()) ||
    (data.teacher_description && data.teacher_description.trim()) ||
    data.students_teached != null ||
    data.years_of_experience != null;

  return (
    <>
      <MarketingPageLoader active={showWelcomeLoader} label="Welcome" />
      <FullPageActionLoader
        active={hidePageLoader}
        label="Updating"
        sub="Updating page visibility. This may take a moment."
      />
      <Box
        className={mp.marketingPageRoot}
        style={{
          minHeight: '100vh',
          color: '#e7ecf3',
          paddingBottom: 48,
        }}
      >
      {!user && (
        <Box component="header" className={mp.publicHeader} py="sm" px="md">
          <Group
            className={mp.publicHeaderInner}
            justify="space-between"
            align="center"
            wrap="nowrap"
            gap="sm"
            maw={1100}
            mx="auto"
          >
            <div className={mp.publicHeaderBrand}>
              <button
                type="button"
                className={mp.publicHeaderLogoBtn}
                onClick={handleMarketingLogoClick}
                aria-label={`Go to ${headerTitle} home`}
              >
                <Image
                  src="/logo.png"
                  alt={`${headerTitle} logo`}
                  width={50}
                  height={50}
                  className={mp.publicHeaderLogo}
                />
              </button>
              <span className={mp.publicHeaderTitle}>{headerTitle}</span>
            </div>
            <Button
              className={mp.publicHeaderCopyBtn}
              variant="light"
              color="gray"
              leftSection={<Image src="/copy2.svg" alt="" width={18} height={18} />}
              onClick={copyMarketingPageLink}
            >
              Copy page URL
            </Button>
          </Group>
        </Box>
      )}

      <Stack gap="xl" maw={1100} mx="auto" px="md" mt="lg" className={mp.sectionsStack}>
        {!canEdit && isAssistant && (
          <Box className={mp.editPageWrap}>
            <TitleBar
              backText="Back"
              href="/dashboard"
              className={mp.titleBar}
              style={{ flexWrap: 'wrap', gap: 12 }}
            >
              <div className={mp.titleHeading}>
                <Image src="/marketing.svg" alt="" width={32} height={32} />
                <span className={mp.titleText}>Marketing Page</span>
              </div>
            </TitleBar>
          </Box>
        )}
        {canEdit && (
          <Box className={mp.editPageWrap}>
            <TitleBar
              backText="Back"
              href={null}
              className={mp.titleBar}
              style={{ flexWrap: 'wrap', gap: 12 }}
            >
              <div className={mp.titleHeading}>
                <Image src="/marketing.svg" alt="" width={32} height={32} />
                <span className={mp.titleText}>Manage Marketing Page</span>
              </div>
            </TitleBar>

            <Paper
              shadow="none"
              radius="lg"
              p="lg"
              className={mp.pageStateCard}
              styles={{ root: { boxShadow: 'none' } }}
            >
              <div className={mp.pageStateInner}>
                <div className={mp.pageStateText}>
                  <Text fw={800} size="lg" className={mp.pageStateTitle}>
                    Page State
                  </Text>
                  <Text size="sm" className={mp.pageStateDesc} mt={4}>
                    {pageStateChecked
                      ? 'Visitors can view the page.'
                      : 'Page is hidden from visitors.'}
                  </Text>
                </div>
                <div
                  className={mp.pageStateSwitchWrap}
                  style={hidePageLoader ? { pointerEvents: 'none' } : undefined}
                >
                  <Switch
                    className={mp.pageStateSwitch}
                    checked={pageStateChecked}
                    onChange={() => handlePageStateToggle(!pageStateChecked)}
                    color="teal"
                    size="lg"
                    disabled={saving}
                    label={pageStateChecked ? 'Published' : 'Hidden'}
                    styles={{ label: { color: '#e2e8f0', fontWeight: 700 } }}
                    thumbIcon={
                      pageStateChecked ? (
                        <IconCheck size={12} color="var(--mantine-color-teal-6)" />
                      ) : (
                        <IconX size={12} color="var(--mantine-color-red-6)" />
                      )
                    }
                  />
                </div>
              </div>
            </Paper>
          </Box>
        )}

        {/* Section 1 — Hero */}
        {(hasHeroVisual || viewTestimonials.length > 0 || canEdit) && (
          <Paper radius="xl" p={{ base: 'md', sm: 'xl' }} style={HERO_SECTION_STYLE}>
            <Stack gap="lg">
              <Group align="flex-start" justify="center" wrap="wrap" gap="xl">
                {(data.teacher_picture_url || canEdit || imagePreview) && (
                  <Box style={{ flexShrink: 0, textAlign: 'center' }}>
                    {!canEdit && data.teacher_picture_url ? (
                      <Stack gap="sm" align="center">
                        <Box
                          style={{
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            margin: '0 auto',
                            overflow: 'hidden',
                            border: '2px solid #1FA8DC',
                            boxShadow: '0 2px 8px rgba(31,168,220,0.15)',
                            position: 'relative',
                          }}
                        >
                          <Image
                            src={data.teacher_picture_url}
                            alt="Teacher"
                            fill
                            style={{ objectFit: 'cover' }}
                            unoptimized
                          />
                        </Box>
                        {data.teacher_name?.trim() ? (
                          <Title
                            order={2}
                            ta="center"
                            c="orange.4"
                            style={{ fontSize: 'clamp(1.25rem, 4vw, 1.65rem)' }}
                          >
                            {data.teacher_name}
                          </Title>
                        ) : null}
                      </Stack>
                    ) : canEdit ? (
                      <Box>
                        <Text
                          size="sm"
                          fw={600}
                          c="gray.2"
                          mb={10}
                          style={{ display: 'block', textAlign: 'center' }}
                        >
                          Profile Picture
                        </Text>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          {imagePreview ? (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <div
                                onDragOver={handleTeacherDragOver}
                                onDragLeave={handleTeacherDragLeave}
                                onDrop={handleTeacherDrop}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: '50%',
                                  background: '#e9ecef',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: isDragging
                                    ? '0 4px 16px rgba(31,168,220,0.4)'
                                    : '0 2px 8px rgba(31,168,220,0.15)',
                                  border: isDragging ? '3px dashed #1FA8DC' : '2px solid #1FA8DC',
                                  overflow: 'hidden',
                                  position: 'relative',
                                  transform: isDragging ? 'scale(1.05)' : 'scale(1)',
                                  transition: 'all 0.3s ease',
                                }}
                                title="Drag & drop new image"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview from FileReader (same as sign-up) */}
                                <img
                                  key={teacherPicture || 'teacher-draft-preview'}
                                  src={imagePreview}
                                  alt="Profile preview"
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '50%',
                                  }}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  teacherImageDraftRef.current = true;
                                  setImagePreview(null);
                                  setTeacherPicture(null);
                                  const el = document.getElementById('marketing-teacher-picture-upload');
                                  if (el) el.value = '';
                                }}
                                style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  right: 0,
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  background: '#dc3545',
                                  border: '2px solid white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                  transition: 'all 0.2s ease',
                                  zIndex: 9,
                                }}
                                title="Remove image"
                              >
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="white"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <label
                              htmlFor="marketing-teacher-picture-upload"
                              onDragOver={handleTeacherDragOver}
                              onDragLeave={handleTeacherDragLeave}
                              onDrop={handleTeacherDrop}
                              style={{
                                width: 120,
                                height: 120,
                                borderRadius: '50%',
                                background: uploadingPic
                                  ? 'linear-gradient(135deg, #6c757d 0%, #495057 100%)'
                                  : isDragging
                                    ? 'linear-gradient(135deg, #1FA8DC 0%, #87CEEB 100%)'
                                    : 'linear-gradient(135deg, #87CEEB 0%, #B0E0E6 100%)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: uploadingPic ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                textAlign: 'center',
                                transition: 'all 0.3s ease',
                                boxShadow: isDragging
                                  ? '0 6px 20px rgba(31, 168, 220, 0.5)'
                                  : '0 4px 12px rgba(135, 206, 235, 0.3)',
                                opacity: uploadingPic ? 0.7 : 1,
                                border: isDragging ? '3px dashed white' : '2px solid #1FA8DC',
                                flexDirection: 'column',
                                gap: 8,
                                transform: isDragging ? 'scale(1.05)' : 'scale(1)',
                              }}
                            >
                              {uploadingPic ? (
                                <>
                                  <div className={mp.teacherUploadSpin} />
                                  <span style={{ fontSize: '0.75rem' }}>Uploading...</span>
                                </>
                              ) : (
                                <>
                                  <Image
                                    src="/upload.svg"
                                    alt="Upload"
                                    width={32}
                                    height={32}
                                    style={{ filter: 'brightness(0) invert(1)' }}
                                  />
                                  <span style={{ fontSize: '0.75rem' }}>Upload Picture</span>
                                </>
                              )}
                            </label>
                          )}
                          <input
                            id="marketing-teacher-picture-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleTeacherFileInputChange}
                            disabled={uploadingPic}
                            style={{ display: 'none' }}
                          />
                          <small style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>
                            Max size: 10 MB.
                          </small>
                          {teacherPicError ? (
                            <Text size="sm" c="red.4" mt={4} style={{ maxWidth: 280 }}>
                              {teacherPicError}
                            </Text>
                          ) : null}
                        </div>
                      </Box>
                    ) : null}
                  </Box>
                )}

                <Stack gap="md" style={{ flex: 1, minWidth: 260, maxWidth: 560 }}>
                  {!canEdit && data.teacher_description?.trim() ? (
                    <Text
                      size="lg"
                      ta="center"
                      className={`${mp.descriptionText} ${playfair.className}`}
                    >
                      {data.teacher_description}
                    </Text>
                  ) : null}
                  {canEdit && (
                    <Stack gap="md" className={`${mp.editForm} ${mp.editFormHero}`}>
                      <div className="form-group">
                        <label className="form-label">Name</label>
                        <input
                          className="form-input"
                          value={teacherName}
                          onChange={(e) => setTeacherName(e.target.value)}
                          placeholder="Teacher name"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Description</label>
                        <textarea
                          className="form-input"
                          rows={5}
                          value={teacherDescription}
                          onChange={(e) =>
                            setTeacherDescription(e.target.value.slice(0, TEACHER_DESCRIPTION_MAX))
                          }
                          maxLength={TEACHER_DESCRIPTION_MAX}
                          placeholder="Write a short introduction…"
                          style={{ resize: 'vertical', minHeight: 120 }}
                        />
                        <small style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginTop: 6, textAlign: 'right' }}>
                          {teacherDescription.length}/{TEACHER_DESCRIPTION_MAX}
                        </small>
                      </div>
                    </Stack>
                  )}
                </Stack>
              </Group>

              {(data.students_teached != null || data.years_of_experience != null || canEdit) && (
                <Group
                  justify="center"
                  grow
                  gap="xl"
                  wrap="wrap"
                  mt="md"
                  style={{
                    padding: '28px 16px',
                    borderRadius: 16,
                    background: 'rgba(0,0,0,0.35)',
                  }}
                >
                  {(data.students_teached != null || canEdit) && (
                    <Stack gap={6} align="center" style={{ minWidth: 200 }}>
                      {canEdit ? (
                        <NumberInput
                          label="Students taught"
                          value={studentsTeached === '' ? undefined : Number(studentsTeached)}
                          onChange={(v) => setStudentsTeached(v === '' || v === undefined ? '' : String(v))}
                          hideControls
                          styles={{ input: { fontSize: 28, fontWeight: 800, textAlign: 'center' } }}
                        />
                      ) : (
                        <>
                          <Title order={2} c="orange.4" style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}>
                            <AnimatedInteger
                              value={data.students_teached}
                              formatter={(n) => formatTeached(n)}
                              enabled={welcomeReady}
                            />
                          </Title>
                          <Text fw={700} c="gray.1">
                            Students taught
                          </Text>
                        </>
                      )}
                    </Stack>
                  )}
                  {(data.years_of_experience != null || canEdit) && (
                    <Stack gap={6} align="center" style={{ minWidth: 200 }}>
                      {canEdit ? (
                        <NumberInput
                          label="Years of experience"
                          value={yearsExperience === '' ? undefined : Number(yearsExperience)}
                          onChange={(v) => setYearsExperience(v === '' || v === undefined ? '' : String(v))}
                          hideControls
                          styles={{ input: { fontSize: 28, fontWeight: 800, textAlign: 'center' } }}
                        />
                      ) : (
                        <>
                          <Title order={2} c="orange.4" style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}>
                            <AnimatedInteger
                              value={data.years_of_experience}
                              formatter={formatYears}
                              enabled={welcomeReady}
                            />
                          </Title>
                          <Text fw={700} c="gray.1">
                            Years of experience
                          </Text>
                        </>
                      )}
                    </Stack>
                  )}
                </Group>
              )}

              {viewTestimonials.length > 0 && !canEdit && (
                <Carousel
                  className={mp.testimonialCarousel}
                  slideSize="100%"
                  height="auto"
                  emblaOptions={{ loop: true, align: 'start' }}
                  getEmblaApi={setEmbla}
                  withIndicators
                  withControls={false}
                  styles={{
                    viewport: {
                      overflow: 'hidden',
                      transition: 'height 280ms ease',
                    },
                    container: {
                      alignItems: 'flex-start',
                    },
                    slide: {
                      height: 'auto',
                    },
                    indicator: {
                      background: 'color-mix(in srgb, #fbbf24 40%, transparent)',
                      '&[data-active]': {
                        background: '#fbbf24',
                      },
                    },
                    indicators: {
                      position: 'relative',
                      bottom: 'auto',
                      marginTop: 10,
                    },
                  }}
                >
                  {viewTestimonials.map((t, idx) => (
                    <Carousel.Slide key={`${t.id ?? t.name}-${idx}`}>
                      <Paper
                        className={`${mp.testimonialCard} ${mp[testimonialCardSizeClass(t.text)]}`}
                      >
                        <Group gap="sm" mb="sm" wrap="wrap" align="center">
                          <Avatar radius="xl" color="orange">
                            {t.name?.[0]}
                          </Avatar>
                          <div className={mp.testimonialMeta}>
                            <Text fw={700} className={mp.testimonialName}>
                              {t.name} • {t.course}
                            </Text>
                            {t.score != null && t.score !== '' ? (
                              <Text size="sm" fw={600} className={mp.testimonialScore}>
                                score : {t.score}
                              </Text>
                            ) : null}
                          </div>
                        </Group>
                        <Text className={mp.testimonialBody}>{t.text}</Text>
                        {t.rating != null ? (
                          <Rating
                            value={Number(t.rating) || 0}
                            readOnly
                            fractions={1}
                            size="sm"
                            color="yellow"
                            mt="sm"
                            className={mp.testimonialRating}
                          />
                        ) : null}
                      </Paper>
                    </Carousel.Slide>
                  ))}
                </Carousel>
              )}

              {canEdit && (
                <div className={`${mp.editForm} ${mp.editFormHero} ${mp.testimonialsEdit}`}>
                  <Title order={4} className={mp.testimonialsEditTitle}>
                    Student reviews
                  </Title>
                  <p className={mp.testimonialsEditLead}>
                  Only activated student reviews will show.
                  </p>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Number of student reviews to show</label>
                    <input
                      className="form-input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={testimonialsToShow}
                      onChange={(e) => setTestimonialsToShow(e.target.value)}
                      placeholder="e.g. 5"
                    />
                  </div>
                </div>
              )}
            </Stack>
          </Paper>
        )}

        {/* Section 2 — Links (mobile: after Contact Us) */}
        {(viewLinks.length > 0 || canEdit) && (
          <Paper radius="xl" p="lg" className={`${mp.darkSection} ${mp.section} ${mp.linksSection}`}>
            <Title order={3} mb="md" className={mp.darkSectionTitle}>
              Links
            </Title>
            {canEdit && (
              <Stack gap="sm" mb="md" className={mp.editForm}>
                {linksError ? (
                  <Text size="sm" c="red.4">
                    {linksError}
                  </Text>
                ) : null}
                {links.map((row, i) => {
                  const isWa = isWhatsAppLinkName(row.name);
                  const hasInvalidUrl =
                    !isWa && (row.link || '').trim() && !isValidHttpUrl(row.link || '');
                  return (
                    <Paper key={i} p="md" radius="md" className={mp.editItemCard} style={{ border: '1px solid #e9ecef' }}>
                      <div className="form-group">
                        <label className="form-label">Button text</label>
                        <input
                          className="form-input"
                          placeholder="e.g. Facebook Page"
                          value={row.name}
                          onChange={(e) => {
                            const v = [...links];
                            v[i].name = e.target.value;
                            setLinks(v);
                          }}
                        />
                      </div>
                      {isWa ? (
                        <div className="form-group">
                          <label className="form-label">WhatsApp number</label>
                          <PhoneInput
                            country="eg"
                            value={row.phone || ''}
                            onChange={(phone) => {
                              const v = [...links];
                              v[i].phone = phone;
                              setLinks(v);
                            }}
                            inputStyle={{ width: '100%', height: 48, borderRadius: 10 }}
                          />
                        </div>
                      ) : (
                        <div className="form-group">
                          <label className="form-label">URL</label>
                          <input
                            className="form-input"
                            type="url"
                            placeholder="https://example.com"
                            value={row.link}
                            onChange={(e) => {
                              const v = [...links];
                              v[i].link = e.target.value;
                              setLinks(v);
                              if (linksError) setLinksError('');
                            }}
                          />
                          {hasInvalidUrl ? (
                            <Text size="xs" c="red.6" mt={6}>
                              URL must start with http:// or https://
                            </Text>
                          ) : null}
                        </div>
                      )}
                      <div className={mp.editItemDeleteRow}>
                        <button
                          type="button"
                          className={mp.btnDelete}
                          onClick={() => setLinks(links.filter((_, j) => j !== i))}
                        >
                          Delete
                        </button>
                      </div>
                    </Paper>
                  );
                })}
                <button
                  type="button"
                  className={mp.btnAdd}
                  onClick={() => setLinks([...links, { name: '', link: '', phone: '' }])}
                >
                  <Image src="/plus.svg" alt="" width={18} height={18} />
                  Add link
                </button>
              </Stack>
            )}
            <div className={mp.linksGrid}>
              {(canEdit ? links.filter((l) => l.name.trim()) : viewLinks).map((row, idx) => {
                const name = row.name;
                const link = row.link;
                const icon = socialIconSrc(name);
                const isWa = isWhatsAppLinkName(name);
                let href = (link || '').trim();
                if (isWa) {
                  const digits = formatPhoneForWhatsApp(row.phone || link);
                  href = digits ? `https://wa.me/${digits}` : '';
                }
                if (!name?.trim() || !href) return null;
                return (
                  <a
                    key={`${name}-${idx}`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={mp.linkBtn}
                  >
                    <Image src={icon} alt="" width={26} height={26} />
                    <span>{name}</span>
                  </a>
                );
              })}
            </div>
          </Paper>
        )}

        {/* Section 3 — Free Session */}
        {(sessionPlayback || canEdit) && (
          <Paper radius="xl" p="lg" className={`${mp.darkSection} ${mp.section} ${mp.youtubeSection}`}>
            <Title order={3} mb="md" className={mp.darkSectionTitle}>
              Free Session
            </Title>
            {canEdit && (
              <div className={`${mp.editForm} ${mp.editFormHero} ${mp.sessionVideoEdit}`}>
                <VideoInput
                  index={0}
                  video={sessionVideo}
                  onVideoNameChange={handleSessionVideoNameChange}
                  onYouTubeUrlChange={handleSessionYouTubeUrlChange}
                  onZoomMeetingIdChange={handleSessionZoomMeetingIdChange}
                  onClearYouTubeUrl={handleSessionClearYouTubeUrl}
                  onClearZoomMeetingId={handleSessionClearZoomMeetingId}
                  onGoogleMeetIdChange={handleSessionGoogleMeetIdChange}
                  onClearGoogleMeetId={handleSessionClearGoogleMeetId}
                  onR2Upload={handleSessionR2Upload}
                  onClearR2Upload={handleSessionClearR2Upload}
                  onVideoSourceChange={handleSessionVideoSourceChange}
                  onRemove={() => {}}
                  canRemove={false}
                  errors={sessionVideoErrors}
                  showUploadTab={showUploadTab}
                  hideTitle
                  hideVideoName
                  hideYoutubePreview
                />
              </div>
            )}
            {sessionPlayback && (
              <Box className="video-player-wrapper" style={{ borderRadius: 12, overflow: 'hidden', marginTop: canEdit ? 16 : 0 }}>
                {sessionPlayback.type === 'r2' ? (
                  <R2VideoPlayer r2Key={sessionPlayback.id} hideWatermark />
                ) : sessionPlayback.type === 'zoom' ? (
                  <ZoomVideoPlayer meetingId={sessionPlayback.id} hideWatermark />
                ) : sessionPlayback.type === 'google_meet' ? (
                  <GoogleMeetVideoPlayer secureId={sessionPlayback.id} hideWatermark />
                ) : (
                  <YoutubeEmbedWithProgress youtubeVideoId={sessionPlayback.id} hideWatermark />
                )}
              </Box>
            )}
          </Paper>
        )}

        {/* Section 4 — Centers */}
        {((scheduleRows.length > 0) || canEdit) && (
          <Paper radius="xl" p="lg" className={`${mp.darkSection} ${mp.section} ${mp.centersSection}`}>
            <Title order={3} mb="md" className={mp.darkSectionTitle}>
              Centers Schedule
            </Title>
            {canEdit && (
              <MarketingMultiSelect
                label="Centers dates & locations to show"
                options={options.centers || []}
                value={centerIds}
                onChange={setCenterIds}
                placeholder="Select centers…"
                onDark
                showChips
              />
            )}
            {scheduleRows.length > 0 && (
              <ScrollArea h={360} type="auto" mt="md">
                <Table striped highlightOnHover withTableBorder className={mp.premiumTable}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Center</Table.Th>
                      <Table.Th>Course</Table.Th>
                      <Table.Th>Day</Table.Th>
                      <Table.Th>Time</Table.Th>
                      <Table.Th>Location</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {scheduleRows.map((r, i) => (
                      <Table.Tr key={`${r.center}-${i}`}>
                        <Table.Td>{r.center}</Table.Td>
                        <Table.Td>{r.course_display ?? r.course}</Table.Td>
                        <Table.Td>{r.day}</Table.Td>
                        <Table.Td>{r.time}</Table.Td>
                        <Table.Td>
                          <ScheduleLocationCell row={r} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Paper>
        )}

        {/* Section 5 — Contact Us */}
        {((contactRows.length > 0) || canEdit) && (
          <Paper radius="xl" p="lg" className={`${mp.darkSection} ${mp.section} ${mp.contactSection}`}>
            <Title order={3} mb="md" className={mp.darkSectionTitle}>
              Contact Us
            </Title>
            {canEdit && (
              <Box mb="md">
                <MarketingMultiSelect
                  label="Assistants / admins to contact with"
                  options={options.staff || []}
                  value={assistantIds}
                  onChange={setAssistantIds}
                  placeholder="Select people…"
                  onDark
                />
              </Box>
            )}
            {contactRows.length > 0 && (
              <ScrollArea h={320} type="auto">
                <Table striped highlightOnHover withTableBorder className={mp.premiumTable}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Phone No.</Table.Th>
                      <Table.Th>Send WhatsApp</Table.Th>
                      {canEdit ? <Table.Th>Remove</Table.Th> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {contactRows.map((a) => {
                      const phoneNumber = formatPhoneForWhatsApp(a.phone);
                      const whatsappUrl = phoneNumber ? `https://wa.me/${phoneNumber}` : '';
                      return (
                        <Table.Tr key={`${a.kind}-${a._id}`}>
                          <Table.Td style={{ fontWeight: 600 }}>
                            {a.name}
                          </Table.Td>
                          <Table.Td>{a.phone}</Table.Td>
                          <Table.Td>
                            <Button
                              component="a"
                              href={whatsappUrl || undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="sm"
                              disabled={!whatsappUrl}
                              className={mp.whatsappBtn}
                              styles={{
                                root: {
                                  backgroundColor: '#43d55d',
                                  '&:hover': { backgroundColor: '#43d55d' },
                                },
                              }}
                              leftSection={<Image src="/whatsapp.svg" alt="" width={20} height={20} />}
                            >
                              Send
                            </Button>
                          </Table.Td>
                          {canEdit ? (
                            <Table.Td>
                              <button
                                type="button"
                                className={mp.contactTrashBtn}
                                onClick={() => removeContactRow(a)}
                                aria-label={`Remove ${a.name}`}
                                title="Remove"
                              >
                                <IconTrash size={18} />
                              </button>
                            </Table.Td>
                          ) : null}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
            {canEdit && (
              <div className={mp.contactAddRow}>
                <button type="button" className={mp.btnAdd} onClick={openContactForm}>
                  <Image src="/plus.svg" alt="" width={18} height={18} />
                  Add
                </button>
              </div>
            )}
          </Paper>
        )}

        {(data.note?.trim() || canEdit) && (
          <Paper
            radius="xl"
            p="lg"
            className={`${mp.darkSection} ${mp.noteSectionCard} ${mp.noteSection}`}
          >
            {canEdit ? (
              <Stack gap="sm" align="stretch" className={`${mp.editForm} ${mp.editFormHero} ${mp.noteSectionEdit}`}>
                <Title order={3} className={mp.darkSectionTitle}>
                  Note
                </Title>
                <div className="form-group">
                  <textarea
                    className={`form-input ${mp.noteInput}`}
                    rows={4}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add an important note for visitors…"
                  />
                </div>
              </Stack>
            ) : (
              <Stack gap="md" className={mp.noteSectionView}>
                <Title order={3} className={mp.darkSectionTitle}>
                  Note
                </Title>
                <p className={`${mp.noteText} ${lora.className}`}>{data.note}</p>
              </Stack>
            )}
          </Paper>
        )}

        {(data.outro_text?.trim() || canEdit) && (
          <Paper
            radius="xl"
            p="lg"
            className={`${mp.darkSection} ${mp.outroSectionCard} ${mp.outroSection}`}
          >
            {canEdit ? (
              <Stack gap="sm" className={`${mp.editForm} ${mp.editFormHero}`}>
                <Title order={3} className={mp.darkSectionTitle}>
                  Closing message
                </Title>
                <div className="form-group">
                  <textarea
                    className={`form-input ${mp.outroInput}`}
                    rows={3}
                    value={outroText}
                    onChange={(e) => setOutroText(e.target.value)}
                    placeholder="A short closing note for visitors…"
                  />
                </div>
              </Stack>
            ) : (
              <p className={`${mp.outroText} ${caveat.className}`}>{data.outro_text}</p>
            )}
          </Paper>
        )}

        {(canEdit || isAssistant) && (
          <div className={mp.copyLinkSection}>
            <div className={`${mp.copyLinkCard} ${mp.darkSection}`}>
              <div className={`${mp.copyLinkTitle} ${mp.darkSectionTitle}`}>
                <Image src="/link2.svg" alt="" width={20} height={20} />
                Welcome Page Link:
              </div>
              <div className={mp.copyLinkDisplay}>
                <strong>{marketingPageUrl}</strong>
              </div>
              <button type="button" className={mp.copyLinkBtn} onClick={copyMarketingPageLink}>
                <Image src="/copy2.svg" alt="" width={20} height={20} />
                Copy Link
              </button>
              {copyLinkSuccess ? (
                <div className={mp.copyLinkSuccess}>✅ {copyLinkSuccess}</div>
              ) : null}
            </div>
          </div>
        )}

        {canEdit && (
          <div className={mp.saveRow}>
            <button
              type="button"
              className={mp.btnSave}
              disabled={!hasFormChanges || saving}
              onClick={saveContent}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className={mp.btnCancel}
              disabled={!hasFormChanges || saving}
              onClick={cancelContent}
            >
              Cancel
            </button>
          </div>
        )}
      </Stack>

      {confirmHideOpen && (
        <div
          className="confirm-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmHideOpen(false);
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 32,
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16, textAlign: 'center', color: '#1e293b' }}>
              Hide marketing page?
            </h3>
            <p className={mp.confirmText}>
              This page will be hidden from everyone. Anyone trying to access it will be redirected
              to a 404 page. Continue?
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={confirmHidePage}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                Hide page
              </button>
              <button
                type="button"
                onClick={() => setConfirmHideOpen(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {contactFormOpen && (
        <div
          className={mp.contactModalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeContactForm();
          }}
        >
          <div className={mp.contactModalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={mp.contactModalTitle}>Add Contact</h3>
            <p className={mp.contactModalDesc}>Add a person to the Contact Us list.</p>
            <div className={mp.contactModalField}>
              <label className={mp.contactModalLabel} htmlFor="welcome-contact-name">
                Name
              </label>
              <input
                id="welcome-contact-name"
                className={`${mp.contactModalInput} ${
                  contactFormError?.field === 'name' ? mp.contactModalInputError : ''
                }`}
                value={contactFormName}
                onChange={(e) => {
                  setContactFormName(e.target.value);
                  if (contactFormError) setContactFormError(null);
                }}
                placeholder="Enter name"
                autoComplete="off"
              />
              {contactFormError?.field === 'name' ? (
                <p className={mp.contactModalErrorText}>{contactFormError.message}</p>
              ) : null}
            </div>
            <div className={mp.contactModalField}>
              <label className={mp.contactModalLabel}>Phone number</label>
              <div
                className={`${mp.contactModalPhone} ${
                  contactFormError?.field === 'phone' ? mp.contactModalPhoneError : ''
                }`}
              >
                <PhoneInput
                  country="eg"
                  enableSearch
                  value={contactFormPhone || ''}
                  onChange={(value) => {
                    const validation = validateEgyptPhone(value);
                    setContactFormPhone(validation.value);
                    if (contactFormError) setContactFormError(null);
                  }}
                  onKeyDown={(e) => handleEgyptPhoneKeyDown(e, contactFormPhone)}
                  containerClass="phone-container"
                  inputClass="phone-input"
                  buttonClass="phone-flag-btn"
                  dropdownClass="phone-dropdown"
                  placeholder="Enter Phone Number"
                />
              </div>
              {contactFormError?.field === 'phone' ? (
                <p className={mp.contactModalErrorText}>{contactFormError.message}</p>
              ) : null}
            </div>
            <div className={mp.contactModalActions}>
              <button type="button" className={mp.btnSave} onClick={saveContactForm}>
                Save
              </button>
              <button type="button" className={mp.contactCancelBtn} onClick={closeContactForm}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </Box>
    </>
  );
}

