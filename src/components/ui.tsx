import type { ReactNode } from 'react'
import type { Pet } from '../types'
import { RISK_LABEL, RISK_STYLE, type PetRisk } from '../lib/risk'

export function Badge({ className = 'badge-gray', children }: { className?: string; children: ReactNode }) {
  return <span className={`badge ${className}`}>{children}</span>
}

export function RiskBadge({ risk }: { risk: PetRisk }) {
  return <Badge className={RISK_STYLE[risk.level]}>⚠ {RISK_LABEL[risk.level]}（{risk.score} 分）</Badge>
}

export function PetAvatar({ pet, size }: { pet?: Pet; size?: 'lg' }) {
  const ch = pet ? pet.name.slice(0, 1) : '?'
  const icon = pet?.species === 'cat' ? '🐱' : pet?.species === 'dog' ? '🐶' : '🐾'
  return (
    <span className={`pet-avatar ${size === 'lg' ? 'lg' : ''}`} style={{ background: pet?.avatarColor ?? '#94a3b8' }}>
      {icon}
    </span>
  )
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn-link" onClick={onClose}>✕ 关闭</button>
        </div>
        {children}
        {footer && <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty">🐾 {text}</div>
}

export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

// 1–5 分评分（试住观察）
export function ScorePicker({ value, onChange, labels }: { value: number; onChange: (v: number) => void; labels?: [string, string, string, string, string] }) {
  const L = labels ?? ['很好', '较好', '一般', '较差', '很差']
  return (
    <div className="row" style={{ gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="btn-sm"
          style={{
            background: value === n ? ['#059669', '#65a30d', '#d97706', '#ea580c', '#dc2626'][n - 1] : '#fff',
            color: value === n ? '#fff' : '#6b7280',
            border: '1px solid var(--border)',
            width: 40,
          }}
          onClick={() => onChange(n)}
          title={L[n - 1]}
        >
          {n}
        </button>
      ))}
      {value > 0 && <span className="small muted">{L[value - 1]}</span>}
    </div>
  )
}
