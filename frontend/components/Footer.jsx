import { Skeleton } from '@mantine/core';
import { useSystemConfig } from '../lib/api/system';

export default function Footer() {
  const year = new Date().getFullYear();
  const { data: systemConfig } = useSystemConfig();
  const systemName = systemConfig?.name || '';
  const isSystemNameLoading = !systemName;

  return (
    <footer className="footer" style={{
      width: '100%',
      background: 'transparent',
      padding: '20px 0',
      textAlign: 'center',
      color: '#ffffff',
      fontWeight: 600,
      fontSize: 16,
      letterSpacing: 0.5,
      borderTop: '2px solid #e9ecef',
      marginTop: 'auto',
      flexShrink: 0
    }}>
      {isSystemNameLoading ? (
        <div className="footer-system-name-skeleton">
          <Skeleton className="footer-skel" height={10} width={220} radius="xl" animate />
          <Skeleton className="footer-skel" height={8} mt={6} width="70%" radius="xl" animate />
        </div>
      ) : (
        <>Copyright &copy; {year} - {systemName}</>
      )}

      <style jsx>{`
        .footer-system-name-skeleton {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
          width: min(220px, 70%);
        }
        .footer-system-name-skeleton :global(.footer-skel) {
          --skeleton-color: rgba(255, 255, 255, 0.28);
          --skeleton-highlight-color: rgba(255, 255, 255, 0.55);
          background-color: rgba(255, 255, 255, 0.28) !important;
        }
        @media (max-width: 768px) {
          .footer {
            font-size: 14px !important;
            padding: 15px 0 !important;
            margin-top: 20px !important;
          }
        }
        @media (max-width: 480px) {
          .footer {
            font-size: 12px !important;
            padding: 10px 0 !important;
          }
        }
      `}</style>
    </footer>
  );
}
