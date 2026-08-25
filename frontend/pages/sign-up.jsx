import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import apiClient from '../lib/axios';
import NeedHelp from '../components/NeedHelp';

// API function to check VAC
const checkVAC = async (account_id, VAC) => {
  if (!account_id || !VAC || VAC.length !== 7) {
    return { exists: false, valid: false };
  }
  try {
    const response = await apiClient.post('/api/auth/check_vac', { account_id, VAC });
    return response.data;
  } catch (error) {
    return { exists: false, valid: false };
  }
};

export default function SignUp() {
  const router = useRouter();
  const [form, setForm] = useState({
    id: '',
    email: '',
    password: '',
    confirmPassword: '',
    vac: ['', '', '', '', '', '', ''],
    profile_picture: null
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupFailed, setSignupFailed] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const vacInputRefs = useRef([]);

  // VAC check query
  const vacCode = form.vac.join('');
  const { data: vacCheck, isLoading: vacChecking } = useQuery({
    queryKey: ['check-vac', form.id, vacCode],
    queryFn: () => checkVAC(form.id, vacCode),
    enabled: !!form.id && vacCode.length === 7,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Auto-hide messages after 6 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // After success button animation, redirect to login
  useEffect(() => {
    if (!signupSuccess) return;
    const timer = setTimeout(() => {
      router.push('/');
    }, 2500);
    return () => clearTimeout(timer);
  }, [signupSuccess, router]);

  // After error button animation, return to normal Sign Up
  useEffect(() => {
    if (!signupFailed) return;
    const timer = setTimeout(() => {
      setSignupFailed(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [signupFailed]);

  const clearFieldError = (field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'id') {
      // Only allow numbers for ID (account_id)
      const numericValue = value.replace(/[^0-9]/g, '');
      setForm({ ...form, [name]: numericValue });
      // Store in sessionStorage or remove if empty
      if (numericValue) {
        sessionStorage.setItem('student_id', numericValue);
      } else {
        sessionStorage.removeItem('student_id');
      }
    } else if (name === 'password') {
      setForm({ ...form, [name]: value });
      // Store in sessionStorage or remove if empty
      if (value) {
        sessionStorage.setItem('student_password', value);
      } else {
        sessionStorage.removeItem('student_password');
      }
      // Re-validate confirm password mismatch when password changes
      if (fieldErrors.confirmPassword && form.confirmPassword && value === form.confirmPassword) {
        clearFieldError('confirmPassword');
      }
    } else {
      setForm({ ...form, [name]: value });
    }
    clearFieldError(name);
    setError('');
  };

  const handleVACChange = (e, index) => {
    const rawValue = e.target.value;
    const sanitized = rawValue.replace(/[^a-zA-Z0-9]/g, '');
    clearFieldError('vac');
    setError('');

    const newVac = [...form.vac];

    // ✅ Allow clearing (delete)
    if (sanitized.length === 0) {
      newVac[index] = '';
      setForm({ ...form, vac: newVac });
      return;
    }

    // ✅ Full paste (7 characters)
    if (sanitized.length === 7) {
      const chars = sanitized.split('');
      setForm({ ...form, vac: chars });
      vacInputRefs.current[6]?.focus();
      return;
    }

    // ✅ Partial paste
    if (sanitized.length > 1) {
      for (let i = 0; i < sanitized.length && index + i < 7; i++) {
        newVac[index + i] = sanitized[i];
      }
      setForm({ ...form, vac: newVac });

      const nextIndex = Math.min(index + sanitized.length, 6);
      vacInputRefs.current[nextIndex]?.focus();
      return;
    }

    // ✅ Normal single character typing
    newVac[index] = sanitized;
    setForm({ ...form, vac: newVac });

    if (index < 6) {
      vacInputRefs.current[index + 1]?.focus();
    }
  };

  const handleVACPaste = (e, index) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const sanitized = pastedText.replace(/[^a-zA-Z0-9]/g, '').slice(0, 7);
    if (sanitized.length === 0) return;

    const newVac = [...form.vac];
    const startIdx = sanitized.length === 7 ? 0 : index;
    for (let i = 0; i < sanitized.length && (startIdx + i) < 7; i++) {
      newVac[startIdx + i] = sanitized[i];
    }
    setForm({ ...form, vac: newVac });
    clearFieldError('vac');
    setError('');
    const lastIndex = Math.min(startIdx + sanitized.length - 1, 6);
    vacInputRefs.current[lastIndex]?.focus();
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      const newVac = [...form.vac];

      if (newVac[index]) {
        // If current has value → clear it
        newVac[index] = '';
        setForm({ ...form, vac: newVac });
      } else if (index > 0) {
        // If already empty → move back
        vacInputRefs.current[index - 1]?.focus();
      }
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      vacInputRefs.current[index - 1]?.focus();
    }

    if (e.key === 'ArrowRight' && index < 6) {
      vacInputRefs.current[index + 1]?.focus();
    }
  };

  const processImageFile = async (file) => {
    if (!file) {
      setImagePreview(null);
      setForm({ ...form, profile_picture: null });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('❌ Please select an image file');
      return;
    }

    // Validate file size (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('❌ Sorry, Max profile picture size is 10 MB, Please try another picture');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);

    // Upload to Cloudinary
    setUploadingImage(true);
    setError('');
    
    try {
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await apiClient.post('/api/upload/profile-picture', {
        file: base64,
        fileName: file.name,
        fileType: file.type
      });

      console.log('Upload response:', response.data);

      if (response.data.success && response.data.public_id) {
        console.log('Profile picture uploaded, public_id:', response.data.public_id);
        setForm({ ...form, profile_picture: response.data.public_id });
      } else {
        console.error('Upload failed - invalid response:', response.data);
        throw new Error('Upload failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || '❌ Failed to upload image. Please try again.');
      setImagePreview(null);
      setForm({ ...form, profile_picture: null });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    await processImageFile(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploadingImage) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploadingImage) return;

    const file = e.dataTransfer.files?.[0];
    await processImageFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (signupSuccess || signupFailed) return;
    setError('');
    setSignupSuccess(false);
    setSignupFailed(false);

    const nextErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!form.id || String(form.id).trim() === '') {
      nextErrors.id = 'Student ID is required';
    }

    if (!form.email || form.email.trim() === '') {
      nextErrors.email = 'Email is required';
    } else if (!emailRegex.test(form.email.trim())) {
      nextErrors.email = 'Please enter a valid email address';
    }

    if (!form.password) {
      nextErrors.password = 'Password is required';
    } else if (form.password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters';
    }

    if (!form.confirmPassword) {
      nextErrors.confirmPassword = 'Please confirm your password';
    } else if (form.password && form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    if (form.vac.some((char) => !char)) {
      nextErrors.vac = 'Please enter the complete verification code';
    } else if (!vacChecking) {
      if (!vacCheck || !vacCheck.exists) {
        nextErrors.vac = 'ID not found — check your student ID';
      } else if (vacCheck.activated) {
        nextErrors.vac = 'This account is already registered';
      } else if (!vacCheck.valid) {
        nextErrors.vac = 'Verification code is incorrect';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError('❌ Please fill in all required fields correctly');
      const firstKey = Object.keys(nextErrors)[0];
      if (firstKey === 'vac') {
        const firstEmpty = form.vac.findIndex((c) => !c);
        vacInputRefs.current[firstEmpty >= 0 ? firstEmpty : 0]?.focus();
      } else {
        const el = document.querySelector(`[name="${firstKey}"]`);
        el?.focus();
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (vacChecking) {
      setError('❌ Please wait for verification code check to finish');
      return;
    }

    // Wait for image upload to complete if it's in progress
    if (uploadingImage) {
      setError('❌ Please wait for image upload to complete');
      return;
    }

    setFieldErrors({});

    // Submit sign up
    setIsSubmitting(true);
    try {
      const signupData = {
        id: form.id.trim(),
        email: form.email.trim(),
        password: form.password,
        account_id: form.id,
        VAC: form.vac.join('')
      };

      // Only include profile_picture if it exists and is not empty
      if (form.profile_picture && typeof form.profile_picture === 'string' && form.profile_picture.trim() !== '') {
        signupData.profile_picture = form.profile_picture.trim();
        console.log('Including profile_picture in signup:', signupData.profile_picture);
      } else {
        console.log('No profile_picture to include. Current value:', form.profile_picture);
      }

      console.log('Signup data being sent:', { ...signupData, password: '***' });
      await apiClient.post('/api/auth/signup', signupData);

      setIsSubmitting(false);
      setSignupSuccess(true);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to create account';
      setError(`❌ ${errorMessage}`);
      setIsSubmitting(false);
      setSignupFailed(true);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      width: '100%',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '20px 5px 20px 5px',
    }}>
      <style jsx>{`
        .signup-container {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          max-width: 500px;
          width: 100%;
          position: relative;
          overflow: hidden;
        }
        .signup-container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: var(--system-page-bg);
          background-size: 200% 100%;
          animation: gradientShift 3s ease infinite;
        }
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .logo-section {
          text-align: center;
          margin-bottom: 32px;
        }
        .logo-icon {
          width: 80px;
          height: 80px;
          margin-bottom: 16px;
          border-radius: 50%;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          object-fit: cover;
          background: transparent;
        }
        .title {
          font-size: 2.2rem;
          font-weight: 700;
          color: rgb(0, 0, 0);
          margin-bottom: 8px;
        }
        .subtitle {
          color: #6c757d;
          font-size: 1rem;
          margin-bottom: 0;
        }
        .form-group {
          margin-bottom: 24px;
        }
        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #495057;
          font-size: 0.95rem;
        }
        .form-input {
          width: 100%;
          padding: 16px 20px;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          font-size: 1rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
          background: #ffffff;
          color: #000000;
        }
        .form-input:focus {
          outline: none;
          border-color: #87CEEB;
          box-shadow: 0 0 0 4px rgba(135, 206, 235, 0.1);
          transform: translateY(-2px);
        }
        .form-input.error-border {
          border-color: #dc3545 !important;
          box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.12) !important;
          background: #fff8f8 !important;
        }
        .form-input.error-border:focus {
          border-color: #dc3545 !important;
          box-shadow: 0 0 0 4px rgba(220, 53, 69, 0.16) !important;
          transform: none;
        }
        .field-error {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #a11f2e;
          font-size: 0.82rem;
          font-weight: 600;
          animation: vacFeedbackIn 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .field-error-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: linear-gradient(135deg, #dc3545 0%, #e74c3c 100%);
          flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.15);
        }
        .vac-inputs-container {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .vac-input {
          width: 45px;
          height: 55px;
          text-align: center;
          font-size: 1.5rem;
          font-weight: 700;
          border: 2px solid #87CEEB;
          border-radius: 10px;
          background: #f8f9fa;
          color: #333;
          transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease, transform 0.25s ease;
          box-shadow: 0 2px 6px rgba(135, 206, 235, 0.2);
          outline: none;
        }
        .vac-input:focus {
          outline: none;
          border-color: #1FA8DC !important;
          box-shadow: 0 0 0 4px rgba(31, 168, 220, 0.2) !important;
          background: #ffffff !important;
          transform: scale(1.05);
        }
        .vac-input.error-border {
          border-color: #dc3545 !important;
          box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.12) !important;
          background: #fff8f8 !important;
        }
        .vac-input.error-border:focus {
          border-color: #dc3545 !important;
          box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.16) !important;
          background: #fff8f8 !important;
          transform: scale(1.05);
        }
        .vac-input.valid-border {
          border-color: #28a745 !important;
          box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.15) !important;
          background: #f4fff7 !important;
        }
        .vac-input.valid-border:focus {
          border-color: #28a745 !important;
          box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.2) !important;
          background: #f4fff7 !important;
        }
        .vac-feedback {
          margin-top: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          line-height: 1.35;
          border: 1px solid transparent;
          backdrop-filter: blur(8px);
          animation: vacFeedbackIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .vac-feedback-icon {
          flex-shrink: 0;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
        }
        .vac-feedback-text {
          flex: 1;
          min-width: 0;
        }
        .vac-feedback-title {
          display: block;
          font-size: 0.92rem;
          font-weight: 700;
        }
        .vac-feedback-sub {
          display: block;
          margin-top: 2px;
          font-size: 0.78rem;
          font-weight: 500;
          opacity: 0.85;
        }
        .vac-feedback.checking {
          color: #0b6e99;
          background: linear-gradient(135deg, rgba(31, 168, 220, 0.12) 0%, rgba(135, 206, 235, 0.18) 100%);
          border-color: rgba(31, 168, 220, 0.28);
          box-shadow: 0 8px 24px rgba(31, 168, 220, 0.12);
        }
        .vac-feedback.checking .vac-feedback-icon {
          background: linear-gradient(135deg, #1FA8DC 0%, #5F6DFE 100%);
          color: #fff;
          box-shadow: 0 4px 12px rgba(31, 168, 220, 0.35);
        }
        .vac-feedback.valid {
          color: #0f7a3a;
          background: linear-gradient(135deg, rgba(40, 167, 69, 0.12) 0%, rgba(46, 204, 113, 0.16) 100%);
          border-color: rgba(40, 167, 69, 0.28);
          box-shadow: 0 8px 24px rgba(40, 167, 69, 0.12);
        }
        .vac-feedback.valid .vac-feedback-icon {
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: #fff;
          box-shadow: 0 4px 12px rgba(40, 167, 69, 0.35);
        }
        .vac-feedback.invalid {
          color: #a11f2e;
          background: linear-gradient(135deg, rgba(220, 53, 69, 0.1) 0%, rgba(255, 107, 129, 0.14) 100%);
          border-color: rgba(220, 53, 69, 0.28);
          box-shadow: 0 8px 24px rgba(220, 53, 69, 0.1);
        }
        .vac-feedback.invalid .vac-feedback-icon {
          background: linear-gradient(135deg, #dc3545 0%, #e74c3c 100%);
          color: #fff;
          box-shadow: 0 4px 12px rgba(220, 53, 69, 0.35);
        }
        .vac-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: vacSpin 0.75s linear infinite;
        }
        @keyframes vacSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes vacFeedbackIn {
          from {
            opacity: 0;
            transform: translateY(6px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .input-wrapper {
          position: relative;
        }
        .signup-btn {
          width: 100%;
          padding: 16px;
          background: linear-gradient(90deg, #5F6DFE 0%, #6A82FB 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
          transition:
            background 0.45s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.55s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.35s ease;
          box-shadow: 0 8px 24px rgba(95, 109, 254, 0.3);
          overflow: hidden;
          position: relative;
          isolation: isolate;
        }
        /* Error wipe (left → right) */
        .signup-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(105deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 42%),
            linear-gradient(90deg, #dc3545 0%, #e74c3c 55%, #c0392b 100%);
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform 0.85s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 1;
          pointer-events: none;
        }
        /* Success wipe (left → right) */
        .signup-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(105deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 42%),
            linear-gradient(90deg, #22a84a 0%, #2ecc71 52%, #1fbf8f 100%);
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 1;
          pointer-events: none;
        }
        .signup-btn:hover:not(:disabled):not(.success):not(.error):not(.loading) {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(95, 109, 254, 0.4);
        }
        .signup-btn:active:not(:disabled):not(.success):not(.error):not(.loading) {
          transform: translateY(-1px);
        }
        .signup-btn:disabled:not(.success):not(.error):not(.loading) {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .signup-btn.loading {
          opacity: 1;
          cursor: wait;
          background: linear-gradient(90deg, #6c757d 0%, #868e96 100%);
          box-shadow: 0 8px 26px rgba(108, 117, 125, 0.32);
        }
        .signup-btn.success {
          opacity: 1;
          cursor: default;
          box-shadow: 0 12px 32px rgba(40, 167, 69, 0.38);
        }
        .signup-btn.success::before {
          transform: scaleX(1);
        }
        .signup-btn.success:hover {
          box-shadow: 0 12px 32px rgba(40, 167, 69, 0.38);
        }
        .signup-btn.error {
          opacity: 1;
          cursor: default;
          box-shadow: 0 12px 32px rgba(220, 53, 69, 0.35);
        }
        .signup-btn.error::after {
          transform: scaleX(1);
        }
        .signup-btn.error:hover {
          box-shadow: 0 12px 32px rgba(220, 53, 69, 0.35);
        }
        .signup-btn-content {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 28px;
          position: relative;
          z-index: 2;
        }
        .signup-btn.loading .signup-btn-content {
          animation: signupLabelFade 0.35s ease both;
        }
        .signup-btn.success .signup-btn-content,
        .signup-btn.error .signup-btn-content {
          animation: signupContentSlide 0.7s 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .signup-btn-spinner {
          width: 20px;
          height: 20px;
          border: 2.5px solid rgba(255, 255, 255, 0.28);
          border-top-color: #fff;
          border-radius: 50%;
          animation: signupSpinSmooth 0.85s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
          flex-shrink: 0;
        }
        .signup-btn-check,
        .signup-btn-x {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.22);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          animation: signupCheckPop 0.55s 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .signup-btn-check svg,
        .signup-btn-x svg {
          width: 15px;
          height: 15px;
          stroke: #fff;
          stroke-width: 3;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 28;
          stroke-dashoffset: 28;
          animation: signupCheckDraw 0.55s 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .signup-btn-success-text,
        .signup-btn-error-text {
          letter-spacing: 0.02em;
        }
        @keyframes signupLabelFade {
          from {
            opacity: 0.65;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes signupContentSlide {
          from {
            opacity: 0;
            transform: translateX(-36px);
            filter: blur(2px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
            filter: blur(0);
          }
        }
        @keyframes signupCheckPop {
          from {
            opacity: 0;
            transform: translateX(-14px) scale(0.7);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        @keyframes signupCheckDraw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes signupSpinSmooth {
          to { transform: rotate(360deg); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (max-width: 480px) {
          .signup-container {
            padding: 30px 20px;
            margin: 10px;
          }
          .title {
            font-size: 1.8rem;
          }
          .vac-input {
            width: 40px;
            height: 50px;
            font-size: 1.3rem;
          }
        }
        @media (max-height: 700px) {
          .signup-container {
            margin: 20px auto;
          }
        }
      `}</style>

      <div className="signup-container">
        <div className="logo-section">
          <Image src="/logo.png" alt="Logo" width={120} height={120} className="logo-icon" style={{ borderRadius: '50%' }} priority />
          <h1 className="title">Sign Up</h1>
          <p className="subtitle">Create new student account</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Profile Picture Upload */}
          <div className="form-group">
            <label className="form-label">Profile Picture</label>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              {imagePreview ? (
                // Show uploaded image in circle
                <div
                  style={{
                    position: 'relative',
                    display: 'inline-block'
                  }}
                >
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className="profile-picture-container"
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: '50%',
                      background: '#e9ecef',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isDragging ? '0 4px 16px rgba(31,168,220,0.4)' : '0 2px 8px rgba(31,168,220,0.15)',
                      border: isDragging ? '3px dashed #1FA8DC' : '2px solid #1FA8DC',
                      overflow: 'hidden',
                      position: 'relative',
                      transform: isDragging ? 'scale(1.05)' : 'scale(1)',
                      transition: 'all 0.3s ease'
                    }}
                    title="Drag & drop new image"
                  >
                    <img
                      key={form.profile_picture || 'local-preview'}
                      src={imagePreview}
                      alt="Profile preview"
                      className="profile-picture-image"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%'
                      }}
                    />
                  </div>
                  {/* Trash button in bottom right */}
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setForm({ ...form, profile_picture: null });
                      const fileInput = document.getElementById('profile-picture-upload');
                      if (fileInput) fileInput.value = '';
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
                      zIndex: 10
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'scale(1.1)';
                      e.target.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'scale(1)';
                      e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
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
                // Show upload button when no image
                <label
                  htmlFor="profile-picture-upload"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: '50%',
                    background: uploadingImage 
                      ? 'linear-gradient(135deg, #6c757d 0%, #495057 100%)' 
                      : isDragging
                      ? 'linear-gradient(135deg, #1FA8DC 0%, #87CEEB 100%)'
                      : 'linear-gradient(135deg, #87CEEB 0%, #B0E0E6 100%)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: uploadingImage ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    textAlign: 'center',
                    transition: 'all 0.3s ease',
                    boxShadow: isDragging ? '0 6px 20px rgba(31, 168, 220, 0.5)' : '0 4px 12px rgba(135, 206, 235, 0.3)',
                    opacity: uploadingImage ? 0.7 : 1,
                    border: isDragging ? '3px dashed white' : '2px solid #1FA8DC',
                    flexDirection: 'column',
                    gap: '8px',
                    transform: isDragging ? 'scale(1.05)' : 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    if (!uploadingImage) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 6px 16px rgba(135, 206, 235, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!uploadingImage) {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 4px 12px rgba(135, 206, 235, 0.3)';
                    }
                  }}
                >
                  {uploadingImage ? (
                    <>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        border: '3px solid rgba(255,255,255,0.3)',
                        borderTop: '3px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      <span style={{ fontSize: '0.75rem' }}>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Image src="/upload.svg" alt="Upload" width={32} height={32} style={{ filter: 'brightness(0) invert(1)' }} />
                      <span style={{ fontSize: '0.75rem' }}>Upload Picture</span>
                    </>
                  )}
                </label>
              )}
              <input
                id="profile-picture-upload"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={uploadingImage}
                style={{ display: 'none' }}
              />
              <small style={{ color: '#6c757d', fontSize: '0.85rem', textAlign: 'center', marginTop: '4px' }}>
                Max size: 10 MB. Formats: JPEG, PNG, GIF, WEBP
              </small>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">ID <span style={{color: 'red'}}>*</span></label>
            <input
              className={`form-input ${fieldErrors.id ? 'error-border' : ''}`}
              name="id"
              type="text"
              placeholder="Enter your ID"
              value={form.id}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (e.key === ' ') {
                  e.preventDefault();
                }
              }}
              aria-invalid={!!fieldErrors.id}
            />
            {fieldErrors.id && (
              <div className="field-error">
                <span className="field-error-dot" aria-hidden="true" />
                {fieldErrors.id}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Email <span style={{color: 'red'}}>*</span></label>
            <input
              className={`form-input ${fieldErrors.email ? 'error-border' : ''}`}
              name="email"
              type="email"
              placeholder="Enter your email"
              value={form.email}
              onChange={handleChange}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <div className="field-error">
                <span className="field-error-dot" aria-hidden="true" />
                {fieldErrors.email}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Password <span style={{color: 'red'}}>*</span></label>
            <div className="input-wrapper">
              <input
                className={`form-input ${fieldErrors.password ? 'error-border' : ''}`}
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password (min 8 characters)"
                value={form.password}
                onChange={handleChange}
                style={{ paddingRight: '50px' }}
                aria-invalid={!!fieldErrors.password}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img 
                  src={showPassword ? "/hide.svg" : "/show.svg"} 
                  alt={showPassword ? "Hide password" : "Show password"}
                  style={{ width: '20px', height: '20px' }}
                />
              </button>
            </div>
            {fieldErrors.password && (
              <div className="field-error">
                <span className="field-error-dot" aria-hidden="true" />
                {fieldErrors.password}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password <span style={{color: 'red'}}>*</span></label>
            <div className="input-wrapper">
              <input
                className={`form-input ${fieldErrors.confirmPassword ? 'error-border' : ''}`}
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={form.confirmPassword}
                onChange={handleChange}
                style={{ paddingRight: '50px' }}
                aria-invalid={!!fieldErrors.confirmPassword}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img 
                  src={showConfirmPassword ? "/hide.svg" : "/show.svg"} 
                  alt={showConfirmPassword ? "Hide password" : "Show password"}
                  style={{ width: '20px', height: '20px' }}
                />
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <div className="field-error">
                <span className="field-error-dot" aria-hidden="true" />
                {fieldErrors.confirmPassword}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Verification Account Code (VAC) <span style={{color: 'red'}}>*</span></label>
            <div className="vac-inputs-container">
              {form.vac.map((char, index) => {
                const vacComplete = form.id && form.vac.join('').length === 7;
                const vacInvalid = (!!fieldErrors.vac) || (!vacChecking && vacCheck && !vacCheck.valid && vacComplete);
                const vacValid = !fieldErrors.vac && !vacChecking && vacCheck && vacCheck.valid && !vacCheck.activated && vacComplete;
                return (
                <input
                  key={index}
                  ref={(el) => (vacInputRefs.current[index] = el)}
                  name={`vac-${index}`}
                  className={`vac-input ${vacInvalid ? 'error-border' : ''} ${vacValid ? 'valid-border' : ''}`}
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={char}
                  onChange={(e) => handleVACChange(e, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onPaste={(e) => handleVACPaste(e, index)}
                  aria-invalid={!!fieldErrors.vac}
                />
              );})}
            </div>
            {fieldErrors.vac && (
              <div className="vac-feedback invalid">
                <span className="vac-feedback-icon" aria-hidden="true">✕</span>
                <span className="vac-feedback-text">
                  <span className="vac-feedback-title">{fieldErrors.vac}</span>
                  <span className="vac-feedback-sub">
                    {fieldErrors.vac.toLowerCase().includes('already')
                      ? 'This ID is already registered. Please sign in instead.'
                      : fieldErrors.vac.toLowerCase().includes('complete')
                      ? 'Enter all 7 characters of your VAC code'
                      : fieldErrors.vac.toLowerCase().includes('not found')
                      ? 'Make sure your student ID is correct'
                      : 'Double-check your VAC and try again'}
                  </span>
                </span>
              </div>
            )}
            {/* VAC validation feedback */}
            {!fieldErrors.vac && form.id && form.vac.join('').length === 7 && (
              <div>
                {vacChecking && (
                  <div className="vac-feedback checking">
                    <span className="vac-feedback-icon" aria-hidden="true">
                      <span className="vac-spinner" />
                    </span>
                    <span className="vac-feedback-text">
                      <span className="vac-feedback-title">Verifying your code</span>
                      <span className="vac-feedback-sub">Please wait while we confirm your VAC</span>
                    </span>
                  </div>
                )}
                {!vacChecking && vacCheck && (
                  <>
                    {vacCheck.activated && vacCheck.valid && (
                      <div className="vac-feedback invalid">
                        <span className="vac-feedback-icon" aria-hidden="true">✕</span>
                        <span className="vac-feedback-text">
                          <span className="vac-feedback-title">Account already exists</span>
                          <span className="vac-feedback-sub">This ID is already registered. Please sign in instead.</span>
                        </span>
                      </div>
                    )}
                    {vacCheck.activated && !vacCheck.valid && (
                      <div className="vac-feedback invalid">
                        <span className="vac-feedback-icon" aria-hidden="true">✕</span>
                        <span className="vac-feedback-text">
                          <span className="vac-feedback-title">Incorrect verification code</span>
                          <span className="vac-feedback-sub">Double-check your VAC and try again</span>
                        </span>
                      </div>
                    )}
                    {!vacCheck.activated && vacCheck.valid && (
                      <div className="vac-feedback valid">
                        <span className="vac-feedback-icon" aria-hidden="true">✓</span>
                        <span className="vac-feedback-text">
                          <span className="vac-feedback-title">Verification code is valid</span>
                          <span className="vac-feedback-sub">You’re all set — continue creating your account</span>
                        </span>
                      </div>
                    )}
                    {!vacCheck.activated && !vacCheck.valid && vacCheck.exists && (
                      <div className="vac-feedback invalid">
                        <span className="vac-feedback-icon" aria-hidden="true">✕</span>
                        <span className="vac-feedback-text">
                          <span className="vac-feedback-title">Incorrect verification code</span>
                          <span className="vac-feedback-sub">Double-check your VAC and try again</span>
                        </span>
                      </div>
                    )}
                    {!vacCheck.exists && (
                      <div className="vac-feedback invalid">
                        <span className="vac-feedback-icon" aria-hidden="true">✕</span>
                        <span className="vac-feedback-text">
                          <span className="vac-feedback-title">ID not found</span>
                          <span className="vac-feedback-sub">Make sure your student ID is correct</span>
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && !signupSuccess && (
            <div style={{
              marginBottom: '16px',
              background: 'linear-gradient(135deg, #dc3545 0%, #e74c3c 100%)',
              color: 'white',
              borderRadius: '10px',
              padding: '16px 24px',
              boxShadow: '0 4px 16px rgba(220, 53, 69, 0.3)',
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '1rem'
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className={`signup-btn ${isSubmitting ? 'loading' : ''} ${signupSuccess ? 'success' : ''} ${signupFailed ? 'error' : ''}`}
            disabled={signupSuccess || signupFailed || isSubmitting || vacChecking || (vacCheck && !vacCheck.valid)}
          >
            <span className="signup-btn-content">
              {signupSuccess ? (
                <>
                  <span className="signup-btn-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className="signup-btn-success-text">Account Created</span>
                </>
              ) : signupFailed ? (
                <>
                  <span className="signup-btn-x" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </span>
                  <span className="signup-btn-error-text">Creation Failed</span>
                </>
              ) : isSubmitting ? (
                <>
                  <span className="signup-btn-spinner" aria-hidden="true" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>Sign Up</span>
              )}
            </span>
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.95rem', color: '#495057' }}>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              router.push('/');
            }}
            style={{
              color: '#007bff',
              textDecoration: 'none',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
          >
            <i className="fa fa-sign-in" aria-hidden="true" style={{ marginRight: '6px' }}></i>
            Back to login page
          </a>
          <NeedHelp />
        </div>
      </div>
    </div>
  );
}

