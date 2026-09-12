import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, eventsOfPet, openIncidentCount, effectiveMedPlan } from '../store'
import { computeRisk, fmtDate, fmtDay } from '../lib/risk'
import { Badge, EmptyState, Field, PetAvatar, RiskBadge } from '../components/ui'

// 单只宠物的当日照护摘要（喂药/饮食/排便/互动/主人沟通/异常）
function PetDailyDigest({ petId }: { petId: string }) {
  const { bookings, events, incidents, users } = useStore()
  const pet = useStore((s) => s.pets.find((p) => p.id === petId))
  const today = new Date().toISOString().slice(0, 10)
  const booking = bookings.filter((b) => b.petId === petId && b.status !== 'closed').sort((a, b2) => (a.createdAt < b2.createdAt ? 1 : -1))[0]
  if (!booking) return null
  const dayEvents = eventsOfPet(events, petId).filter((e) => e.at.startsWith(today))
  const feeds = dayEvents.filter((e) => e.type === 'feed')
  const meds = dayEvents.filter((e) => e.type === 'medicate')
  const walks = dayEvents.filter((e) => e.type === 'walk')
  const videos = dayEvents.filter((e) => e.type === 'video')
  const notes = dayEvents.filter((e) => e.type === 'note')
  const abn = dayEvents.filter((e) => e.type === 'abnormal')
  const plannedMeds = booking.profile.medications
  const openInc = incidents.filter((i) => i.petId === petId && i.status !== 'resolved')
  const risk = computeRisk(booking, openInc.length)
  const missedList = booking.missedMedications ?? []
  const pendingMissed = missedList.filter((m) => m.status !== 'made_up' && m.status !== 'skipped')

  // 喂药执行对照（套用漏服补救后的调整时间与状态）
  const medRows = effectiveMedPlan(booking, events, today)

  const stoolWorst = feeds.some((f) => f.stool === 'diarrhea') ? '腹泻' : feeds.some((f) => f.stool === 'soft') ? '偏软' : feeds.some((f) => f.stool === 'normal') ? '正常' : '未记录'
  const refused = feeds.some((f) => f.appetite === 'refused')
  const appetitePoor = feeds.some((f) => f.appetite === 'poor')

  return (
    <div className={`room-card risk-${risk.level}`}>
      <div className="row-between">
        <div className="row"><PetAvatar pet={pet} /><div><b>{booking.petName}</b><div className="tiny muted">{booking.profile.breed}</div></div></div>
        <RiskBadge risk={risk} />
      </div>
      <div className="col small" style={{ marginTop: 8, gap: 4 }}>
        <div>🍚 <b>饮食：</b>{feeds.length ? feeds.map((f) => `${f.amount || ''}(${f.appetite === 'good' ? '光盘' : f.appetite === 'normal' ? '一般' : f.appetite === 'poor' ? '偏少' : '拒食'})`).join('、') : '今日未记录'}
          {refused && <Badge className="badge-red">拒食</Badge>}{appetitePoor && !refused && <Badge className="badge-amber">食欲差</Badge>}
        </div>
        <div>💩 <b>排便：</b>{stoolWorst}{stoolWorst === '腹泻' && <Badge className="badge-red">需关注</Badge>}</div>
        <div>💊 <b>喂药：</b>
          {medRows.length === 0 ? '无计划' : medRows.map((m, i) => {
            const cls = m.status === 'done' || m.status === 'made_up' ? '' : 'amber'
            const txt =
              m.status === 'done' ? '✓ 已喂'
              : m.status === 'made_up' ? '✓ 已补服成功'
              : m.status === 'skipped' ? '跳次'
              : m.status === 'missed_pending_review' ? '⚠漏服待店长复核'
              : m.status === 'missed_pending_remedy' ? '⚠漏服待补服'
              : '待喂'
            return (
              <span key={i} className={`chip ${cls}`} title={m.note}>
                {m.time !== m.originalTime && <span style={{ textDecoration: 'line-through', opacity: .6 }}>{m.originalTime}→</span>}
                {m.time} {m.name} {txt}
              </span>
            )
          })}
        </div>
        {pendingMissed.length > 0 && (
          <div className="small" style={{ color: 'var(--red)' }}>
            ⚠ 漏服跟进：{pendingMissed.map((m) => `${m.medName}（${m.status === 'pending_review' ? '待店长复核' : '待补服'}）`).join('；')}
            {pendingMissed[0]?.nextSchedule?.frequencyNote ? ` ｜提醒频率：${pendingMissed[0].nextSchedule.frequencyNote}` : ''}
          </div>
        )}
        {missedList.some((m) => m.status === 'made_up') && (
          <div className="tiny" style={{ color: 'var(--green)' }}>
            ✓ 本班/近期已有漏服补服成功：{missedList.filter((m) => m.status === 'made_up').map((m) => `${m.medName} ${m.madeUpAt?.slice(11, 16)}`).join('；')}
          </div>
        )}
        <div>🐕‍🦺 <b>互动/遛放：</b>{walks.length ? walks.map((w) => `${w.durationMin}分钟`).join('、') : '未记录'}
          {booking.trial && <> · 试住互动最差 {Math.max(0, ...booking.trial.observations.filter((o) => o.dimension === 'interaction').map((o) => o.level)) || '—'} 分</>}
        </div>
        <div>🎬 <b>视频：</b>{videos.length ? `已回传 ${videos.length} 条` : '今日暂无'}</div>
        <div>💬 <b>主人沟通：</b>{notes.length ? notes.map((n) => n.detail).join('；') : '今日无沟通'}
          {notes.length > 0 && <span className="tiny muted">（{notes.map((n) => users.find((u) => u.id === n.recorderId)?.name).join('/')}）</span>}
        </div>
        {abn.length > 0 && <div>🚨 <b>今日异常：</b>{abn.map((a) => a.detail.slice(0, 30)).join('；')}</div>}
        {openInc.length > 0 && <div><Badge className="badge-red">{openInc.length} 起异常未闭环</Badge> 接班后先到「异常协同」查看最新进展</div>}
        {risk.tags.length > 0 && <div>{risk.tags.map((t) => <span key={t} className="chip red">{t}</span>)}</div>}
      </div>
      <div style={{ marginTop: 6 }}><Link className="small" to={`/care?pet=${petId}`}>完整记录 →</Link></div>
    </div>
  )
}

export default function ShiftHandover() {
  const { bookings, shiftNotes, users, currentUser, addShiftNote } = useStore()
  const me = currentUser()!
  const isManager = me.role === 'manager'

  const activePetIds = useMemo(
    () => bookings.filter((b) => b.status === 'boarding' || b.status === 'trial').map((b) => b.petId),
    [bookings],
  )

  const [shift, setShift] = useState<'day' | 'night'>('day')
  const [toCaregiver, setToCaregiver] = useState(users.find((u) => u.role === 'caregiver')?.id ?? '')
  const [content, setContent] = useState('')
  const caregivers = users.filter((u) => u.role === 'caregiver')

  function publish() {
    if (!content.trim()) return alert('请填写交接内容')
    addShiftNote({
      shift, date: new Date().toISOString().slice(0, 10),
      fromManagerId: isManager ? me.id : undefined,
      toCaregiverId: toCaregiver || undefined,
      content: content.trim(), petIds: activePetIds,
    })
    setContent('')
  }

  return (
    <div>
      <h1>班次交接</h1>
      <p className="muted">店长交接时可看到每只宠物的当日风险摘要；下一班护理员据此接手，不用从零翻看所有记录。摘要覆盖喂药、饮食、排便、互动与主人沟通。</p>

      <div className="card">
        <h2>🐾 今日（{fmtDay(new Date().toISOString())}）在住宠物风险摘要</h2>
        {activePetIds.length === 0 ? <EmptyState text="当前无在住宠物" /> : (
          <div className="grid grid-2">
            {/* 高风险在前 */}
            {activePetIds
              .map((pid) => ({ pid, n: openIncidentCount(useStore.getState().incidents, pid), b: bookings.find((b) => b.petId === pid)! }))
              .sort((a, z) => computeRisk(z.b, z.n).score - computeRisk(a.b, a.n).score)
              .map(({ pid }) => <PetDailyDigest key={pid} petId={pid} />)}
          </div>
        )}
      </div>

      <div className="card">
        <h2>🔄 {isManager ? '店长发布班次交接' : '护理员补充交接备注'}</h2>
        <div className="form-grid">
          <Field label="班次">
            <div className="seg">
              <button type="button" className={shift === 'day' ? 'on' : ''} onClick={() => setShift('day')}>白班</button>
              <button type="button" className={shift === 'night' ? 'on' : ''} onClick={() => setShift('night')}>夜班</button>
            </div>
          </Field>
          <Field label="交接给">
            <select value={toCaregiver} onChange={(e) => setToCaregiver(e.target.value)}>
              {caregivers.map((c) => <option key={c.id} value={c.id}>{c.name}（@{c.username}）</option>)}
            </select>
          </Field>
          <Field label="交接要点（高风险宠物注意事项、待办、主人嘱托）" full>
            <textarea style={{ minHeight: 110 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="如：阿狼 20:00 蒙脱石散别漏，喂食放下即离场；团子 21:00 眼膏；豆豆吠叫维度继续观察…" />
          </Field>
        </div>
        <div style={{ marginTop: 10 }}><button onClick={publish}>发布交接</button></div>
      </div>

      <div className="card">
        <h2>📜 历史交接记录</h2>
        {shiftNotes.length === 0 ? <EmptyState text="暂无交接记录" /> : (
          <div className="timeline">
            {shiftNotes.map((n) => (
              <div key={n.id} className="tl-item sev-medium">
                <div className="tl-time">{fmtDate(n.createdAt)} · {n.shift === 'day' ? '白班' : '夜班'}</div>
                <div className="tl-title">
                  {users.find((u) => u.id === n.fromManagerId)?.name ?? '护理员'} → {users.find((u) => u.id === n.toCaregiverId)?.name ?? '下一班'}
                </div>
                <div>{n.content}</div>
                <div className="tiny muted" style={{ marginTop: 4 }}>涉及宠物：{n.petIds.map((pid) => bookings.find((b) => b.petId === pid)?.petName).filter(Boolean).join('、')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
