import { useEffect, useState } from 'react'
import {
  MISSED_REASON_LABEL,
  MISSED_STATUS_LABEL,
  suggestMissedSeverity,
  useStore,
} from '../store'
import { fmtDate } from '../lib/risk'
import { Badge, Field } from './ui'
import type { Booking, MissedMedication, MissedReason } from '../types'

const REASONS: MissedReason[] = ['missed', 'spit_out', 'vomited', 'refused', 'other']

const REASON_FREQ: Record<MissedReason, string> = {
  missed: '本班每 2 小时核对用药执行板；次日恢复常规',
  spit_out: '下次给药后留观 20 分钟确认咽下；本班每 2 小时核对',
  vomited: '夜班加密为每 2 小时巡视观察呕吐/排便；下次给药后留观 30 分钟',
  refused: '改为拌粮/喂药器，给药留观 20 分钟；本班每 2 小时核对',
  other: '按方案执行，本班加密核对',
}

const REASON_PLAN: Record<MissedReason, (med: string, time: string) => string> = {
  missed: (m) => `发现漏服「${m}」，在最近一次喂食时随少量粮补服（不双倍追服），其后恢复原时间点；若已接近下一次给药则跳过本次，按下一次常规执行。`,
  spit_out: (m) => `「${m}」被吐出，清理后 15 分钟用喂药器重新给一次原剂量并留观 20 分钟；若再次吐出则改为拌粮并请兽医确认。`,
  vomited: (m) => `服「${m}」后呕吐，不双倍追服；按兽医/医院指导，于次日清晨少量温水补服原剂量，原时间点照常一次，夜班加密巡视。`,
  refused: (m) => `拒服「${m}」，改用拌粮或喂药器补给原剂量，留观 20 分钟确认咽下；连续两次拒服请兽医评估给药途径。`,
  other: (m) => `「${m}」未按计划服入，按现场情况补服原剂量（不双倍），并加密观察。`,
}

function StatusPill({ m }: { m: MissedMedication }) {
  const cls =
    m.status === 'made_up' ? 'badge-green'
    : m.status === 'skipped' ? 'badge-gray'
    : m.status === 'pending_review' ? 'badge-red'
    : 'badge-amber'
  return <Badge className={cls}>{MISSED_STATUS_LABEL[m.status]}</Badge>
}

// ---------- 登记漏服 ----------
export function MissedMedForm({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const { currentUser, recordMissedMed } = useStore()
  const me = currentUser()!
  const meds = booking.profile.medications
  const [medId, setMedId] = useState(meds[0]?.id ?? '')
  const med = meds.find((x) => x.id === medId)
  const [reason, setReason] = useState<MissedReason>('missed')
  const [severity, setSeverity] = useState<'normal' | 'serious'>(suggestMissedSeverity('missed', meds[0]?.name ?? ''))
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setSeconds(0, 0)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  })
  const [scheduled, setScheduled] = useState(meds[0]?.times[0] ? `${date.slice(0, 10)}T${meds[0].times[0]}` : date)
  const [petCondition, setPetCondition] = useState('')
  const [notifyOwner, setNotifyOwner] = useState(true)
  const [notifyHospital, setNotifyHospital] = useState(false)

  useEffect(() => {
    setSeverity(suggestMissedSeverity(reason, med?.name ?? ''))
  }, [reason, med])

  if (meds.length === 0) {
    return <div className="small muted">该宠物没有用药计划，无法登记漏服。</div>
  }

  function submit() {
    if (!petCondition.trim()) return alert('请描述发现漏服时的宠物状态')
    const id = recordMissedMed({
      bookingId: booking.id,
      medicationId: medId,
      scheduledAt: new Date(scheduled).toISOString(),
      detectedAt: new Date(date).toISOString(),
      reason,
      petCondition: petCondition.trim(),
      severity,
      notifyOwner,
      notifyHospital,
    })
    if (severity === 'serious') alert('已登记为【严重漏服】，自动进入店长复核并生成异常协同单（按勾选项通知主人/医院）。')
    else if (notifyOwner) alert('已登记，补救方案确认后将向主人推送新的喂药说明。')
    void id
    onDone()
  }

  return (
    <div className="col">
      <Field label="药品">
        <select value={medId} onChange={(e) => {
          setMedId(e.target.value)
          const t = meds.find((x) => x.id === e.target.value)?.times[0]
          if (t) setScheduled(`${date.slice(0, 10)}T${t}`)
        }}>
          {meds.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.dosage} · {m.times.join('/')}</option>)}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="计划给药时间"><input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} /></Field>
        <Field label="发现时间"><input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="漏服原因">
        <select value={reason} onChange={(e) => setReason(e.target.value as MissedReason)}>
          {REASONS.map((r) => <option key={r} value={r}>{MISSED_REASON_LABEL[r]}</option>)}
        </select>
      </Field>
      <Field label="发现时宠物状态（精神/食欲/呕吐物/排便）">
        <textarea style={{ minHeight: 70 }} value={petCondition} onChange={(e) => setPetCondition(e.target.value)} placeholder="如：服药 30 分钟后吐出未消化粮混有药味，精神尚可，排便偏软…" />
      </Field>
      <div className="col" style={{ gap: 6 }}>
        <label className="checkbox-row"><input type="checkbox" checked={severity === 'serious'} onChange={(e) => setSeverity(e.target.checked ? 'serious' : 'normal')} />
          严重漏服（进入店长复核{severity === 'serious' ? '，系统已按原因/药品建议勾选' : ''}）</label>
        <div className="tiny muted">判定建议：服药后呕吐默认为严重；吐出药片/拒服与抗生素、处方类等关键药品漏服建议升级。严重漏服自动生成异常协同单。</div>
        <label className="checkbox-row"><input type="checkbox" checked={notifyOwner} onChange={(e) => setNotifyOwner(e.target.checked)} />同步联系主人（方案确认后推送新的喂药说明）</label>
        <label className="checkbox-row"><input type="checkbox" checked={notifyHospital} onChange={(e) => setNotifyHospital(e.target.checked)} />联系合作医院/兽医（用药指导）</label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onDone}>取消</button>
        <button className={severity === 'serious' ? 'btn-danger' : ''} onClick={submit}>登记漏服{severity === 'serious' ? '并提交店长复核' : ''}</button>
      </div>
    </div>
  )
}

// ---------- 方案确认（护理员，普通漏服；或店长复核通过后） ----------
export function RemedyPlanForm({ m }: { m: MissedMedication }) {
  const { confirmRemedyPlan, completeMakeUp, skipDose } = useStore()
  const [remediation, setRemediation] = useState<'make_up' | 'skip_dose' | 'vet_advice'>('make_up')
  const [plan, setPlan] = useState(REASON_PLAN[m.reason](m.medName, m.scheduledAt.slice(11, 16)))
  const [instruction, setInstruction] = useState(
    `${m.medName} 原定 ${m.scheduledAt.slice(11, 16)} 的一次未能按计划服入（${MISSED_REASON_LABEL[m.reason]}）。我们将${m.reason === 'vomited' ? '于次日清晨按兽医指导补服' : '在最近一次喂食时补服原剂量'}，不会双倍追服；${REASON_FREQ[m.reason]}。爱宠当前状态已记录，如有变化会第一时间联系您。`,
  )
  const [nextDate, setNextDate] = useState(() => {
    const d = new Date(m.detectedAt); d.setDate(d.getDate() + (m.reason === 'vomited' ? 1 : 0))
    return d.toISOString().slice(0, 10)
  })
  const [nextTime, setNextTime] = useState(m.reason === 'vomited' ? '06:30' : '09:30')
  const [makeUpNote, setMakeUpNote] = useState('')

  return (
    <div className="col">
      <div className="small muted">方案确认后：① 后续喂药提醒按调整时间更新；② 下一班提醒频率随原因调整；③ 主人端收到新的喂药说明。</div>
      <Field label="补救方式">
        <div className="row">
          {([['make_up', '安排补服（不双倍）'], ['skip_dose', '本次跳过，不补服'], ['vet_advice', '按兽医/医院指导补服']] as const).map(([v, t]) => (
            <label key={v} className="checkbox-row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
              <input type="radio" name="rem" checked={remediation === v} onChange={() => setRemediation(v)} />{t}
            </label>
          ))}
        </div>
      </Field>
      <Field label="补救方案（内部执行）"><textarea style={{ minHeight: 80 }} value={plan} onChange={(e) => setPlan(e.target.value)} /></Field>
      <Field label="给主人的新喂药说明（主人端可见）"><textarea style={{ minHeight: 80 }} value={instruction} onChange={(e) => setInstruction(e.target.value)} /></Field>
      {remediation !== 'skip_dose' && (
        <div className="form-grid">
          <Field label="补服/调整日期"><input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></Field>
          <Field label="调整后给药时间（后续提醒按此更新）">
            <input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} />
          </Field>
          <Field label="对下一班提醒频率的影响" full>
            <input value={REASON_FREQ[m.reason]} readOnly />
          </Field>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-danger" onClick={() => {
          if (!confirm('确认本次跳过、不再补服？')) return
          confirmRemedyPlan(m.id, { remediation: 'skip_dose', plan, ownerInstruction: instruction })
          skipDose(m.id, '方案判定本次跳过')
        }}>确认并跳次</button>
        <button onClick={() => {
          confirmRemedyPlan(m.id, {
            remediation, plan, ownerInstruction: instruction,
            nextSchedule: { nextDate, adjustedTime: nextTime, frequencyNote: REASON_FREQ[m.reason] },
          })
          alert('补救方案已确认，提醒时间已调整、主人说明已生成。到补服时间执行补服后在此页点「已补服成功」。')
        }}>确认补救方案</button>
      </div>

      {m.planConfirmedAt && m.status === 'pending_remedy' && (
        <div className="summary-box">
          方案已于 {fmtDate(m.planConfirmedAt)} 确认，等待执行补服。
          <div className="row" style={{ marginTop: 8 }}>
            <input placeholder="补服执行情况（剂量/宠物反应）" value={makeUpNote} onChange={(e) => setMakeUpNote(e.target.value)} style={{ flex: 1 }} />
            <button className="btn-sm" onClick={() => { if (!makeUpNote.trim()) return alert('请填写补服执行情况'); completeMakeUp(m.id, makeUpNote.trim()) }}>✓ 已补服成功</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- 店长复核 ----------
function ManagerReview({ m }: { m: MissedMedication }) {
  const { managerReviewMissedMed } = useStore()
  const [note, setNote] = useState('')
  return (
    <div className="col">
      <Field label="店长复核意见">
        <textarea style={{ minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="是否同意补服/是否需送医/夜间巡视要求…" />
      </Field>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-danger" onClick={() => { if (!note.trim()) return alert('请填写复核意见'); managerReviewMissedMed(m.id, note, false) }}>驳回（本次跳过）</button>
        <button onClick={() => { if (!note.trim()) return alert('请填写复核意见'); managerReviewMissedMed(m.id, note, true) }}>复核通过，转补救方案</button>
      </div>
    </div>
  )
}

// ---------- 漏服记录卡片（按角色展示不同操作区） ----------
export function MissedMedCard({ m }: { m: MissedMedication }) {
  const { users, currentUser, bookings } = useStore()
  const me = currentUser()!
  const booking = bookings.find((b) => b.id === m.bookingId)
  const name = (id?: string) => users.find((u) => u.id === id)?.name ?? '—'
  const owner = users.find((u) => u.id === booking?.ownerId)

  return (
    <div className="room-card" style={{ borderLeft: `4px solid ${m.severity === 'serious' ? 'var(--red)' : 'var(--amber)'}` }}>
      <div className="row-between">
        <b>💊 {m.medName}</b>
        <div className="row">
          {m.severity === 'serious' && <Badge className="badge-red">严重漏服</Badge>}
          <StatusPill m={m} />
        </div>
      </div>
      <div className="tiny muted" style={{ margin: '4px 0' }}>
        计划 {fmtDate(m.scheduledAt)} · 发现 {fmtDate(m.detectedAt)} · 原因：{MISSED_REASON_LABEL[m.reason]} · 登记人 {name(m.recordedById)}
      </div>
      <div className="small">宠物状态：{m.petCondition}</div>
      <div className="tiny muted" style={{ marginTop: 2 }}>
        通知：{m.notifyOwner ? `已联系主人（${owner?.name ?? '—'}）` : '未通知主人'} · {m.notifyHospital ? '已联系合作医院' : '未联系医院'}
      </div>

      {m.managerReviewedAt && <div className="tiny" style={{ marginTop: 4 }}>👔 店长复核（{fmtDate(m.managerReviewedAt)}）：{m.managerReviewNote}</div>}

      {m.plan && (
        <div className="summary-box" style={{ marginTop: 8 }}>
          <div><b>补救方案：</b>{m.plan}</div>
          {m.nextSchedule && (
            <div style={{ marginTop: 4 }}>
              ⏰ 后续提醒调整：<b>{m.nextSchedule.nextDate} {m.nextSchedule.adjustedTime}</b>
              {m.nextSchedule.adjustedTime !== m.nextSchedule.originalTime && <span className="tiny muted">（原 {m.nextSchedule.originalTime}）</span>}
              <div className="tiny muted">{m.nextSchedule.frequencyNote}</div>
            </div>
          )}
          {me.role === 'owner' && m.ownerInstruction && (
            <div style={{ marginTop: 6, borderTop: '1px dashed #fde68a', paddingTop: 6 }}>
              <b>📩 给主人的新喂药说明：</b>{m.ownerInstruction}
            </div>
          )}
          {me.role !== 'owner' && m.ownerInstruction && (
            <div className="tiny muted" style={{ marginTop: 4 }}>📩 已发送主人说明：{m.ownerInstruction}</div>
          )}
        </div>
      )}

      {m.status === 'made_up' && (
        <div className="badge badge-green" style={{ marginTop: 8 }}>
          ✓ {fmtDate(m.madeUpAt)} 已补服成功（{name(m.madeUpById)}）：{m.madeUpNote}
        </div>
      )}
      {m.status === 'skipped' && <div className="badge badge-gray" style={{ marginTop: 8 }}>本次已跳次/不补服</div>}

      {/* 操作区 */}
      <div className="divider" />
      {m.status === 'pending_review' && me.role === 'manager' && <ManagerReview m={m} />}
      {m.status === 'pending_review' && me.role !== 'manager' && <div className="small muted">等待店长复核后确定补救方案。</div>}
      {m.status === 'pending_remedy' && (me.role === 'manager' || me.role === 'caregiver') && <RemedyPlanForm m={m} />}
      {(me.role === 'manager' || me.role === 'caregiver') && m.status === 'pending_remedy' && !m.planConfirmedAt && null}
    </div>
  )
}

// ---------- 宠物维度的漏服列表 ----------
export function MissedMedList({ booking }: { booking: Booking }) {
  const list = booking.missedMedications ?? []
  if (list.length === 0) return null
  return (
    <div className="card">
      <h2>💢 喂药漏服补救（{list.length}）</h2>
      <div className="col">
        {list.map((m) => <MissedMedCard key={m.id} m={m} />)}
      </div>
    </div>
  )
}
