import { useUserMode } from '../../context/UserModeContext';
import { Button } from '../shared/Button';

/**
 * Small header affordance that returns the user to the CompanyPicker. Visually
 * mirrors the "My Contributions" button in the toolbar so the two header
 * actions read as the same family.
 */
export function ChangeCompanyButton() {
  const { selectedCompany, setSelectedCompany } = useUserMode();
  if (!selectedCompany) return null;
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() => setSelectedCompany(null)}
      title="Pick a different company"
    >
      Change company
    </Button>
  );
}
