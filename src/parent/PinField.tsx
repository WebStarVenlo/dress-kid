import { useId } from 'react'
import './pin.css'

interface PinFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  /** Id van de foutmelding die bij dit veld hoort (alleen gebruikt als `invalid`). */
  errorId?: string
  disabled?: boolean
  autoFocus?: boolean
}

/** Invoerveld voor een pincode van 4 cijfers (verborgen tekens, numeriek toetsenbord). */
export default function PinField({ label, value, onChange, invalid = false, errorId, disabled, autoFocus }: PinFieldProps) {
  const inputId = useId()
  return (
    <div className="parent-field pin-field">
      <label htmlFor={inputId} className="parent-field-label">
        {label}
      </label>
      <input
        id={inputId}
        className="pin-input"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={invalid && errorId ? errorId : undefined}
      />
    </div>
  )
}
