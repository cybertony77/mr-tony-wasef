import { useState, useEffect, useRef } from "react";
import { QRCode } from "react-qrcode-logo";
import html2canvas from "html2canvas";
import Image from 'next/image';
import { useProfile } from '../lib/api/auth';
import { useStudent } from '../lib/api/students';
import { useSystemConfig } from '../lib/api/system';

export default function QRCodeModal({ isOpen, onClose }) {
  const { data: profile } = useProfile();
  const { data: systemConfig } = useSystemConfig();
  const studentId = profile?.id ? profile.id.toString() : null;
  const { data: studentData, isLoading: studentDataLoading } = useStudent(studentId, {
    enabled: !!studentId && isOpen,
  });

  const [qrSize, setQrSize] = useState(350);
  const [logoSize, setLogoSize] = useState(85);
  const [isGenerating, setIsGenerating] = useState(true);
  const [busy, setBusy] = useState(null); // 'download' | 'share' | null
  const modalRef = useRef(null);

  // Handle responsive QR code sizing
  useEffect(() => {
    if (!isOpen) return;
    
    const computeResponsiveSizes = () => {
      if (typeof window === 'undefined') return;
      const vw = window.innerWidth || 1024;
      const available = Math.max(200, Math.min(400, Math.floor(vw * 0.7)));
      setQrSize(available);
      setLogoSize(Math.round(available * 0.24));
    };

    computeResponsiveSizes();
    window.addEventListener('resize', computeResponsiveSizes);
    return () => window.removeEventListener('resize', computeResponsiveSizes);
  }, [isOpen]);

  // Simulate QR generation delay and then show QR
  useEffect(() => {
    if (isOpen && studentData?.id) {
      setIsGenerating(true);
      // Small delay to show spinner
      const timer = setTimeout(() => {
        setIsGenerating(false);
      }, 500);
      return () => clearTimeout(timer);
    } else if (isOpen && !studentDataLoading && !studentData?.id) {
      setIsGenerating(false);
    }
  }, [isOpen, studentData, studentDataLoading]);

  // Close modal when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const captureQrBlob = async () => {
    const container = document.querySelector('.qr-container-modal');
    if (!container) throw new Error('QR code not found. Please try again.');
    const canvas = await html2canvas(container, {
      backgroundColor: null,
      useCORS: true,
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            reject(new Error('Failed to create image'));
            return;
          }
          try {
            const bytes = await blob.arrayBuffer();
            resolve(new Blob([bytes], { type: 'image/png' }));
          } catch (err) {
            reject(err);
          }
        },
        'image/png',
        1
      );
    });
  };

  const toPngFile = async (blob, name) => {
    const bytes = await blob.arrayBuffer();
    return new File([bytes], name, {
      type: 'image/png',
      lastModified: Date.now(),
    });
  };

  const fileName = `StudentID_${studentData?.id || studentId}.png`;

  const downloadSingleQR = async () => {
    setBusy('download');
    try {
      const file = await toPngFile(await captureQrBlob(), fileName);
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert(error.message || 'Download failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const shareSingleQR = async () => {
    setBusy('share');
    try {
      if (typeof navigator === 'undefined' || !navigator.share) {
        alert('Sharing is not supported on this device');
        return;
      }
      const file = await toPngFile(await captureQrBlob(), fileName);
      console.log(file);
      console.log(file.type);
      console.log(file.name);
      if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
        alert('Sharing images is not supported on this device');
        return;
      }
      await navigator.share({
        files: [file],
        title: 'QR Code',
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Share error:', error);
      alert(error.message || 'Share failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const isMarketingPageEnabled =
    systemConfig?.marketing_page === true || systemConfig?.marketing_page === 'true';
  const originDomain =
    typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : '';
  const configuredDomain = (systemConfig?.domain || '').replace(/\/+$/, '');

  const qrValue = studentData?.id
    ? (() => {
        if (isMarketingPageEnabled) {
          const baseDomain = originDomain || configuredDomain;
          if (!baseDomain) return `/welcome?id=${studentData.id}`;
          return `${baseDomain}/welcome?id=${studentData.id}`;
        }
        return window.location.origin + `/?id=${studentData.id}`;
      })()
    : '';

  if (!isOpen) return null;

  return (
    <>
      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.3s ease;
        }
        .modal-content {
          position: relative;
          border-radius: 20px;
          padding: 30px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          animation: slideUp 0.3s ease;
          z-index: 10000;
        }
        .spinner-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #1FA8DC;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .spinner-text {
          margin-top: 20px;
          color: #ffffff;
          font-size: 16px;
          font-weight: 600;
        }
        .qr-container-modal {
          border-radius: 25px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
           background: var(--system-page-bg, linear-gradient(380deg, #1FA8DC 0%, #FEB954 100%));
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          margin: 0 auto;
          text-align: center;
          width: 100%;
          max-width: 440px;
          min-height: 400px;
        }
        .qr-container-modal canvas,
        .qr-container-modal svg {
          max-width: 100%;
          height: auto !important;
          display: block;
          margin-left: auto;
          margin-right: auto;
        }
        .qr-id-text {
          margin-top: 15px;
          font-weight: 700;
          font-size: 1.4rem;
          color: #222;
          letter-spacing: 1px;
          text-align: center;
        }
        .qr-action-row {
          width: 100%;
          max-width: 440px;
          margin: 24px auto 0;
          display: flex;
          gap: 10px;
          align-items: stretch;
        }
        .download-btn,
        .share-btn {
          flex: 1 1 50%;
          width: 50%;
          min-width: 0;
          margin: 0;
          padding: 15px 12px;
          color: white;
          border: none;
          border-radius: 14px;
          font-size: 0.95rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.25s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: 0.01em;
          position: relative;
          overflow: hidden;
        }
        .download-btn {
          background: linear-gradient(135deg, #1FA8DC 0%, #0ea5e9 42%, #feb954 160%);
          box-shadow:
            0 12px 28px rgba(31, 168, 220, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.28);
        }
        .share-btn {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 45%, #20c997 130%);
          box-shadow:
            0 12px 28px rgba(34, 197, 94, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
        }
        .download-btn::before,
        .share-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.22) 50%, transparent 70%);
          transform: translateX(-120%);
          transition: transform 0.55s ease;
        }
        .download-btn:hover:not(:disabled)::before,
        .share-btn:hover:not(:disabled)::before {
          transform: translateX(120%);
        }
        .download-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 48%, #f59e0b 150%);
          transform: translateY(-2px);
          box-shadow: 0 16px 32px rgba(31, 168, 220, 0.42);
        }
        .share-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #16a34a 0%, #15803d 48%, #0d9488 140%);
          transform: translateY(-2px);
          box-shadow: 0 16px 32px rgba(34, 197, 94, 0.45);
        }
        .download-btn:disabled,
        .share-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .btn-icon {
          filter: brightness(0) invert(1);
          position: relative;
          z-index: 1;
          flex-shrink: 0;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(30px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .modal-content {
            padding: 20px;
            width: 95%;
          }
          .qr-container-modal {
            padding: 16px;
            max-width: 92%;
          }
          .qr-id-text {
            font-size: 1.2rem;
          }
        }
        @media (max-width: 480px) {
          .modal-content {
            padding: 15px;
          }
          .qr-container-modal {
            padding: 12px;
            max-width: 95%;
          }
          .qr-id-text {
            font-size: 1.1rem;
          }
        }
      `}</style>
      <div className="modal-overlay">
        <div className="modal-content" ref={modalRef}>
          {isGenerating || studentDataLoading ? (
            <div className="spinner-container">
              <div className="spinner"></div>
              <div className="spinner-text">Generating QR Code...</div>
            </div>
          ) : studentData?.id ? (
            <>
              <div className="qr-container-modal">
                <QRCode
                  id="student-qr-svg-modal"
                  value={qrValue}
                  size={qrSize}
                  ecLevel="H"
                  logoImage="/logo.png"
                  logoWidth={logoSize}
                  logoHeight={logoSize}
                  logoPadding={3}
                  logoPaddingStyle="square"
                  logoBackgroundColor="white"
                  logoBackgroundTransparent={false}
                  removeQrCodeBehindLogo={true}
                  logoPosition="center"
                />
                <div className="qr-id-text">{`ID No. ${studentData.id}`}</div>
              </div>
              <div className="qr-action-row">
                <button
                  type="button"
                  className="download-btn"
                  onClick={downloadSingleQR}
                  disabled={!!busy}
                >
                  <Image src="/download.svg" alt="" width={20} height={20} className="btn-icon" />
                  {busy === 'download' ? 'Downloading…' : 'Download'}
                </button>
                <button
                  type="button"
                  className="share-btn"
                  onClick={shareSingleQR}
                  disabled={!!busy}
                >
                  <Image src="/share.svg" alt="" width={20} height={20} className="btn-icon" />
                  {busy === 'share' ? 'Sharing…' : 'Share'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#666" }}>
              Unable to load student information.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

