import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Input } from '../shared/Input';
import { Button } from '../shared/Button';
import type { VIPCustomer } from '../../api/vipCustomers';
import { validateVIPCustomer } from '../../utils/vipCustomers';

interface VIPCustomerFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (customer: VIPCustomer) => Promise<void>;
  onValidationError?: (message: string) => void;
  /** Edit an existing account (full-replace update). */
  existing?: VIPCustomer;
  /** Add a NEW account to an existing customer — org identity is prefilled
   *  from the selected org and OrgId is locked so the grouping stays intact. */
  prefillOrg?: { OrgId: string; OrgNames: VIPCustomer['OrgNames']; TenantCode?: string | null };
}

function nameFor(list: { LanguageCode: string }[] | undefined, lang: string, key: 'OrgName' | 'AccountName'): string {
  const entry = list?.find((n) => n.LanguageCode === lang) as Record<string, string> | undefined;
  return entry?.[key] ?? '';
}

export function VIPCustomerFormModal({ open, onClose, onSave, onValidationError, existing, prefillOrg }: VIPCustomerFormModalProps) {
  const isEdit = !!existing;
  const orgLocked = !!prefillOrg && !isEdit;
  const seed = existing ?? (prefillOrg ? { OrgId: prefillOrg.OrgId, OrgNames: prefillOrg.OrgNames, TenantCode: prefillOrg.TenantCode } : undefined);

  const [orgId, setOrgId] = useState(seed?.OrgId ?? '');
  const [orgNameEn, setOrgNameEn] = useState(() => nameFor(seed?.OrgNames, 'en', 'OrgName'));
  const [orgNameAr, setOrgNameAr] = useState(() => nameFor(seed?.OrgNames, 'ar', 'OrgName'));
  const [iban, setIban] = useState(existing?.IBAN ?? '');
  const [bban, setBban] = useState(existing?.BBAN ?? '');
  const [bankCode, setBankCode] = useState(existing?.BankCode ?? '');
  const [accountNumber, setAccountNumber] = useState(existing?.AccountNumber ?? '');
  const [code, setCode] = useState(existing?.Code ?? '');
  const [internalAccountId, setInternalAccountId] = useState(existing?.InternalAccountId ?? '');
  const [tenantCode, setTenantCode] = useState(seed?.TenantCode ?? '');
  const [currencyCode, setCurrencyCode] = useState(existing?.CurrencyCode ?? '');
  const [countryCode, setCountryCode] = useState(existing?.CountryCode ?? '');
  const [accountNameEn, setAccountNameEn] = useState(() => nameFor(existing?.AccountNames, 'en', 'AccountName'));
  const [accountNameAr, setAccountNameAr] = useState(() => nameFor(existing?.AccountNames, 'ar', 'AccountName'));
  const [saving, setSaving] = useState(false);

  function build(): VIPCustomer {
    const orgNames = [
      { LanguageCode: 'en', OrgName: orgNameEn.trim() },
      { LanguageCode: 'ar', OrgName: orgNameAr.trim() },
    ].filter((n) => n.OrgName);
    const accountNames = [
      { LanguageCode: 'en', AccountName: accountNameEn.trim() },
      { LanguageCode: 'ar', AccountName: accountNameAr.trim() },
    ].filter((n) => n.AccountName);
    return {
      ...(isEdit ? { Id: existing!.Id } : {}),
      OrgId: orgId.trim(),
      OrgNames: orgNames,
      TenantCode: tenantCode.trim() || null,
      InternalAccountId: internalAccountId.trim() || null,
      AccountNumber: accountNumber.trim() || null,
      Code: code.trim() || null,
      BankCode: bankCode.trim() || null,
      BBAN: bban.trim() || null,
      IBAN: iban.trim(),
      CurrencyCode: currencyCode.trim() || null,
      CountryCode: countryCode.trim() || null,
      AccountNames: accountNames,
    };
  }

  const ibanHasPipe = iban.includes('|');
  const canSave = orgId.trim().length > 0 && iban.trim().length > 0 && !ibanHasPipe && orgNameEn.trim().length > 0;

  const handleSave = async () => {
    const customer = build();
    const error = validateVIPCustomer(customer);
    if (error) { onValidationError?.(error); return; }
    setSaving(true);
    try {
      await onSave(customer);
      onClose();
    } catch {
      // surfaced by the caller's toast
    } finally {
      setSaving(false);
    }
  };

  const title = isEdit ? 'Edit VIP Account' : prefillOrg ? `Add Account to ${nameFor(prefillOrg.OrgNames, 'en', 'OrgName') || prefillOrg.OrgId}` : 'Add VIP Customer';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Customer (org) identity */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">Customer</p>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Organization ID"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="e.g. 150000780016"
              required
              maxLength={200}
              disabled={orgLocked}
            />
            <Input
              label="Tenant Code"
              value={tenantCode}
              onChange={(e) => setTenantCode(e.target.value)}
              placeholder="e.g. BWATECH"
              maxLength={200}
              disabled={orgLocked}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Customer Name (EN)"
              value={orgNameEn}
              onChange={(e) => setOrgNameEn(e.target.value)}
              placeholder="e.g. BwaTech"
              required
              maxLength={200}
              disabled={orgLocked}
            />
            <Input
              label="Customer Name (AR)"
              value={orgNameAr}
              onChange={(e) => setOrgNameAr(e.target.value)}
              placeholder="اسم العميل"
              dir="rtl"
              maxLength={200}
              disabled={orgLocked}
            />
          </div>
        </div>

        {/* Account identity */}
        <div className="space-y-3 border-t border-border-subtle pt-3">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">Account</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label="IBAN"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="SA0420000002184182559940"
                required
                maxLength={200}
                error={ibanHasPipe}
              />
              {ibanHasPipe && (
                <p role="alert" className="text-xs text-red-600 dark:text-rose-300 mt-1">
                  IBAN must not contain the &quot;|&quot; character.
                </p>
              )}
            </div>
            <Input label="BBAN" value={bban} onChange={(e) => setBban(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Bank Code" value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="e.g. RIBLSARI" maxLength={200} />
            <Input label="Internal Account ID" value={internalAccountId} onChange={(e) => setInternalAccountId(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Account Number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={200} />
            <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Currency Code" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} placeholder="SAR" maxLength={200} />
            <Input label="Country Code" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="SA" maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Account Name (EN)" value={accountNameEn} onChange={(e) => setAccountNameEn(e.target.value)} placeholder="e.g. Riyad Bank" maxLength={200} />
            <Input label="Account Name (AR)" value={accountNameAr} onChange={(e) => setAccountNameAr(e.target.value)} placeholder="اسم الحساب" dir="rtl" maxLength={200} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
