import { useState, useRef, useEffect } from 'react';

interface HebrewDateInputProps {
  value: string; // ISO format: yyyy-mm-dd
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

/**
 * Date input that displays dd/mm/yyyy (Hebrew convention)
 * but stores value as yyyy-mm-dd (ISO) for API compatibility.
 */
export function HebrewDateInput({ value, onChange, placeholder = 'dd/mm/yyyy', className = '', id }: HebrewDateInputProps) {
  const [displayValue, setDisplayValue] = useState(() => isoToDisplay(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync display when external value changes
  useEffect(() => {
    setDisplayValue(isoToDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Auto-format: insert slashes as user types digits
    const digits = raw.replace(/\D/g, '');
    if (digits.length <= 2) {
      raw = digits;
    } else if (digits.length <= 4) {
      raw = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      raw = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }

    setDisplayValue(raw);

    // Try to parse a complete date
    const iso = displayToIso(raw);
    if (iso) {
      onChange(iso);
    } else if (raw === '') {
      onChange('');
    }
  };

  const handleBlur = () => {
    // Re-format on blur if valid
    if (displayValue === '') {
      onChange('');
      return;
    }
    const iso = displayToIso(displayValue);
    if (iso) {
      setDisplayValue(isoToDisplay(iso));
    }
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      maxLength={10}
      className={className}
      dir="ltr"
    />
  );
}

/** Convert ISO yyyy-mm-dd to display dd/mm/yyyy */
function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Convert display dd/mm/yyyy to ISO yyyy-mm-dd */
function displayToIso(display: string): string {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, dd, mm, yyyy] = match;
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10);
  const year = parseInt(yyyy, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return '';
  return `${yyyy}-${mm}-${dd}`;
}
