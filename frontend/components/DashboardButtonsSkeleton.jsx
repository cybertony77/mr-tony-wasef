export default function DashboardButtonsSkeleton({
  cards = 2,
  showCircle = false,
}) {
  const count = Math.min(Math.max(Number(cards) || 2, 1), 3);

  return (
    <div className="premium-skeleton-wrap" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <div className="premium-skeleton-card" key={index}>
          {showCircle && <div className="premium-skel-circle" />}
          <div className="premium-skel-line first" />
          <div className="premium-skel-line" />
          <div className="premium-skel-line short" />
        </div>
      ))}
      <style jsx>{`
        .premium-skeleton-wrap {
          width: 100%;
        }
        .premium-skeleton-card {
          width: 100%;
          background: linear-gradient(145deg, #ffffff 0%, #fafbfc 100%);
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 16px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.08),
            0 8px 16px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
          position: relative;
          overflow: hidden;
        }
        .premium-skeleton-card:last-child {
          margin-bottom: 0;
        }
        .premium-skeleton-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.45),
            transparent
          );
          animation: tableShine 2s infinite;
          pointer-events: none;
          z-index: 1;
        }
        .premium-skel-circle {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          margin-bottom: 24px;
          background: linear-gradient(
            135deg,
            rgb(229, 238, 241) 0%,
            rgb(210, 225, 231) 50%,
            rgb(165, 175, 179) 100%
          );
          background-size: 200% 200%;
          animation: avatarPulse 2s ease-in-out infinite;
          box-shadow: 0 4px 12px rgba(31, 168, 220, 0.2);
        }
        .premium-skel-line {
          height: 8px;
          width: 100%;
          margin-top: 6px;
          border-radius: 999px;
          background: linear-gradient(
            135deg,
            #e8f4f8 0%,
            #f0f8ff 25%,
            #e3f2fd 50%,
            #f0f8ff 75%,
            #e8f4f8 100%
          );
          background-size: 300% 100%;
          animation: gradientShimmer 2.5s ease-in-out infinite;
          box-shadow: 0 2px 8px rgba(31, 168, 220, 0.08);
        }
        .premium-skel-line.first {
          margin-top: 0;
        }
        .premium-skel-line.short {
          width: 70%;
        }
        @keyframes gradientShimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes tableShine {
          0% { left: -100%; }
          100% { left: 100%; }
        }
        @keyframes avatarPulse {
          0%, 100% {
            background-position: 0% 0%;
            transform: scale(1);
          }
          50% {
            background-position: 100% 100%;
            transform: scale(1.05);
          }
        }
        @media (max-width: 768px) {
          .premium-skeleton-card {
            padding: 20px;
            border-radius: 16px;
          }
        }
      `}</style>
    </div>
  );
}
