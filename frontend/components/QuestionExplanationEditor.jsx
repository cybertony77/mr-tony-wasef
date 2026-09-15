import { useEffect, useMemo, useState } from 'react';
import VideoInput from './VideoInput';
import {
  createEmptyExplanationVideoForm,
  explanationVideoHasContent,
  EXPLANATION_VIDEO_MAX_BYTES,
  EXPLANATION_VIDEO_MAX_MB,
  serializeExplanationVideoForDb,
} from '../lib/explanationVideo';

const tabBtn = (active) => ({
  flex: '1 1 0',
  minWidth: 0,
  minHeight: 44,
  padding: '10px 12px',
  border: active ? '2px solid #1FA8DC' : '2px solid #e9ecef',
  borderRadius: 10,
  background: active ? '#f0f8ff' : '#fff',
  color: active ? '#1FA8DC' : '#64748b',
  fontWeight: 700,
  fontSize: 'clamp(0.88rem, 3.6vw, 0.95rem)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  boxSizing: 'border-box',
});

/** Prefer text when both exist; video only when text is empty. */
export function resolveExplanationActiveTab(textValue, videoValue) {
  const hasText = String(textValue || '').trim() !== '';
  const hasVideo = explanationVideoHasContent(videoValue);
  if (hasText) return 'text';
  if (hasVideo) return 'video';
  return 'text';
}

/**
 * Question explanation editor: Text / Video tabs (both can be filled).
 */
export default function QuestionExplanationEditor({
  textValue = '',
  onTextChange,
  videoValue,
  onVideoChange,
  label = 'Question Explanation',
  /** Change when loaded edit data arrives so tab/radio state re-syncs */
  syncKey = '',
}) {
  const video = videoValue && typeof videoValue === 'object'
    ? videoValue
    : createEmptyExplanationVideoForm();

  const [activeTab, setActiveTab] = useState(() =>
    resolveExplanationActiveTab(textValue, videoValue)
  );

  const videoInputKey = useMemo(() => {
    const saved = serializeExplanationVideoForDb(video);
    return saved
      ? `${saved.video_type}:${saved.video_id}`
      : `empty-${syncKey || 'new'}`;
  }, [video, syncKey]);

  useEffect(() => {
    setActiveTab(resolveExplanationActiveTab(textValue, videoValue));
    // Only re-sync when parent says data identity changed (edit load / question swap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  const patchVideo = (patch) => {
    onVideoChange({ ...video, ...patch });
  };

  return (
    <div style={{ marginBottom: 16, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, textAlign: 'left' }}>
        {label}
      </label>
      <p style={{ margin: '0 0 10px', fontSize: 'clamp(0.8rem, 3.4vw, 0.88rem)', color: '#64748b', lineHeight: 1.4 }}>
        You can use text, video, or both for the explanation.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
          width: '100%',
        }}
      >
        <button type="button" style={tabBtn(activeTab === 'text')} onClick={() => setActiveTab('text')}>
          Text
        </button>
        <button type="button" style={tabBtn(activeTab === 'video')} onClick={() => setActiveTab('video')}>
          Video
        </button>
      </div>

      {activeTab === 'text' ? (
        <textarea
          value={textValue || ''}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Enter explanation for this question (optional)"
          rows={4}
          style={{
            width: '100%',
            maxWidth: '100%',
            padding: '12px 16px',
            border: '2px solid #e9ecef',
            borderRadius: 10,
            fontSize: '1rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 100,
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
          <p style={{ margin: '0 0 10px', fontSize: 'clamp(0.78rem, 3.2vw, 0.85rem)', color: '#64748b' }}>
            Optional explanation video · Upload max {EXPLANATION_VIDEO_MAX_MB} MB
          </p>
          <VideoInput
            key={videoInputKey}
            index={0}
            video={video}
            hideTitle
            hideVideoName
            showUploadTab
            maxFileSizeBytes={EXPLANATION_VIDEO_MAX_BYTES}
            canRemove={false}
            onRemove={() => {}}
            onVideoNameChange={(_i, name) => patchVideo({ video_name: name })}
            onYouTubeUrlChange={(_i, url) =>
              patchVideo({
                youtube_url: url,
                video_source: 'youtube',
                r2_key: '',
                zoom_meeting_id: '',
                google_meet_id: '',
              })
            }
            onClearYouTubeUrl={() => patchVideo({ youtube_url: '' })}
            onZoomMeetingIdChange={(_i, id) =>
              patchVideo({
                zoom_meeting_id: id,
                video_source: 'zoom',
                youtube_url: '',
                r2_key: '',
                google_meet_id: '',
              })
            }
            onClearZoomMeetingId={() => patchVideo({ zoom_meeting_id: '' })}
            onGoogleMeetIdChange={(_i, id) =>
              patchVideo({
                google_meet_id: id,
                video_source: 'google_meet',
                youtube_url: '',
                r2_key: '',
                zoom_meeting_id: '',
              })
            }
            onClearGoogleMeetId={() => patchVideo({ google_meet_id: '' })}
            onR2Upload={(_i, key, fileName) =>
              patchVideo({
                r2_key: key,
                r2_file_name: fileName || '',
                upload_file_name: fileName || '',
                upload_status: 'done',
                video_source: 'r2',
                youtube_url: '',
                zoom_meeting_id: '',
                google_meet_id: '',
              })
            }
            onClearR2Upload={() =>
              patchVideo({
                r2_key: '',
                r2_file_name: '',
                upload_file_name: '',
                upload_status: 'idle',
                upload_progress: 0,
              })
            }
            onVideoSourceChange={(_i, source) => patchVideo({ video_source: source })}
            errors={{}}
          />
        </div>
      )}
    </div>
  );
}
