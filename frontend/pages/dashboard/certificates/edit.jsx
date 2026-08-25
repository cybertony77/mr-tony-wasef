import { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Title from '../../../components/Title';
import CertificateForm from '../../../components/CertificateForm';
import apiClient from '../../../lib/axios';

export default function EditCertificate() {
  const router = useRouter();
  const { id } = router.query;
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['certificate', id],
    queryFn: async () => (await apiClient.get(`/api/certificates?id=${id}`)).data,
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (payload) => (await apiClient.put(`/api/certificates?id=${id}`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries(['certificates']);
      queryClient.invalidateQueries(['certificate', id]);
      router.push('/dashboard/certificates');
    },
    onError: (err) => {
      const msg = err.response?.data?.error || 'Failed to update certificate';
      setError(msg.startsWith('❌') ? msg : `❌ ${msg}`);
    },
  });

  const certificate = data?.certificate;

  return (
    <div style={{ minHeight: '100vh', padding: '20px 5px' }}>
      <div style={{ maxWidth: 800, margin: '40px auto', padding: '20px 5px', width: '100%', boxSizing: 'border-box' }}>
        <Title backText="Back" href="/dashboard/certificates">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/edit.svg" alt="Edit" width={30} height={30} />
            Edit Certificate
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
          {isLoading || !certificate ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6c757d', fontWeight: 600 }}>
              {isLoading ? 'Loading…' : 'Certificate not found'}
            </div>
          ) : (
            <CertificateForm
              mode="edit"
              initialData={certificate}
              onSubmit={(payload) => {
                setError('');
                mutation.mutate(payload);
              }}
              onCancel={() => router.push('/dashboard/certificates')}
              submitting={mutation.isPending}
              errorMessage={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}
