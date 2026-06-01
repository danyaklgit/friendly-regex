import { useUserMode } from '../../context/UserModeContext';
import { Button } from '../shared/Button';

/**
 * Small header affordance that returns the user to the BankPicker. Visually
 * mirrors the "My Contributions" button in the toolbar so the two header
 * actions read as the same family.
 */
export function ChangeBanksButton() {
  const { selectedBanks, setSelectedBanks } = useUserMode();
  if (selectedBanks.length === 0) return null;
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() => setSelectedBanks([])}
      title="Pick different banks"
    >
      Change banks
    </Button>
  );
}
