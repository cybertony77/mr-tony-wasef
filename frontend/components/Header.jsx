import Image from 'next/image';
import UserMenu from './UserMenu';
import { useRouter } from 'next/router';
import { Skeleton } from '@mantine/core';
import { useProfile } from '../lib/api/auth';
import { useSystemConfig } from '../lib/api/system';

export default function Header() {
  const router = useRouter();
  const isDashboard = router.pathname === '/dashboard';
  const { data: user } = useProfile();
  const { data: systemConfig } = useSystemConfig();
  const userRole = user?.role || '';
  const systemName = systemConfig?.name || '';
  const isSystemNameLoading = !systemName;
  
  const handleLogoClick = () => {
    if (userRole === 'student') {
      router.push('/student_dashboard');
    } else {
      router.push('/dashboard');
    }
  };
  
  return (
    <header className="header" style={{
      width: '100%',
      background: 'transparent',
      padding: '18px 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: 'none',
      borderBottom: '2px solid #e9ecef',
      gap: 18,
      position: 'relative',
      zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginLeft: 32 }}>
        <span onClick={handleLogoClick} style={{ cursor: 'pointer', display: 'inline-block' }}>
          <img
            src="/logo.png"
            alt={systemName ? `${systemName} Logo` : 'Logo'}
            width={60}
            height={60}
            style={{ 
              borderRadius: '50%', 
              background: 'white', 
              boxShadow: '0 2px 8px rgba(31,168,220,0.10)',
              objectFit: 'cover',
              objectPosition: 'center',
              display: 'block'
            }}
            onError={(e) => {
              console.error('Logo failed to load:', e);
              // Fallback to a text-based logo if image fails
              e.target.style.display = 'none';
              const fallback = document.createElement('div');
              fallback.innerHTML = 'TP';
              fallback.style.cssText = `
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: linear-gradient(330deg, rgb(161, 30, 30) 0%, rgb(223, 106, 71) 50%, rgba(212, 147, 63, 1) 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 18px;
                box-shadow: 0 2px 8px rgba(31,168,220,0.10);
              `;
              e.target.parentNode.appendChild(fallback);
            }}
          />
        </span>
        {isSystemNameLoading ? (
          <div className="header-system-name-skeleton">
            <Skeleton className="header-skel" height={10} width={220} radius="xl" animate />
            <Skeleton className="header-skel" height={8} mt={6} width="70%" radius="xl" animate />
          </div>
        ) : (
          <span style={{
            fontWeight: 900,
            fontSize: 26,
            color: '#FFFFFF',
            letterSpacing: 1.2,
            textShadow: '0 2px 8px rgba(31,168,220,0.10)'
          }}>
            {systemName}
          </span>
        )}
      </div>
      <UserMenu />
      <style jsx>{`
        .header-system-name-skeleton {
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: min(220px, 42vw);
        }
        .header-system-name-skeleton :global(.header-skel) {
          --skeleton-color: rgba(255, 255, 255, 0.28);
          --skeleton-highlight-color: rgba(255, 255, 255, 0.55);
          background-color: rgba(255, 255, 255, 0.28) !important;
        }
        @media (max-width: 768px) {
          span {
            font-size: 20px !important;
            letter-spacing: 0.8px !important;
          }
          img {
            width: 50px !important;
            height: 50px !important;
          }
        }
        @media (max-width: 480px) {
          span {
            font-size: 17px !important;
            letter-spacing: 0.5px !important;
          }
          img {
            width: 45px !important;
            height: 45px !important;
          }
        }
      `}</style>
    </header>
  );
} 