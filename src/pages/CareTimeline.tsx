import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore, eventsOfPet, incidentsOfPet, ABNORMAL_LABEL, effectiveMedPlan } from '../store'
import { computeRisk, fmtDate, roomTypeLabel, RISK_LABEL, RISK_STYLE } from '../lib/risk'
import { Badge, EmptyState, Field, Modal, PetAvatar, RiskBadge } from '../components/ui'
import { MissedMedForm, MissedMedList } from '../components/MissedMed'
import { localToStored, todayLocal } from '../lib/time'
import type { AbnormalKind, CareEvent, CareEventType } from '../types'

const TYPE_META: Record<CareEventType, { icon: string; label: string; cls: string }> = {
  feed: { icon: '🍚', label: '喂食', cls: 'badge-green' },
  medicate: { icon: '💊', label: '喂药', cls: 'badge-purple' },
  walk: { icon: '🦮', label: '遛狗', cls: 'badge-blue' },
  clean: { icon: '🧹', label: '清洁', cls: 'badge-gray' },
  video: { icon: '🎬', label: '视频回传', cls: 'badge-amber' },
  abnormal: { icon: '🚨', label: '异常', cls: 'badge-red' },
  note: { icon: '💬', label: '主人沟通', cls: 'badge-blue' },
}

export default function CareTimeline() {
  const { bookings, pets, rooms, users, incidents, events, currentUser, addCareEvent, openIncident } = useStore()
  const me = currentUser()!
  const canWrite = me.role === 'manager' || me.role === 'caregiver'
  const [q, setQ] = useSearchParams()

  // 可见宠物：主人只见自家；医院只见异常协同单涉及的；其余全部
  const visibleBookings = useMemo(() => {
    if (me.role === 'owner') return bookings.filter((b) => b.ownerId === me.id)
    if (me.role === 'hospital') {
      const petIds = new Set(incidents.filter((i) => i.participants.includes('hospital')).map((i) => i.petId))
      return bookings.filter((b) => petIds.has(b.petId))
    }
    return bookings
  }, [bookings, incidents, me])

  const activePetId = q.get('pet') ?? visibleBookings[0]?.petId
  const booking = visibleBookings.filter((b) => b.petId === activePetId).sort((a, b2) => (a.createdAt < b2.createdAt ? 1 : -1))[0]
  const pet = pets.find((p) => p.id === activePetId)
  const petEvents = eventsOfPet(events, activePetId ?? '')
  const petIncidents = incidentsOfPet(incidents, activePetId ?? '')
  const risk = booking ? computeRisk(booking, petIncidents.filter((i) => i.status !== 'resolved').length) : null

  const [showAdd, setShowAdd] = useState(false)
  const [showMissed, setShowMissed] = useState(false)
  const [type, setType] = useState<CareEventType>('feed')
  const [detail, setDetail] = useState('')
  const [at, setAt] = useState(() => { const d = new Date(); d.setSeconds(0, 0); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` })
  // feed
  const [food, setFood] = useState(''); const [amount, setAmount] = useState(''); const [appetite, setAppetite] = useState<'good' | 'normal' | 'poor' | 'refused'>('normal'); const [stool, setStool] = useState<'normal' | 'soft' | 'diarrhea' | 'none'>('normal')
  // walk
  const [durationMin, setDurationMin] = useState(15)
  // med
  const [medId, setMedId] = useState(''); const [medicated, setMedicated] = useState(true)
  // abnormal
  const [abKind, setAbKind] = useState<AbnormalKind>('vomit')
  const [openInc, setOpenInc] = useState(true)

  function reset() {
    setDetail(''); setFood(''); setAmount(''); setAppetite('normal'); setStool('normal')
    setDurationMin(15); setMedId(''); setMedicated(true); setAbKind('vomit'); setOpenInc(true)
  }

  function submit() {
    if (!booking) return
    if (!detail.trim()) return alert('请填写记录详情')
    let incidentId: string | undefined
    if (type === 'abnormal' && openInc) {
      incidentId = openIncident({
        petId: booking.petId,
        kind: abKind,
        title: `${booking.petName} ${ABNORMAL_LABEL[abKind]}：${detail.slice(0, 24)}`,
        openedById: me.id,
        severity: abKind === 'bite_staff' ? 'high' : ['vomit', 'diarrhea', 'refuse_food'].includes(abKind) ? 'medium' : 'low',
        participants: abKind === 'extend'
          ? ['manager', 'owner', 'caregiver']
          : abKind === 'incomplete_vaccine'
            ? ['manager', 'owner']
            : ['manager', 'caregiver', 'owner', 'hospital'],
      })
    }
    addCareEvent({
      petId: booking.petId,
      at: localToStored(at),
      type, detail: detail.trim(), recorderId: me.id,
      food: type === 'feed' ? food : undefined,
      amount: type === 'feed' ? amount : undefined,
      appetite: type === 'feed' ? appetite : undefined,
      stool: type === 'feed' ? stool : undefined,
      durationMin: type === 'walk' ? durationMin : undefined,
      medicationId: type === 'medicate' ? medId || undefined : undefined,
      medicated: type === 'medicate' ? medicated : undefined,
      abnormalKind: type === 'abnormal' ? abKind : undefined,
      incidentId,
    })
    setShowAdd(false); reset()
  }

  const todayRows = booking ? effectiveMedPlan(booking, events, todayLocal()) : []

  return (
    <div>
      <h1>照护记录时间线</h1>
      <p className="muted">按时间记录喂食、喂药、遛狗、清洁、视频回传与异常行为；护理员交接可在此看全喂药、饮食、排便、互动和主人沟通记录。</p>

      <div className="row" style={{ margin: '10px 0 16px' }}>
        <select style={{ width: 300 }} value={activePetId ?? ''} onChange={(e) => setQ({ pet: e.target.value })}>
          {visibleBookings.map((b) => <option key={b.id} value={b.petId}>{b.petName}（{b.code}）{b.ownerName ? ` · ${b.ownerName}` : ''}</option>)}
        </select>
        {canWrite && booking && booking.status === 'boarding' && (
          <>
            <button className="btn-sm" onClick={() => setShowAdd(true)}>＋ 新增照护记录</button>
            {booking.profile.medications.length > 0 && (
              <button className="btn-sm btn-danger" onClick={() => setShowMissed(true)}>⚠ 登记喂药漏服/吐药</button>
            )}
          </>
        )}
      </div>

      {!booking ? <EmptyState text="暂无可查看的宠物" /> : (
        <div className="grid grid-2" style={{ gridTemplateColumns: '320px 1fr' }}>
          {/* 左栏：宠物照护卡片 */}
          <div>
            <div className="card">
              <div className="row-between">
                <div className="row"><PetAvatar pet={pet} size="lg" /><div><b style={{ fontSize: 16 }}>{booking.petName}</b>
                  <div className="small muted">{booking.profile.breed}</div></div></div>
                {risk && <RiskBadge risk={risk} />}
              </div>
              <div className="divider" />
              <div className="kv">
                <dt>房间</dt><dd>{rooms.find((r) => r.id === booking.roomId)?.name ?? '未分房'}（{booking.roomId ? roomTypeLabel(rooms.find((r) => r.id === booking.roomId)!.type) : '—'}）</dd>
                <dt>主人</dt><dd>{booking.ownerName}</dd>
                <dt>饮食</dt><dd>{booking.profile.dietHabit}</dd>
                <dt>过敏</dt><dd>{booking.profile.allergies}</dd>
              </div>
              <div className="divider" />
              <h3>💊 今日用药提醒（含漏服调整）</h3>
              {todayRows.length === 0 ? <div className="small muted">无</div> : todayRows.map((r, i) => {
                const adjusted = r.time !== r.originalTime
                const missed = r.status.startsWith('missed')
                return (
                  <div key={i} className={`room-card ${missed ? 'risk-medium' : 'risk-low'}`}>
                    <div className="row-between">
                      <b>{r.name}</b>
                      <Badge className={
                        r.status === 'done' || r.status === 'made_up' ? 'badge-green'
                        : r.status === 'skipped' ? 'badge-gray'
                        : missed ? 'badge-red' : 'badge-amber'
                      }>
                        {r.status === 'done' ? '已喂' : r.status === 'made_up' ? '已补服' : r.status === 'skipped' ? '跳次' : r.status === 'missed_pending_review' ? '漏服·待复核' : r.status === 'missed_pending_remedy' ? '漏服·待补' : '待喂'}
                      </Badge>
                    </div>
                    <div className="small">
                      提醒 <b style={adjusted ? { color: 'var(--red)' } : undefined}>{r.time}</b>
                      {adjusted && <> <span className="tiny muted" style={{ textDecoration: 'line-through' }}>{r.originalTime}</span>（漏服调整）</>}
                      ｜{r.dosage}
                    </div>
                    {r.note && <div className="tiny muted">下一班：{r.note}</div>}
                  </div>
                )
              })}
            </div>

            <div className="card">
              <h3>🚨 关联异常单（{petIncidents.length}）</h3>
              {petIncidents.length === 0 ? <div className="small muted">无异常记录</div> : petIncidents.map((inc) => (
                <div key={inc.id} className="room-card" style={{ borderLeft: `4px solid ${inc.status === 'resolved' ? '#059669' : inc.severity === 'high' ? '#dc2626' : '#d97706'}` }}>
                  <div className="row-between"><span className="small"><b>{ABNORMAL_LABEL[inc.kind]}</b></span>
                    <Badge className={inc.status === 'resolved' ? 'badge-green' : inc.severity === 'high' ? 'badge-red' : 'badge-amber'}>
                      {inc.status === 'resolved' ? '已闭环' : inc.status === 'handling' ? '处理中' : '待处理'}
                    </Badge></div>
                  <div className="tiny muted">{inc.title}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 右栏：时间线 */}
          <div className="card">
            <h2>📅 完整照护时间线（{petEvents.length} 条）</h2>
            {petEvents.length === 0 ? <EmptyState text="还没有记录，护理员可新增第一条照护记录" /> : (
              <div className="timeline">
                {petEvents.map((e: CareEvent) => {
                  const meta = TYPE_META[e.type]
                  const rec = users.find((u) => u.id === e.recorderId)
                  return (
                    <div key={e.id} className={`tl-item ${e.type === 'abnormal' ? (petIncidents.find((i) => i.id === e.incidentId)?.severity ?? 'medium') === 'high' ? 'sev-high' : 'sev-medium' : ''}`}>
                      <div className="tl-time">{fmtDate(e.at)} · {rec?.name ?? e.recorderId}</div>
                      <div className="tl-title">
                        <span className="tl-icon">{meta.icon}</span>{meta.label}
                        <Badge className={meta.cls}>{e.type === 'abnormal' && e.abnormalKind ? ABNORMAL_LABEL[e.abnormalKind] : meta.label}</Badge>
                      </div>
                      <div>{e.detail}</div>
                      <div className="small muted" style={{ marginTop: 2 }}>
                        {e.type === 'feed' && <>食量 {e.amount || '—'} · 食欲 {({ good: '好', normal: '一般', poor: '差', refused: '拒食' } as const)[e.appetite ?? 'normal']} · 排便 {({ normal: '正常', soft: '偏软', diarrhea: '腹泻', none: '无' } as const)[e.stool ?? 'none']}</>}
                        {e.type === 'walk' && <>遛放 {e.durationMin} 分钟</>}
                        {e.type === 'medicate' && <>{e.medicated ? '✓ 已成功喂入' : '✗ 未喂入/拒服'} · {booking.profile.medications.find((m) => m.id === e.medicationId)?.name}</>}
                        {e.type === 'video' && <a href={e.videoUrl || '#'} onClick={(ev) => ev.preventDefault()}>▶ 查看回传视频（演示占位）</a>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {booking && <MissedMedList booking={booking} />}

      {showMissed && booking && (
        <Modal title={`登记喂药漏服/吐药 · ${booking.petName}`} onClose={() => setShowMissed(false)}>
          <MissedMedForm booking={booking} onDone={() => setShowMissed(false)} />
        </Modal>
      )}

      {showAdd && booking && (
        <Modal title={`新增照护记录 · ${booking.petName}`} onClose={() => setShowAdd(false)}
          footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>取消</button><button onClick={submit}>提交记录</button></>}>
          <div className="col">
            <Field label="记录类型">
              <div className="seg" style={{ flexWrap: 'wrap' }}>
                {(Object.keys(TYPE_META) as CareEventType[]).map((t) => (
                  <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>{TYPE_META[t].icon} {TYPE_META[t].label}</button>
                ))}
              </div>
            </Field>
            <Field label="时间"><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>

            {type === 'feed' && (
              <div className="form-grid">
                <Field label="食物"><input value={food} onChange={(e) => setFood(e.target.value)} placeholder="如 渴望鸡肉粮" /></Field>
                <Field label="份量"><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="如 80g" /></Field>
                <Field label="食欲">
                  <select value={appetite} onChange={(e) => setAppetite(e.target.value as typeof appetite)}>
                    <option value="good">好（光盘）</option><option value="normal">一般</option><option value="poor">差（吃得少）</option><option value="refused">拒食</option>
                  </select>
                </Field>
                <Field label="排便">
                  <select value={stool} onChange={(e) => setStool(e.target.value as typeof stool)}>
                    <option value="normal">正常</option><option value="soft">偏软</option><option value="diarrhea">腹泻</option><option value="none">未排便</option>
                  </select>
                </Field>
              </div>
            )}
            {type === 'walk' && <Field label="遛放时长（分钟）"><input type="number" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} /></Field>}
            {type === 'medicate' && (
              <div className="form-grid">
                <Field label="药品（来自用药计划）" full>
                  <select value={medId} onChange={(e) => setMedId(e.target.value)}>
                    <option value="">— 选择药品 —</option>
                    {booking.profile.medications.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.dosage} · {m.times.join('/')}</option>)}
                  </select>
                </Field>
                <Field label="是否成功喂入">
                  <select value={String(medicated)} onChange={(e) => setMedicated(e.target.value === 'true')}>
                    <option value="true">✓ 已喂入</option><option value="false">✗ 拒服/未喂入（需上报）</option>
                  </select>
                </Field>
              </div>
            )}
            {type === 'abnormal' && (
              <div className="form-grid">
                <Field label="异常类型">
                  <select value={abKind} onChange={(e) => setAbKind(e.target.value as AbnormalKind)}>
                    {(Object.keys(ABNORMAL_LABEL) as AbnormalKind[]).map((k) => <option key={k} value={k}>{ABNORMAL_LABEL[k]}</option>)}
                  </select>
                </Field>
                <Field label="同时开启异常协同单">
                  <label className="checkbox-row"><input type="checkbox" checked={openInc} onChange={(e) => setOpenInc(e.target.checked)} />通知店长/主人/医院协同处理</label>
                </Field>
                <div className="full small muted">协同方：{abKind === 'extend' ? '店长 + 主人 + 护理员' : abKind === 'incomplete_vaccine' ? '店长 + 主人' : '店长 + 护理员 + 主人 + 合作医院'}</div>
              </div>
            )}
            <Field label="详细情况" full>
              <textarea style={{ minHeight: 90 }} value={detail} onChange={(e) => setDetail(e.target.value)}
                placeholder={type === 'note' ? '与主人沟通的内容（主人留言/电话/视频反馈）…' : '具体表现、处置、宠物精神状态…'} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
