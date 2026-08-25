import { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import ZoomRecordingSelect from './ZoomRecordingSelect';
import GoogleMeetRecordingSelect from './GoogleMeetRecordingSelect';
import { useSystemConfig } from '../lib/api/system';
import styles from '../styles/VideoInput.module.css';

function extractYouTubeId(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const match = raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/
  );
  if (match?.[1]) return match[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  return '';
}

function isFeatureEnabled(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function TabButton({ active, onClick, iconSrc, label, tintIcon = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.tab} ${active ? styles.tabActive : ''} ${tintIcon && !active ? styles.tabTintIdle : ''}`}
    >
      {tintIcon ? (
        <span
          className={styles.tabIconTint}
          style={{ WebkitMaskImage: `url(${iconSrc})`, maskImage: `url(${iconSrc})` }}
          aria-hidden
        />
      ) : (
        <img src={iconSrc} alt="" className={styles.tabIcon} />
      )}
      <span className={styles.tabLabel}>{label}</span>
    </button>
  );
}

export default function VideoInput({
  index,
  video,
  onVideoNameChange,
  onYouTubeUrlChange,
  onZoomMeetingIdChange,
  onClearYouTubeUrl,
  onClearZoomMeetingId,
  onGoogleMeetIdChange,
  onClearGoogleMeetId,
  onR2Upload,
  onClearR2Upload,
  onVideoSourceChange,
  onRemove,
  canRemove,
  errors,
  showUploadTab,
  hideTitle = false,
  hideVideoName = false,
  hideYoutubePreview = false,
}) {
  const { data: systemConfig } = useSystemConfig();
  const showZoomTab = isFeatureEnabled(systemConfig?.zoom_integrations);
  const showGoogleMeetTab = isFeatureEnabled(systemConfig?.google_meet_integrations);
  const showUploadFromConfig = isFeatureEnabled(systemConfig?.cloudflare_r2);
  const canShowUploadTab = Boolean(showUploadTab) && showUploadFromConfig;

  const initialTab = (() => {
    if (video.video_source === 'r2' && canShowUploadTab) return 'upload';
    if (video.video_source === 'zoom' && showZoomTab) return 'zoom';
    if (video.video_source === 'google_meet' && showGoogleMeetTab) return 'google_meet';
    return 'youtube';
  })();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [uploadProgress, setUploadProgress] = useState(video.upload_progress || 0);
  const [uploadPhase, setUploadPhase] = useState('idle');
  const [uploadStatus, setUploadStatus] = useState(video.upload_status || 'idle');
  const [uploadFileName, setUploadFileName] = useState(video.upload_file_name || '');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const xhrRef = useRef(null);

  const youtubePreviewId = useMemo(
    () => extractYouTubeId(video.youtube_url),
    [video.youtube_url]
  );

  useEffect(() => {
    if (systemConfig === undefined) return;
    if (!showZoomTab && video.video_source === 'zoom') {
      onVideoSourceChange(index, 'youtube');
      onClearZoomMeetingId(index);
      setActiveTab('youtube');
    }
    if (!showGoogleMeetTab && video.video_source === 'google_meet') {
      onVideoSourceChange(index, 'youtube');
      onClearGoogleMeetId?.(index);
      setActiveTab('youtube');
    }
    if (!canShowUploadTab && video.video_source === 'r2') {
      onVideoSourceChange(index, 'youtube');
      onClearR2Upload(index);
      setActiveTab('youtube');
    }
  }, [
    systemConfig,
    showZoomTab,
    showGoogleMeetTab,
    canShowUploadTab,
    video.video_source,
    index,
    onVideoSourceChange,
    onClearZoomMeetingId,
    onClearGoogleMeetId,
    onClearR2Upload,
  ]);

  useEffect(() => {
    if (video.video_source === 'r2' && canShowUploadTab) {
      setActiveTab('upload');
      setUploadStatus(video.upload_status || (video.r2_key ? 'done' : 'idle'));
      setUploadProgress(video.upload_progress || (video.r2_key ? 100 : 0));
      setUploadFileName(video.upload_file_name || '');
    } else if (video.video_source === 'zoom' && showZoomTab) {
      setActiveTab('zoom');
    } else if (video.video_source === 'google_meet' && showGoogleMeetTab) {
      setActiveTab('google_meet');
    } else if (
      (video.video_source === 'r2' && !canShowUploadTab) ||
      (video.video_source === 'zoom' && !showZoomTab) ||
      (video.video_source === 'google_meet' && !showGoogleMeetTab) ||
      video.video_source === 'youtube'
    ) {
      setActiveTab('youtube');
    }
  }, [
    video.video_source,
    video.r2_key,
    canShowUploadTab,
    showZoomTab,
    showGoogleMeetTab,
  ]);

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    const source =
      tab === 'upload'
        ? 'r2'
        : tab === 'zoom'
          ? 'zoom'
          : tab === 'google_meet'
            ? 'google_meet'
            : 'youtube';
    onVideoSourceChange(index, source);
    if (tab === 'youtube') {
      onClearR2Upload(index);
      onClearZoomMeetingId(index);
      onClearGoogleMeetId?.(index);
    } else if (tab === 'upload') {
      onClearYouTubeUrl(index);
      onClearZoomMeetingId(index);
      onClearGoogleMeetId?.(index);
    } else if (tab === 'zoom') {
      onClearYouTubeUrl(index);
      onClearR2Upload(index);
      onClearGoogleMeetId?.(index);
    } else if (tab === 'google_meet') {
      onClearYouTubeUrl(index);
      onClearR2Upload(index);
      onClearZoomMeetingId(index);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('❌ Invalid file type. Please upload a video file (MP4, WebM, OGG, MOV, AVI, MKV).');
      return;
    }

    if (file.size > 5 * 1024 * 1024 * 1024) {
      setUploadError('❌ File size exceeds 5GB limit.');
      return;
    }

    setUploadError('');
    setUploadFileName(file.name);
    setUploadStatus('uploading');
    setUploadProgress(0);
    setUploadPhase('sending');

    try {
      let corsSetupError = null;
      try {
        await axios.post('/api/upload/r2-setup-cors');
      } catch (setupErr) {
        corsSetupError =
          setupErr?.response?.data?.details ||
          setupErr?.response?.data?.error ||
          setupErr?.message ||
          'Unknown CORS setup error';
      }

      const { data } = await axios.post('/api/upload/r2-signed-url', {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      });

      const { signedUrl, key, contentType: signedContentType, corsSetup } = data;
      const putContentType = signedContentType || file.type || 'application/octet-stream';

      const runXhr = (opts) =>
        new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.timeout = 0;

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && event.total > 0) {
              const raw = (event.loaded / event.total) * 100;
              const capped = Math.min(99, Math.round(raw));
              setUploadProgress(capped);
              setUploadPhase(event.loaded >= event.total ? 'finishing' : 'sending');
            }
          });

          xhr.addEventListener('loadstart', () => {
            setUploadPhase('sending');
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploadProgress(100);
              setUploadPhase('done');
              resolve();
            } else {
              reject(new Error(opts.label + xhr.status));
            }
          });

          xhr.addEventListener('error', () => reject(new Error(opts.label + 'network')));
          xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
          xhr.addEventListener('timeout', () => reject(new Error(opts.label + 'timeout')));

          opts.openSend(xhr);
        });

      try {
        await runXhr({
          label: 'direct:',
          openSend: (xhr) => {
            xhr.open('PUT', signedUrl);
            xhr.setRequestHeader('Content-Type', putContentType);
            xhr.send(file);
          },
        });
      } catch (directErr) {
        if (directErr.message === 'Upload cancelled') throw directErr;
        const corsDetails = corsSetupError || corsSetup?.error;
        throw new Error(
          corsDetails
            ? `Direct upload blocked by R2 CORS: ${corsDetails}`
            : 'Direct upload to storage failed. Please check R2 CORS and try again.'
        );
      }

      setUploadStatus('done');
      onR2Upload(index, key, file.name);
    } catch (error) {
      setUploadPhase('idle');
      if (error.message === 'Upload cancelled') {
        setUploadStatus('idle');
        setUploadProgress(0);
        setUploadFileName('');
      } else {
        setUploadStatus('error');
        setUploadError(error.message || 'Upload failed. Please try again.');
      }
    }
  };

  const handleCancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  };

  const handleRemoveUpload = () => {
    setUploadStatus('idle');
    setUploadProgress(0);
    setUploadPhase('idle');
    setUploadFileName('');
    setUploadError('');
    onR2Upload(index, '', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={styles.shell}>
      {(!hideTitle || canRemove) && (
        <div className={styles.header}>
          {!hideTitle ? <h4 className={styles.title}>Video {index + 1}</h4> : <span />}
          {canRemove && (
            <button type="button" onClick={() => onRemove(index)} className={styles.removeBtn}>
              <img src="/trash.svg" alt="" className={styles.removeIcon} />
              Remove
            </button>
          )}
        </div>
      )}

      <div className={styles.tabs}>
        <TabButton
          active={activeTab === 'youtube'}
          onClick={() => handleTabSwitch('youtube')}
          iconSrc="/youtube.svg"
          label="YouTube"
        />
        {canShowUploadTab && (
          <TabButton
            active={activeTab === 'upload'}
            onClick={() => handleTabSwitch('upload')}
            iconSrc="/upload.svg"
            label="Upload"
            tintIcon
          />
        )}
        {showZoomTab && (
          <TabButton
            active={activeTab === 'zoom'}
            onClick={() => handleTabSwitch('zoom')}
            iconSrc="/zoom.svg"
            label="Zoom"
          />
        )}
        {showGoogleMeetTab && (
          <TabButton
            active={activeTab === 'google_meet'}
            onClick={() => handleTabSwitch('google_meet')}
            iconSrc="/google-meet.svg"
            label="Google Meet"
          />
        )}
      </div>

      {!hideVideoName && (
        <div style={{ marginBottom: '16px' }}>
          <label className={styles.label}>Video Name</label>
          <input
            type="text"
            value={video.video_name || ''}
            onChange={(e) => onVideoNameChange(index, e.target.value)}
            placeholder={`Video ${index + 1}`}
            className={styles.input}
          />
        </div>
      )}

      {activeTab === 'youtube' && (
        <div>
          <label className={styles.label}>
            YouTube URL <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            value={video.youtube_url || ''}
            onChange={(e) => onYouTubeUrlChange(index, e.target.value)}
            placeholder="Enter YouTube Video URL"
            className={`${styles.input} ${errors[`video_${index}_youtube_url`] ? styles.inputError : ''}`}
          />
          {errors[`video_${index}_youtube_url`] && (
            <div className={styles.errorText}>{errors[`video_${index}_youtube_url`]}</div>
          )}
          {youtubePreviewId && !hideYoutubePreview && (
            <div className={styles.youtubePreview}>
              <iframe
                title={`YouTube preview ${index + 1}`}
                src={`https://www.youtube.com/embed/${youtubePreviewId}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className={styles.youtubePreviewFrame}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'upload' && canShowUploadTab && (
        <div>
          <label className={styles.label}>
            Upload Video <span className={styles.required}>*</span>
          </label>

          {uploadStatus === 'idle' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`${styles.uploadDrop} ${errors[`video_${index}_upload`] ? styles.uploadDropError : ''}`}
            >
              <div className={styles.uploadIconWrap}>
                <span
                  className={styles.uploadDropIconTint}
                  style={{ WebkitMaskImage: 'url(/upload.svg)', maskImage: 'url(/upload.svg)' }}
                  aria-hidden
                />
              </div>
              <div className={styles.uploadTitle}>Click to select a video file</div>
              <div className={styles.uploadHint}>MP4, WebM, OGG, MOV, AVI, MKV (max 5GB)</div>
            </div>
          )}

          {uploadStatus === 'uploading' && (
            <div className={`${styles.panel} ${styles.panelUploading}`}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
                <span style={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 650 }}>
                  {uploadPhase === 'finishing' ? 'Finishing' : 'Uploading'}: {uploadFileName}
                </span>
                <button type="button" onClick={handleCancelUpload} className={styles.ghostDangerBtn}>
                  Cancel
                </button>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${uploadProgress}%`,
                    transition: uploadPhase === 'finishing' ? 'none' : 'width 0.2s ease-out',
                  }}
                />
              </div>
              <div style={{ textAlign: 'right', marginTop: 6, color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
                {uploadProgress}%
              </div>
            </div>
          )}

          {uploadStatus === 'done' && (
            <div className={`${styles.panel} ${styles.panelDone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ color: '#15803d', fontWeight: 700, fontSize: '0.9rem' }}>
                  Uploaded successfully
                </div>
                <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 2 }}>
                  {uploadFileName}
                </div>
              </div>
              <button type="button" onClick={handleRemoveUpload} className={styles.ghostDangerBtn}>
                Remove
              </button>
            </div>
          )}

          {uploadStatus === 'error' && (
            <div className={`${styles.panel} ${styles.panelError}`}>
              <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem', marginBottom: 10 }}>
                Upload failed: {uploadError}
              </div>
              <button
                type="button"
                onClick={() => {
                  setUploadStatus('idle');
                  setUploadProgress(0);
                  setUploadPhase('idle');
                  setUploadFileName('');
                  setUploadError('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className={styles.primaryBtn}
              >
                Try Again
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {errors[`video_${index}_upload`] && (
            <div className={styles.errorText}>{errors[`video_${index}_upload`]}</div>
          )}
        </div>
      )}

      {showZoomTab && activeTab === 'zoom' && (
        <div>
          <label className={styles.label}>
            Zoom Meeting ID (or UUID) <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            value={video.zoom_meeting_id || ''}
            onChange={(e) => onZoomMeetingIdChange(index, e.target.value)}
            placeholder="Enter Zoom Meeting ID"
            className={`${styles.input} ${errors[`video_${index}_zoom_meeting_id`] ? styles.inputError : ''}`}
          />
          {errors[`video_${index}_zoom_meeting_id`] && (
            <div className={styles.errorText}>{errors[`video_${index}_zoom_meeting_id`]}</div>
          )}
          <ZoomRecordingSelect
            selectedValue={video.zoom_meeting_id || ''}
            onSelect={(value) => onZoomMeetingIdChange(index, value)}
          />
        </div>
      )}

      {showGoogleMeetTab && activeTab === 'google_meet' && (
        <div>
          <label className={styles.label}>
            Google Meet Recording <span className={styles.required}>*</span>
          </label>
          {errors[`video_${index}_google_meet_id`] && (
            <div className={styles.errorText} style={{ marginBottom: 8 }}>
              {errors[`video_${index}_google_meet_id`]}
            </div>
          )}
          <GoogleMeetRecordingSelect
            selectedValue={video.google_meet_id || ''}
            onSelect={(value) => onGoogleMeetIdChange?.(index, value)}
          />
        </div>
      )}
    </div>
  );
}
