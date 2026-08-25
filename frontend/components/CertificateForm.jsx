import { useEffect, useMemo, useRef, useState } from 'react';
import { ColorInput } from '@mantine/core';
import AccountStateSelect from './AccountStateSelect';
import CertificateStudentsSelect from './CertificateStudentsSelect';
import FontFamilySelect from './FontFamilySelect';
import apiClient from '../lib/axios';
import {
  fontCssFamily,
  fontWeightFor,
  ensureCertificateGoogleFontsLoaded,
  getFontFileUrl,
  resolveCertificateFontName,
} from '../lib/certificateFonts';
import { buildCenteredTextPath, parseFontBuffer } from '../lib/certificateTextPath';

const CERT_COLOR_SWATCHES = [
  '#1a1a1a',
  '#000000',
  '#ffffff',
  '#1FA8DC',
  '#0ea5e9',
  '#dc2626',
  '#16a34a',
  '#ca8a04',
  '#7c3aed',
  '#db2777',
  '#0f766e',
  '#334155',
];

const fieldStyle = (hasError) => ({
  width: '100%',
  padding: '12px 16px',
  border: hasError ? '2px solid #f87171' : '2px solid #e9ecef',
  borderRadius: 12,
  fontSize: '1rem',
  background: hasError ? 'linear-gradient(145deg, #fff5f5 0%, #ffffff 100%)' : '#fff',
  color: '#212529',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
  boxShadow: hasError
    ? '0 0 0 4px rgba(220, 53, 69, 0.12), 0 8px 18px rgba(220, 53, 69, 0.08)'
    : 'none',
});

function FieldError({ message }) {
  if (!message) return null;
  const text = String(message).replace(/^❌\s*/, '');
  return (
    <div
      data-cert-error="true"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 8,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'linear-gradient(135deg, #fff5f5 0%, #fee2e2 100%)',
        border: '1px solid rgba(248, 113, 113, 0.45)',
        boxShadow: '0 6px 16px rgba(220, 53, 69, 0.08)',
        animation: 'certErrorIn 0.28s ease',
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #ef4444, #dc2626)',
          color: '#fff',
          fontSize: '0.72rem',
          fontWeight: 800,
          marginTop: 1,
        }}
      >
        !
      </span>
      <span style={{ color: '#991b1b', fontSize: '0.86rem', fontWeight: 700, lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}

function ValidationBanner({ count }) {
  if (!count) return null;
  return (
    <div
      data-cert-error="true"
      style={{
        marginBottom: 22,
        padding: '14px 16px',
        borderRadius: 14,
        background: 'linear-gradient(135deg, #fff5f5 0%, #fee2e2 55%, #fff7ed 140%)',
        border: '1.5px solid rgba(248, 113, 113, 0.55)',
        boxShadow: '0 10px 28px rgba(220, 53, 69, 0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        animation: 'certErrorIn 0.3s ease',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'linear-gradient(145deg, #ef4444, #dc2626)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '1.1rem',
          flexShrink: 0,
          boxShadow: '0 8px 16px rgba(220, 53, 69, 0.3)',
        }}
      >
        !
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '0.98rem' }}>
          Please complete required fields
        </div>
        <div style={{ color: '#b91c1c', fontSize: '0.84rem', fontWeight: 600, marginTop: 2 }}>
          {count} field{count === 1 ? '' : 's'} need{count === 1 ? 's' : ''} your attention below
        </div>
      </div>
    </div>
  );
}

export default function CertificateForm({
  mode = 'add',
  initialData,
  onSubmit,
  onCancel,
  submitting = false,
  errorMessage = '',
}) {
  const [formData, setFormData] = useState({
    students: initialData?.students || '',
    state: initialData?.state || 'Activated',
    certificate_name: initialData?.certificate_name || '',
    certificate_image: initialData?.certificate_image || '',
    student_nameX: initialData?.student_nameX ?? '',
    student_nameY: initialData?.student_nameY ?? '',
    fontFamily: resolveCertificateFontName(initialData?.fontFamily || 'Roboto'),
    fontSize: initialData?.fontSize || 75,
    textColor: initialData?.textColor || '#1a1a1a',
  });
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccessFlash, setUploadSuccessFlash] = useState(false);
  const [previewNatural, setPreviewNatural] = useState({ w: 0, h: 0 });
  const [previewSrc, setPreviewSrc] = useState('');
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [placementReady, setPlacementReady] = useState(!!initialData?.certificate_image);
  const [dragging, setDragging] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [centerGuides, setCenterGuides] = useState({ vertical: false, horizontal: false });
  const [previewFont, setPreviewFont] = useState(null);
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    ensureCertificateGoogleFontsLoaded();
  }, []);

  // Load the same TTF used by PNG generation so preview size/style match student side
  useEffect(() => {
    let cancelled = false;
    const resolved = resolveCertificateFontName(formData.fontFamily);
    const url = getFontFileUrl(resolved);
    if (!url) {
      setPreviewFont(null);
      return undefined;
    }
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('font fetch failed');
        const ab = await res.arrayBuffer();
        if (cancelled) return;
        setPreviewFont(parseFontBuffer(ab));
      } catch {
        if (!cancelled) setPreviewFont(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formData.fontFamily]);

  useEffect(() => {
    const img = previewRef.current;
    if (!img) return undefined;
    const update = () => setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(img);
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [previewSrc, placementReady]);

  useEffect(() => {
    let cancelled = false;
    const id = String(formData.certificate_image || '').trim();

    const loadPreview = async () => {
      if (!id) {
        if (!cancelled) {
          setPreviewSrc('');
          setPlacementReady(false);
        }
        return;
      }
      if (id.startsWith('data:') || id.startsWith('blob:') || id.startsWith('http://') || id.startsWith('https://')) {
        if (!cancelled) setPreviewSrc(id);
        return;
      }
      try {
        const { data } = await apiClient.get(
          `/api/certificates/image-url?public_id=${encodeURIComponent(id)}`
        );
        if (!cancelled) {
          setPreviewSrc(data?.url || '');
          setPlacementReady(true);
        }
      } catch {
        if (!cancelled) setPreviewSrc('');
      }
    };

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [formData.certificate_image]);

  useEffect(() => {
    const CENTER_SNAP_PX = 14;
    const onMove = (e) => {
      if (!dragging || !previewRef.current || !previewNatural.w) return;
      const rect = previewRef.current.getBoundingClientRect();
      const scaleX = previewNatural.w / rect.width;
      const scaleY = previewNatural.h / rect.height;
      let x = Math.round((e.clientX - rect.left) * scaleX - dragOffsetRef.current.x);
      let y = Math.round((e.clientY - rect.top) * scaleY - dragOffsetRef.current.y);
      x = Math.max(0, Math.min(previewNatural.w, x));
      y = Math.max(0, Math.min(previewNatural.h, y));

      const centerX = Math.round(previewNatural.w / 2);
      const centerY = Math.round(previewNatural.h / 2);
      const nearVertical = Math.abs(x - centerX) <= CENTER_SNAP_PX;
      const nearHorizontal = Math.abs(y - centerY) <= CENTER_SNAP_PX;
      if (nearVertical) x = centerX;
      if (nearHorizontal) y = centerY;

      setCenterGuides({ vertical: nearVertical, horizontal: nearHorizontal });
      setFormData((prev) => ({
        ...prev,
        student_nameX: x,
        student_nameY: y,
      }));
    };
    const onUp = () => {
      setDragging(false);
      setCenterGuides({ vertical: false, horizontal: false });
    };
    if (dragging) {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, previewNatural.w, previewNatural.h]);

  const clearFieldError = (field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const next = {};
    if (!String(formData.students || '').trim()) next.students = 'Select at least one student';
    if (!String(formData.certificate_name || '').trim()) next.certificate_name = 'Certificate name is required';
    if (!String(formData.certificate_image || '').trim()) next.certificate_image = 'Certificate design image is required';
    if (formData.student_nameX === '' || Number.isNaN(Number(formData.student_nameX))) {
      next.student_nameX = 'X position is required';
    }
    if (formData.student_nameY === '' || Number.isNaN(Number(formData.student_nameY))) {
      next.student_nameY = 'Y position is required';
    }
    const size = Number(formData.fontSize);
    if (!Number.isFinite(size) || size < 1 || size > 150) next.fontSize = 'Font size must be 1–150px';
    if (!formData.fontFamily) next.fontFamily = 'Font family is required';
    if (!formData.textColor) next.textColor = 'Text color is required';
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    if (!ok) {
      setShakeKey((k) => k + 1);
      setTimeout(() => {
        const el = document.querySelector('[data-cert-error="true"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    }
    return ok;
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('❌ Only image files are allowed (PNG, JPG, WEBP, …)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('❌ Max image size is 10 MB');
      return;
    }
    setUploadError('');
    setUploadSuccessFlash(false);
    setUploading(true);
    setUploadProgress(0);
    setPlacementReady(false);
    setDragOver(false);

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (e) => {
          if (!e.lengthComputable) return;
          // Reading file: 0 → 25%
          setUploadProgress(Math.max(1, Math.round((e.loaded / e.total) * 25)));
        };
        reader.onload = () => {
          setUploadProgress(28);
          resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setPreviewSrc(base64);
      setUploadProgress(32);

      const response = await apiClient.post(
        '/api/upload/certificate-image',
        {
          file: base64,
          fileName: file.name,
          fileType: file.type,
        },
        {
          onUploadProgress: (e) => {
            if (e.total && e.total > 0) {
              // Network upload: 32 → 95%
              const networkPct = Math.round((e.loaded / e.total) * 63);
              setUploadProgress(Math.min(95, 32 + networkPct));
            } else {
              setUploadProgress((prev) => Math.min(90, Math.max(prev, prev + 3)));
            }
          },
        }
      );

      if (response.data?.success && response.data?.public_id) {
        setFormData((prev) => ({ ...prev, certificate_image: response.data.public_id }));
        clearFieldError('certificate_image');
        setUploadProgress(100);
        setUploadSuccessFlash(true);
        setTimeout(() => {
          setUploadSuccessFlash(false);
          setPlacementReady(true);
        }, 650);
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to upload image';
      setUploadError(msg.startsWith('❌') ? msg : `❌ ${msg}`);
      setPreviewSrc('');
      setFormData((prev) => ({ ...prev, certificate_image: '' }));
      setPlacementReady(false);
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setFormData((prev) => ({
      ...prev,
      certificate_image: '',
      student_nameX: '',
      student_nameY: '',
    }));
    setPreviewSrc('');
    setPlacementReady(false);
    setUploadError('');
    setUploadSuccessFlash(false);
    setPreviewNatural({ w: 0, h: 0 });
    setFontOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const scale = displaySize.w > 0 && previewNatural.w > 0 ? displaySize.w / previewNatural.w : 1;
  const previewFontPx = Math.max(1, Number(formData.fontSize) || 75) * scale;
  const showDesignExtras =
    !!formData.certificate_image && placementReady && !uploading && !uploadSuccessFlash;

  const previewPath = useMemo(() => {
    if (
      !previewFont ||
      !previewNatural.w ||
      formData.student_nameX === '' ||
      formData.student_nameY === ''
    ) {
      return null;
    }
    try {
      return buildCenteredTextPath(
        previewFont,
        'Student Name',
        Number(formData.fontSize) || 75,
        Number(formData.student_nameX),
        Number(formData.student_nameY)
      );
    } catch {
      return null;
    }
  }, [
    previewFont,
    previewNatural.w,
    previewNatural.h,
    formData.fontSize,
    formData.student_nameX,
    formData.student_nameY,
  ]);

  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!previewRef.current || !previewNatural.w) return;
    const rect = previewRef.current.getBoundingClientRect();
    const scaleX = previewNatural.w / rect.width;
    const scaleY = previewNatural.h / rect.height;
    const pointerX = (e.clientX - rect.left) * scaleX;
    const pointerY = (e.clientY - rect.top) * scaleY;
    dragOffsetRef.current = {
      x: pointerX - Number(formData.student_nameX || 0),
      y: pointerY - Number(formData.student_nameY || 0),
    };
    setDragging(true);
    clearFieldError('student_nameX');
    clearFieldError('student_nameY');
  };

  return (
    <form
      key={shakeKey ? `shake-${shakeKey}` : 'form'}
      className={shakeKey ? 'cert-form-shake' : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate()) return;
        onSubmit({
          students: formData.students,
          state: formData.state || 'Activated',
          certificate_name: String(formData.certificate_name).trim(),
          certificate_image: String(formData.certificate_image).trim(),
          student_nameX: Number(formData.student_nameX),
          student_nameY: Number(formData.student_nameY),
          fontFamily: resolveCertificateFontName(formData.fontFamily),
          fontSize: Math.min(150, Math.max(1, Number(formData.fontSize))),
          textColor: formData.textColor,
        });
      }}
      style={{ overflow: 'visible' }}
    >
      <ValidationBanner count={Object.keys(errors).length} />

      <div
        style={{ marginBottom: 22, overflow: 'visible' }}
        data-cert-error={errors.students ? 'true' : undefined}
      >
        <label style={{ display: 'block', marginBottom: 10, fontWeight: 700, color: '#0f172a' }}>
          Students <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <CertificateStudentsSelect
          value={formData.students}
          onChange={(v) => {
            setFormData((p) => ({ ...p, students: v }));
            if (v.trim()) clearFieldError('students');
          }}
          error={errors.students}
        />
      </div>

      <div style={{ marginBottom: 22, overflow: 'visible' }}>
        <AccountStateSelect
          value={formData.state}
          onChange={(v) => setFormData((p) => ({ ...p, state: v || 'Activated' }))}
          label="Certificate State"
          placeholder="Select Certificate State"
          required={true}
        />
      </div>

      <div
        style={{ marginBottom: 22 }}
        data-cert-error={errors.certificate_name ? 'true' : undefined}
      >
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: '#0f172a' }}>
          Certificate Name <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          type="text"
          value={formData.certificate_name}
          onChange={(e) => {
            setFormData((p) => ({ ...p, certificate_name: e.target.value }));
            if (e.target.value.trim()) clearFieldError('certificate_name');
          }}
          onFocus={(e) => {
            if (!errors.certificate_name) {
              e.target.style.borderColor = '#1FA8DC';
              e.target.style.boxShadow = '0 0 0 4px rgba(31, 168, 220, 0.12)';
            }
          }}
          onBlur={(e) => {
            e.target.style.borderColor = errors.certificate_name ? '#f87171' : '#e9ecef';
            e.target.style.boxShadow = errors.certificate_name
              ? '0 0 0 4px rgba(220, 53, 69, 0.12), 0 8px 18px rgba(220, 53, 69, 0.08)'
              : 'none';
          }}
          placeholder="e.g. Midterm Excellence Award"
          style={fieldStyle(!!errors.certificate_name)}
        />
        <FieldError message={errors.certificate_name} />
      </div>

      <div
        style={{
          marginBottom: 22,
          padding: 3,
          borderRadius: 20,
          background: errors.certificate_image
            ? 'linear-gradient(135deg, rgba(239,68,68,0.55), rgba(248,113,113,0.45))'
            : 'linear-gradient(135deg, rgba(31,168,220,0.55), rgba(254,185,84,0.55) 55%, rgba(14,165,233,0.45))',
          boxShadow: errors.certificate_image
            ? '0 14px 36px rgba(220, 53, 69, 0.16)'
            : '0 14px 36px rgba(31, 168, 220, 0.14)',
        }}
        data-cert-error={errors.certificate_image ? 'true' : undefined}
      >
        <div
          style={{
            padding: 20,
            borderRadius: 17,
            background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 60%, #fffbeb 140%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'linear-gradient(145deg, #1FA8DC, #0ea5e9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 22px rgba(31, 168, 220, 0.35)',
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/upload.svg" alt="" width={22} height={22} style={{ filter: 'brightness(0) invert(1)' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem' }}>
                Upload Certificate Design <span style={{ color: 'red' }}>*</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500, marginTop: 2 }}>
                High-quality design recommended · secure image hosting
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {['PNG', 'JPG', 'WEBP', 'Max 10MB'].map((chip) => (
              <span
                key={chip}
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: '#0369a1',
                  background: 'rgba(31, 168, 220, 0.1)',
                  border: '1px solid rgba(31, 168, 220, 0.22)',
                }}
              >
                {chip}
              </span>
            ))}
          </div>

          {!formData.certificate_image && !uploading && !uploadError && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleUpload(e.dataTransfer.files?.[0]);
              }}
              style={{
                border: errors.certificate_image
                  ? '2px dashed #dc3545'
                  : dragOver
                    ? '2px solid #1FA8DC'
                    : '2px dashed rgba(31, 168, 220, 0.35)',
                borderRadius: 16,
                padding: '44px 22px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver
                  ? 'linear-gradient(160deg, #e0f2fe 0%, #ffffff 55%, #fff7ed 120%)'
                  : 'linear-gradient(160deg, #ffffff 0%, #f8fafc 100%)',
                boxShadow: dragOver
                  ? '0 0 0 4px rgba(31, 168, 220, 0.14), inset 0 1px 0 rgba(255,255,255,0.9)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.9)',
                transition: 'all 0.25s ease',
                transform: dragOver ? 'scale(1.01)' : 'none',
              }}
            >
              <div
                style={{
                  width: 68,
                  height: 68,
                  margin: '0 auto 14px',
                  borderRadius: 20,
                  background: dragOver
                    ? 'linear-gradient(145deg, #1FA8DC, #0ea5e9)'
                    : 'linear-gradient(145deg, rgba(31,168,220,0.12), rgba(254,185,84,0.14))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: dragOver
                    ? '0 12px 24px rgba(31, 168, 220, 0.35)'
                    : '0 8px 18px rgba(15, 23, 42, 0.06)',
                  transition: 'all 0.25s ease',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/upload.svg"
                  alt=""
                  width={28}
                  height={28}
                  style={{
                    filter: dragOver ? 'brightness(0) invert(1)' : 'none',
                    opacity: dragOver ? 1 : 0.85,
                  }}
                />
              </div>
              <div style={{ color: '#0f172a', fontSize: '1.05rem', fontWeight: 800 }}>
                {dragOver ? 'Drop your design now' : 'Click to select a certificate image'}
              </div>
              <div style={{ color: '#64748b', fontSize: '0.88rem', marginTop: 8, fontWeight: 500 }}>
                or drag and drop your design here
              </div>
              <div
                style={{
                  marginTop: 16,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #1FA8DC, #0ea5e9)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  boxShadow: '0 10px 20px rgba(31, 168, 220, 0.28)',
                }}
              >
                Browse files
              </div>
            </div>
          )}

          {uploading && (
            <div
              style={{
                borderRadius: 16,
                padding: 22,
                background: 'linear-gradient(145deg, #f0f9ff, #ffffff)',
                border: '2px solid rgba(31, 168, 220, 0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontWeight: 800, color: '#0369a1' }}>
                <span>{uploadProgress < 30 ? 'Reading image…' : uploadProgress < 100 ? 'Uploading design…' : 'Finishing…'}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{ width: '100%', height: 12, backgroundColor: '#e0f2fe', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${uploadProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #1FA8DC, #38bdf8, #feb954)',
                    borderRadius: 999,
                    transition: 'width 0.2s ease',
                    boxShadow: '0 0 12px rgba(31, 168, 220, 0.45)',
                  }}
                />
              </div>
              <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                Please wait — do not close this page
              </div>
            </div>
          )}

          {uploadSuccessFlash && !uploading && (
            <div
              style={{
                border: '2px solid #34d399',
                borderRadius: 16,
                padding: '18px 20px',
                background: 'linear-gradient(145deg, #ecfdf5, #ffffff)',
                color: '#047857',
                fontWeight: 800,
                animation: 'certFadeIn 0.35s ease',
                textAlign: 'center',
              }}
            >
              ✅ Uploaded successfully — preparing placement tools…
            </div>
          )}

          {uploadError && !uploading && !formData.certificate_image && (
            <div
              style={{
                border: '2px dashed #f87171',
                borderRadius: 16,
                padding: 22,
                background: 'linear-gradient(145deg, #fff5f5, #ffffff)',
                textAlign: 'center',
              }}
            >
              <div style={{ color: '#dc3545', fontWeight: 800, marginBottom: 12, fontSize: '1rem' }}>
                {uploadError.startsWith('❌') ? uploadError : `❌ ${uploadError}`}
              </div>
              <button
                type="button"
                onClick={() => {
                  setUploadError('');
                  fileInputRef.current?.click();
                }}
                style={{
                  padding: '12px 22px',
                  background: 'linear-gradient(135deg, #1FA8DC, #0ea5e9)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 8px 18px rgba(31, 168, 220, 0.3)',
                }}
              >
                Try again
              </button>
            </div>
          )}

          {formData.certificate_image && !uploading && !uploadSuccessFlash && (
            <div
              style={{
                border: '2px solid #34d399',
                borderRadius: 16,
                padding: '14px 16px',
                background: 'linear-gradient(145deg, #ecfdf5, #ffffff)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                animation: 'certFadeIn 0.4s ease',
              }}
            >
              <div>
                <div style={{ color: '#047857', fontWeight: 800 }}>✅ Design uploaded</div>
                <div style={{ color: '#64748b', fontSize: '.85rem', fontWeight: 500 }}>
                  Set name placement and text style below
                </div>
              </div>
              <button
                type="button"
                onClick={removeImage}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ❌ Remove
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
          {errors.certificate_image && !uploadError && (
            <FieldError message={errors.certificate_image} />
          )}
        </div>
      </div>

      {showDesignExtras && (
        <>
          <div
            style={{
              marginBottom: 22,
              padding: 18,
              borderRadius: 14,
              background: '#fff',
              border: '2px solid #e9ecef',
              animation: 'certSlideIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Student Name Placement</div>
            <p style={{ margin: '0 0 14px', color: '#6c757d', fontSize: '0.88rem' }}>
              Saved as X / Y pixel positions. Drag the name on the preview or edit values.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="xy-grid">
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>X position</label>
                <input
                  type="number"
                  value={formData.student_nameX}
                  onChange={(e) => {
                    setFormData((p) => ({
                      ...p,
                      student_nameX: e.target.value === '' ? '' : Number(e.target.value),
                    }));
                    clearFieldError('student_nameX');
                  }}
                  style={fieldStyle(!!errors.student_nameX)}
                />
                {errors.student_nameX && <FieldError message={errors.student_nameX} />}
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Y position</label>
                <input
                  type="number"
                  value={formData.student_nameY}
                  onChange={(e) => {
                    setFormData((p) => ({
                      ...p,
                      student_nameY: e.target.value === '' ? '' : Number(e.target.value),
                    }));
                    clearFieldError('student_nameY');
                  }}
                  style={fieldStyle(!!errors.student_nameY)}
                />
                {errors.student_nameY && <FieldError message={errors.student_nameY} />}
              </div>
            </div>
          </div>

          {previewSrc && (
            <div
              style={{
                marginBottom: 22,
                borderRadius: 14,
                overflow: 'hidden',
                border: '2px solid #e9ecef',
                background: '#0b1220',
                animation: 'certSlideIn 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  background: 'linear-gradient(90deg, rgba(31,168,220,0.25), rgba(254,185,84,0.2))',
                  color: '#e2e8f0',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                }}
              >
                Certificate preview · drag “Student Name”
              </div>
              <div style={{ position: 'relative', touchAction: 'none' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={previewRef}
                  src={previewSrc}
                  alt="Certificate design preview"
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (!img) return;
                    const w = img.naturalWidth || 0;
                    const h = img.naturalHeight || 0;
                    if (!w || !h) return;
                    setPreviewNatural({ w, h });
                    setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
                    setFormData((prev) => {
                      if (prev.student_nameX !== '' && prev.student_nameY !== '') return prev;
                      return {
                        ...prev,
                        student_nameX: Math.round(w / 2),
                        student_nameY: Math.round(h / 2),
                      };
                    });
                  }}
                  onError={() => setPreviewNatural({ w: 0, h: 0 })}
                  style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }}
                />

                {dragging && centerGuides.vertical && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: '50%',
                      width: 1.5,
                      transform: 'translateX(-50%)',
                      background: 'rgba(255, 255, 255, 0.92)',
                      boxShadow: '0 0 0 1px rgba(31, 168, 220, 0.35)',
                      pointerEvents: 'none',
                      zIndex: 3,
                      animation: 'certGuideIn 0.12s ease',
                    }}
                  />
                )}
                {dragging && centerGuides.horizontal && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: '50%',
                      height: 1.5,
                      transform: 'translateY(-50%)',
                      background: 'rgba(255, 255, 255, 0.92)',
                      boxShadow: '0 0 0 1px rgba(31, 168, 220, 0.35)',
                      pointerEvents: 'none',
                      zIndex: 3,
                      animation: 'certGuideIn 0.12s ease',
                    }}
                  />
                )}

                {previewNatural.w > 0 && formData.student_nameX !== '' && formData.student_nameY !== '' && (
                  previewPath ? (
                    <svg
                      width="100%"
                      height="100%"
                      viewBox={`0 0 ${previewNatural.w} ${previewNatural.h}`}
                      preserveAspectRatio="xMidYMid meet"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 4,
                        cursor: dragging ? 'grabbing' : 'grab',
                        touchAction: 'none',
                        overflow: 'visible',
                      }}
                      onPointerDown={startDrag}
                    >
                      <path
                        d={previewPath.d}
                        transform={previewPath.transform}
                        fill={formData.textColor || '#1a1a1a'}
                        style={{
                          pointerEvents: 'auto',
                          filter: dragging
                            ? 'drop-shadow(0 0 2px rgba(31,168,220,0.8))'
                            : 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))',
                        }}
                      />
                      {/* Larger invisible hit area for easier dragging */}
                      <circle
                        cx={Number(formData.student_nameX)}
                        cy={Number(formData.student_nameY)}
                        r={Math.max(28, (Number(formData.fontSize) || 75) * 0.55)}
                        fill="transparent"
                      />
                    </svg>
                  ) : (
                    <div
                      onPointerDown={startDrag}
                      style={{
                        position: 'absolute',
                        left: `${(Number(formData.student_nameX) / previewNatural.w) * 100}%`,
                        top: `${(Number(formData.student_nameY) / previewNatural.h) * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        color: formData.textColor,
                        fontFamily: fontCssFamily(formData.fontFamily),
                        fontSize: `${previewFontPx}px`,
                        fontWeight: fontWeightFor(formData.fontFamily),
                        textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                        whiteSpace: 'nowrap',
                        cursor: dragging ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: dragging ? 'rgba(31,168,220,0.18)' : 'transparent',
                        border: dragging ? '1px dashed rgba(31,168,220,0.7)' : '1px dashed transparent',
                        zIndex: 4,
                      }}
                    >
                      Student Name
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div
            style={{
              marginBottom: 24,
              padding: 22,
              borderRadius: 16,
              background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 55%, #fff7ed 140%)',
              border: '2px solid rgba(31, 168, 220, 0.2)',
              boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
              overflow: 'visible',
              animation: 'certSlideIn 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4, fontSize: '1.08rem' }}>Text Settings</div>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: '0.88rem' }}>
              Exact values used on the generated student certificate PNG.
            </p>
            <div style={{ display: 'grid', gap: 18, overflow: 'visible' }}>
              <FontFamilySelect
                value={formData.fontFamily}
                onChange={(v) => {
                  setFormData((p) => ({ ...p, fontFamily: v }));
                  if (v) clearFieldError('fontFamily');
                }}
                required
                isOpen={fontOpen}
                onToggle={() => setFontOpen((o) => !o)}
                onClose={() => setFontOpen(false)}
                error={errors.fontFamily || null}
              />
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                  Font Size (px) <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={150}
                  value={formData.fontSize}
                  onChange={(e) => {
                    const v = e.target.value === '' ? '' : Number(e.target.value);
                    setFormData((p) => ({ ...p, fontSize: v }));
                    clearFieldError('fontSize');
                  }}
                  onFocus={() => setFontOpen(false)}
                  style={fieldStyle(!!errors.fontSize)}
                />
                {errors.fontSize && <FieldError message={errors.fontSize} />}
              </div>
              <div data-cert-error={errors.textColor ? 'true' : undefined}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                  Text Color <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <ColorInput
                  format="hex"
                  withPicker
                  withEyeDropper
                  swatches={CERT_COLOR_SWATCHES}
                  swatchesPerRow={6}
                  value={formData.textColor || '#1a1a1a'}
                  onChange={(color) => {
                    setFormData((p) => ({ ...p, textColor: color }));
                    if (color) clearFieldError('textColor');
                  }}
                  onFocus={() => setFontOpen(false)}
                  placeholder="#1a1a1a"
                  radius="md"
                  size="md"
                  styles={{
                    input: {
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      border: errors.textColor ? '2px solid #f87171' : '2px solid #e9ecef',
                      background: errors.textColor ? '#fff5f5' : '#ffffff',
                      minHeight: 48,
                    },
                    eyeDropperButton: {
                      color: '#1FA8DC',
                    },
                  }}
                />
                <FieldError message={errors.textColor} />
              </div>
            </div>
          </div>
        </>
      )}

      {errorMessage && (
        <div
          data-cert-error="true"
          style={{
            background: 'linear-gradient(135deg, #fff5f5 0%, #fee2e2 55%, #fff7ed 140%)',
            color: '#991b1b',
            borderRadius: 14,
            padding: '16px 18px',
            marginBottom: 24,
            textAlign: 'left',
            fontWeight: 700,
            border: '1.5px solid rgba(248, 113, 113, 0.55)',
            boxShadow: '0 10px 28px rgba(220, 53, 69, 0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'certErrorIn 0.3s ease',
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(145deg, #ef4444, #dc2626)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            !
          </span>
          <span>{String(errorMessage).replace(/^❌\s*/, '')}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={submitting || uploading}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: submitting || uploading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: submitting || uploading ? 0.7 : 1,
            minWidth: 120,
          }}
        >
          {submitting ? 'Saving...' : mode === 'edit' ? 'Update' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            padding: '12px 24px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
            minWidth: 120,
          }}
        >
          Cancel
        </button>
      </div>

      <style jsx>{`
        @keyframes certFadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes certSlideIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes certGuideIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes certErrorIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        :global(.cert-form-shake) {
          animation: certShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97);
        }
        @keyframes certShake {
          10%,
          90% {
            transform: translateX(-1px);
          }
          20%,
          80% {
            transform: translateX(2px);
          }
          30%,
          50%,
          70% {
            transform: translateX(-4px);
          }
          40%,
          60% {
            transform: translateX(4px);
          }
        }
        @media (max-width: 560px) {
          :global(.xy-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </form>
  );
}
