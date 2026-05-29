import { useState } from 'react';
import { useUserMode } from '../../context/UserModeContext';
import { REDACTION_BYPASS_PASSWORD } from '../../data/redactionRules';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import { Toggle } from '../shared/Toggle';

/**
 * Toolbar control for the user-mode redaction veil. Default: ON.
 *
 * Turning OFF is gated by a hard-coded password modal (NOT a security control —
 * the password ships in the JS bundle). On a correct entry the toggle flips
 * to OFF for the rest of the session; closing the tab or logging out snaps it
 * back to ON. Turning back ON is one click — no gate needed.
 *
 * Cancelling the password modal leaves the toggle ON and clears the input.
 */
export function RedactionToggle() {
  const { redactionOn, setRedactionOn } = useUserMode();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleToggle = (next: boolean) => {
    if (!next) {
      // User wants to turn redaction OFF — gate.
      setPassword('');
      setError(null);
      setPasswordOpen(true);
    } else {
      // Turning back ON — no gate.
      setRedactionOn(true);
    }
  };

  const handlePasswordSubmit = () => {
    if (password === REDACTION_BYPASS_PASSWORD) {
      setRedactionOn(false);
      setPasswordOpen(false);
      setPassword('');
      setError(null);
    } else {
      setError('Incorrect password.');
    }
  };

  const handlePasswordClose = () => {
    setPasswordOpen(false);
    setPassword('');
    setError(null);
  };

  return (
    <>
      <Toggle label="Redaction" checked={redactionOn} onChange={handleToggle} />

      <Modal
        open={passwordOpen}
        onClose={handlePasswordClose}
        title="Turn off redaction"
        footer={
          <>
            <Button variant="secondary" onClick={handlePasswordClose}>Cancel</Button>
            <Button variant="primary" onClick={handlePasswordSubmit} disabled={password.length === 0}>
              Turn off
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-body-secondary">
            Redaction masks sensitive values in the Description column. Enter the access
            password to view the raw text for the rest of this session.
          </p>
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password.length > 0) {
                e.preventDefault();
                handlePasswordSubmit();
              }
            }}
            placeholder="Enter password"
            autoFocus
            autoComplete="off"
            error={!!error}
          />
          {error && <p className="text-xs text-red-500 dark:text-rose-300">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
