import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

export interface Sum {
  a: number
  b: number
}

export function randomSum(): Sum {
  return { a: 3 + Math.floor(Math.random() * 7), b: 3 + Math.floor(Math.random() * 7) }
}

interface GateProps {
  sum: Sum
  onUnlock: () => void
}

/** Ouderslot: een som die een kind van 4 nog niet kan oplossen. Geen echte beveiliging. */
export default function Gate({ sum, onUnlock }: GateProps) {
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)
  const inputId = useId()
  const errorId = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (Number(answer.trim()) === sum.a * sum.b && answer.trim() !== '') {
      onUnlock()
    } else {
      setWrong(true)
      setAnswer('')
    }
  }

  return (
    <main className="page parent parent-gate">
      <h1>Ouderbeheer</h1>
      <p>Alleen voor ouders. Los de som op om verder te gaan.</p>
      <form className="parent-card" onSubmit={submit}>
        <label htmlFor={inputId} className="parent-sum">
          Hoeveel is {sum.a} × {sum.b}?
        </label>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus
          value={answer}
          onChange={(event) => {
            setAnswer(event.target.value)
            setWrong(false)
          }}
          aria-invalid={wrong}
          aria-describedby={wrong ? errorId : undefined}
        />
        {wrong ? (
          <p id={errorId} role="alert" className="parent-error">
            Dat klopt niet. Probeer het nog eens.
          </p>
        ) : null}
        <button type="submit">Openen</button>
      </form>
      <Link className="parent-link" to="/">
        ← Terug
      </Link>
    </main>
  )
}
