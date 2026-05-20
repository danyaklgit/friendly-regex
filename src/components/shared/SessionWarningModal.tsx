import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Modal } from './Modal';
import { Button } from './Button';

function formatCountdown(deadline: number | null, now: number): string {
  if (deadline == null) return '';
  const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `Logging out in ${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SessionWarningModal() {
  const { showSessionWarning, graceDeadline, refreshSession, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 1 Hz tick while the warning is showing — drives the countdown text. We
  // gate on `showSessionWarning` so the interval tears down once dismissed.
  useEffect(() => {
    if (!showSessionWarning) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [showSessionWarning]);

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
      zClass="z-[10000]"
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
        <p className="text-heading font-medium text-lg tabular-nums">
          {formatCountdown(graceDeadline, now)}
        </p>
        <p className="text-muted text-sm mt-2">
          Click "Get More Time" to continue your session.
        </p>
      </div>
    </Modal>
  );
}
