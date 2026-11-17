import { useId } from 'react'
import './pin.css'

interface PinFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  /** Id of the error message belonging to this field (only used when `invalid`). */
  errorId?: string
  disabled?: boolean
  autoFocus?: boolean
}

/** Input field for a 4-digit PIN (masked characters, numeric keyboard). */
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
