import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTimeRemaining } from '../../hooks/useTimeRemaining';
import { Modal } from './Modal';
import { Button } from './Button';

export function SessionWarningModal() {
  const { showSessionWarning, expiresAt, refreshSession, logout } = useAuth();
  const timeRemaining = useTimeRemaining(expiresAt);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSession();
    setRefreshing(false);
  };

  return (
    <Modal
      open={showSessionWarning}
      onClose={() => {}}
      title="Session Expiring"
      footer={
        <>
          <Button variant="secondary" onClick={logout}>
            Log Out
          </Button>
          <Button variant="primary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Extending...' : 'Get More Time'}
          </Button>
        </>
      }
    >
      <div className="text-center py-4">
        <div className="text-4xl mb-4">&#9200;</div>
        <p className="text-body-secondary mb-2">
          You've been inactive for a while.
        </p>
        <p className="text-heading font-medium text-lg">
          {timeRemaining}
        </p>
        <p className="text-muted text-sm mt-2">
          Click "Get More Time" to continue your session.
        </p>
      </div>
    </Modal>
  );
}
