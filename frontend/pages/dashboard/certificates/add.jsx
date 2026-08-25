import { useState } from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Title from '../../../components/Title';
import CertificateForm from '../../../components/CertificateForm';
import apiClient from '../../../lib/axios';

export default function AddCertificate() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async (payload) => (await apiClient.post('/api/certificates', payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries(['certificates']);
      router.push('/dashboard/certificates');
    },
    onError: (err) => {
      const msg = err.response?.data?.error || 'Failed to create certificate';
      setError(msg.startsWith('❌') ? msg : `❌ ${msg}`);
    },
  });

  return (
    <div style={{ minHeight: '100vh', padding: '20px 5px' }}>
      <div style={{ maxWidth: 800, margin: '40px auto', padding: '20px 5px', width: '100%', boxSizing: 'border-box' }}>
        <Title backText="Back" href="/dashboard/certificates">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/plus.svg" alt="Add" width={30} height={30} />
            Add Certificate
          </div>
        </Title>
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            overflow: 'visible',
          }}
        >
          <CertificateForm
            mode="add"
            onSubmit={(payload) => {
              setError('');
              mutation.mutate(payload);
            }}
            onCancel={() => router.push('/dashboard/certificates')}
            submitting={mutation.isPending}
            errorMessage={error}
          />
        </div>
      </div>
    </div>
  );
}
