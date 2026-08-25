import { useEffect, useMemo, useRef, useState } from 'react';
import VideoWatermarkOverlay from './VideoWatermarkOverlay';
import { buildZoomVideoProxyPath } from '../lib/zoomUtils';
import { useVideoSeekGestures } from './videoSeekGestures';

export default function ZoomVideoPlayer({
  meetingId,
  onMilestonePercent,
  onComplete,
  videoId,
  watermarkText,
  hideWatermark = false,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hasMilestoneRef = useRef(false);
  const hasCompleteRef = useRef(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryCountRef = useRef(0);
  const savedTimeRef = useRef(0);

  useEffect(() => {
    retryCountRef.current = 0;
    setRetryNonce(0);
    hasMilestoneRef.current = false;
    hasCompleteRef.current = false;
    savedTimeRef.current = 0;
  }, [meetingId]);

  const src = useMemo(() => {
    const base = buildZoomVideoProxyPath(meetingId);
    if (!base) return '';
    return retryNonce ? `${base}?_=${retryNonce}` : base;
  }, [meetingId, retryNonce]);

  const { containerProps, playerChrome, videoProps } = useVideoSeekGestures(videoRef, {
    enabled: Boolean(src),
    attachKey: src,
    containerRef,
  });

  const handleTimeUpdate = (event) => {
    const video = event.currentTarget;
    if (!video.duration) return;
    savedTimeRef.current = video.currentTime;
    const percent = (video.currentTime / video.duration) * 100;

    if (!hasMilestoneRef.current && percent >= 10 && onMilestonePercent) {
      hasMilestoneRef.current = true;
      onMilestonePercent(videoId, percent);
    }

    if (!hasCompleteRef.current && percent >= 90 && onComplete) {
      hasCompleteRef.current = true;
      onComplete(videoId, percent);
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    const t = savedTimeRef.current;
    if (!video || !t || t <= 0) return;
    try {
      video.currentTime = t;
    } catch {
      /* ignore */
    }
  };

  const handleVideoError = () => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.currentTime)) {
      savedTimeRef.current = video.currentTime;
    }
    if (retryCountRef.current >= 1) return;
    retryCountRef.current += 1;
    setRetryNonce(Date.now());
  };

  if (!meetingId) {
    return (
      <div style={{ color: '#fff', padding: '32px', textAlign: 'center' }}>
        No Zoom meeting ID provided
      </div>
    );
  }

  if (!src) {
    return (
      <div style={{ color: '#fff', padding: '32px', textAlign: 'center' }}>
        Invalid Zoom recording link — please re-select the recording from the list
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      {...containerProps}
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        maxHeight: 'min(100vh, 100%)',
        position: 'relative',
        backgroundColor: '#000',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <video
        key={src}
        ref={videoRef}
        src={src}
        {...videoProps}
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          aspectRatio: '16 / 9',
          backgroundColor: '#000',
          outline: 'none',
          display: 'block',
          objectFit: 'contain',
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleVideoError}
      />
      {playerChrome}
      {!hideWatermark ? <VideoWatermarkOverlay text={watermarkText} /> : null}
    </div>
  );
}
