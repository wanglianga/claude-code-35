import { useState } from 'react'
import {
  OUTCOME_KIND_LABEL,
  OUTCOME_STATUS_LABEL,
  useStore,
} from '../store'
import { fmtDate } from '../lib/risk'
import { Badge, Field } from './ui'
import type { Booking, TrialOutcomeKind } from '../types'

const KINDS: { key: TrialOutcomeKind; icon: string; desc: string }[] = [
  { key: 'reject', icon: '🚫', desc: '持续攻击/严重应激/拒食等超出门店照护能力，暂不接收' },
  { key: 'solo_upgrade', icon: '💰', desc: '风险可控但必须 1v1 单独照护，加价接收' },
  { key: 'hospital_check', icon: '🏥', desc: '建议主人先送合作医院检查，凭结果再决定房态' },
]

const REASON_TEMPLATES: Record<TrialOutcomeKind, string> = {
  reject: '试住期间持续攻击/严重应激并拒食，超出本店照护能力；建议先完成行为评估与疫苗补种后再预约。',
  solo_upgrade: '存在中等攻击/应激表现，不能与其他动物共处，但可在单独照护间 1v1 护理，需主人同意加价。',
  hospital_check: '试住出现呕吐/腹泻/精神差等疑似健康问题，建议先送合作医院检查，结果出来前不入寄养。',
}

// ---------- 店长提案表单 ----------
function ProposeForm({ booking }: { booking: Booking }) {
  const { proposeTrialOutcome } = useStore()
  const [kind, setKind] = useState<TrialOutcomeKind>('reject')
  const [reason, setReason] = useState(REASON_TEMPLATES.reject)
  const [trialFee, setTrialFee] = useState(80)
  const [feeWaived, setFeeWaived] = useState(true)
  const [depositRefund, setDepositRefund] = useState(booking.depositPaid)
  const [surcharge, setSurcharge] = useState(200)
  const [hospitalNote, setHospitalNote] = useState('建议 24 小时内到合作动物医院排查传染病/消化道，携带试住观察记录。')

  function chooseKind(k: TrialOutcomeKind) {
    setKind(k)
    setReason(REASON_TEMPLATES[k])
    if (k === 'reject') { setFeeWaived(true); setDepositRefund(booking.depositPaid) }
    if (k === 'hospital_check') { setFeeWaived(false); setDepositRefund(booking.depositPaid) }
    if (k === 'solo_upgrade') { setFeeWaived(false) }
  }

  function submit() {
    if (!reason.trim()) return alert('请填写拒收/处置原因（会写入宠物档案）')
    proposeTrialOutcome(booking.id, {
      kind, reason: reason.trim(),
      trialFee: feeWaived ? 0 : trialFee,
      trialFeeWaived: feeWaived,
      depositRefund,
      hospitalNote: kind === 'hospital_check' ? hospitalNote : undefined,
      soloSurchargeTotal: kind === 'solo_upgrade' ? surcharge : undefined,
      soloSurchargeNote: kind === 'solo_upgrade' ? '试住评估升级单独照护间 1v1' : undefined,
    })
  }

  return (
    <div className="col">
      <div className="col" style={{ gap: 6 }}>
        {KINDS.map((k) => (
          <label key={k.key} className="checkbox-row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
            <input type="radio" name="outcome" checked={kind === k.key} onChange={() => chooseKind(k.key)} />
            <span><b>{k.icon} {OUTCOME_KIND_LABEL[k.key]}</b><span className="small muted"> — {k.desc}</span></span>
          </label>
        ))}
      </div>
      <Field label="拒收/处置原因（永久写入宠物档案，再次预约自动提示）">
        <textarea style={{ minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="form-grid">
        <Field label="试住服务费（元）">
          <div className="row">
            <input type="number" disabled={feeWaived} value={trialFee} onChange={(e) => setTrialFee(Number(e.target.value))} />
            <label className="checkbox-row small"><input type="checkbox" checked={feeWaived} onChange={(e) => setFeeWaived(e.target.checked)} />免收</label>
          </div>
        </Field>
        <Field label="押金退还（元，拒收通常全额退）">
          <input type="number" value={depositRefund} onChange={(e) => setDepositRefund(Number(e.target.value))} />
        </Field>
        {kind === 'solo_upgrade' && (
          <Field label="单独照护加价总额（元，写入订单加项）" full>
            <input type="number" value={surcharge} onChange={(e) => setSurcharge(Number(e.target.value))} />
          </Field>
        )}
        {kind === 'hospital_check' && (
          <Field label="给主人/医院的检查建议" full>
            <textarea value={hospitalNote} onChange={(e) => setHospitalNote(e.target.value)} />
          </Field>
        )}
      </div>
      <button className="btn-danger" onClick={submit}>提交处置方案，待主人确认</button>
    </div>
  )
}

// ---------- 主人确认 ----------
function OwnerResponse({ booking }: { booking: Booking }) {
  const { ownerRespondOutcome } = useStore()
  const o = booking.trialOutcome!
  const [note, setNote] = useState('')
  return (
    <div className="col">
      <Field label="备注（可选）"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="给门店的回复" /></Field>
      <div className="row">
        <button onClick={() => ownerRespondOutcome(booking.id, true, note.trim())}>
          {o.kind === 'solo_upgrade' ? '接受加价，继续单独照护寄养' : o.kind === 'hospital_check' ? '知晓，先带宠物就医检查' : '确认拒收结论并接回'}
        </button>
        <button className="btn-danger" onClick={() => ownerRespondOutcome(booking.id, false, note.trim() || '主人对结论有异议，申请店长复核')}>
          有异议，申请复核
        </button>
      </div>
    </div>
  )
}

// ---------- 完整处置面板 ----------
export default function TrialOutcomePanel({ booking }: { booking: Booking }) {
  const { currentUser, users, pets } = useStore()
  const me = currentUser()!
  const o = booking.trialOutcome
  const pet = pets.find((p) => p.id === booking.petId)
  const blocked = (pet?.rejections ?? []).filter((r) => r.blocking)
  const name = (id?: string) => users.find((u) => u.id === id)?.name ?? '—'

  // 无处置提案：店长可发起（试住中，且未进入寄养）
  if (!o) {
    if (me.role !== 'manager') return null
    if (booking.status === 'boarding' || booking.status === 'closed' || booking.status === 'rejected') return null
    return (
      <div className="card" style={{ borderLeft: '4px solid var(--red)' }}>
        <h2>🚫 试住不通过处置</h2>
        <p className="small muted">试住中出现持续攻击、应激严重或拒食时，在此给出拒收 / 单独照护加价 / 建议医院检查；主人确认后押金、试住费与预约状态同步更新，拒收原因永久保留到宠物档案并限制再次接单。</p>
        <ProposeForm booking={booking} />
      </div>
    )
  }

  // 已有提案
  const cls = o.status === 'owner_accepted' ? 'badge-green' : o.status === 'owner_disputed' ? 'badge-red' : o.status === 'closed' ? 'badge-gray' : 'badge-amber'
  const isOwner = me.role === 'owner' && booking.ownerId === me.id
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--red)' }}>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>🚫 试住不通过处置 · {OUTCOME_KIND_LABEL[o.kind]}</h2>
        <Badge className={cls}>{OUTCOME_STATUS_LABEL[o.status]}</Badge>
      </div>
      <div className="tiny muted" style={{ margin: '6px 0' }}>提案人 {name(o.proposedById)} · {fmtDate(o.proposedAt)}</div>
      <div className="summary-box" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
        <b>门店记录的原因：</b>{o.reason}
      </div>
      <div className="row" style={{ margin: '8px 0' }}>
        <span className="chip">试住费：{o.trialFeeWaived ? '免收' : `¥${o.trialFee}`}</span>
        <span className="chip">押金退还：¥{o.depositRefund}</span>
        {o.kind === 'solo_upgrade' && <span className="chip amber">单独照护加价：¥{o.soloSurchargeTotal ?? 0}</span>}
      </div>
      {o.hospitalNote && <div className="summary-box">🏥 {o.hospitalNote}</div>}

      {o.ownerRespondedAt && (
        <div className="small" style={{ marginTop: 6 }}>
          主人{o.ownerResponse === 'accepted' ? '已确认' : '提出异议'}（{fmtDate(o.ownerRespondedAt)}）：{o.ownerNote || '（无备注）'}
        </div>
      )}

      {/* 待主人确认 */}
      {o.status === 'proposed' && isOwner && (
        <div className="divider" />
      )}
      {o.status === 'proposed' && isOwner && <OwnerResponse booking={booking} />}
      {o.status === 'proposed' && !isOwner && me.role === 'manager' && (
        <div className="small muted" style={{ marginTop: 8 }}>已通知主人「{booking.ownerName}」，等待其在主人端确认或提出异议。</div>
      )}

      {/* 主人异议 → 店长改判 */}
      {o.status === 'owner_disputed' && me.role === 'manager' && (
        <>
          <div className="divider" />
          <h3>店长复核改判</h3>
          <ProposeForm booking={booking} />
        </>
      )}

      {/* 接受后的结果说明 */}
      {o.status === 'owner_accepted' && (
        <div className="small" style={{ marginTop: 8 }}>
          {o.kind === 'reject' && <>✓ 订单已置为「已拒收」，押金退还 ¥{o.depositRefund}、试住费{o.trialFeeWaived ? '免收' : `¥${o.trialFee}`} 已入同一订单；<b>拒收原因已写入 {booking.petName} 档案，再次预约将被系统拦截</b>。</>}
          {o.kind === 'solo_upgrade' && <>✓ 主人已接受加价，订单转入寄养（单独照护间），加价 ¥{o.soloSurchargeTotal} 已计入订单。</>}
          {o.kind === 'hospital_check' && <>✓ 主人已知晓就医建议，本次预约暂挂，待医院结果出来后重新评估房态。</>}
        </div>
      )}

      {blocked.length > 0 && (
        <div className="summary-box" style={{ marginTop: 10, background: '#fee2e2', borderColor: '#fecaca' }}>
          ⚠ 宠物档案已有 {blocked.length} 条硬性拒收记录（最近：{fmtDate(blocked[0].at)}，{blocked[0].bookingCode}）：{blocked[0].reason.slice(0, 60)}…
        </div>
      )}
    </div>
  )
}
