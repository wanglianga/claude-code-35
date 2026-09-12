import { Link } from 'react-router-dom'
import { useStore, eventsOfPet, openIncidentCount, effectiveMedPlan, allMissedMeds } from '../store'
import { computeRisk, fmtDate, RESULT_LABEL, RESULT_STYLE, boardingDays, roomTypeLabel } from '../lib/risk'
import { Badge, EmptyState, PetAvatar, RiskBadge } from '../components/ui'
import type { Booking, CareEvent } from '../types'

const STATUS_BADGE: Record<Booking['status'], { cls: string; label: string }> = {
  intake: { cls: 'badge-gray', label: '待安排试住' },
  trial: { cls: 'badge-blue', label: '试住中' },
  boarding: { cls: 'badge-green', label: '寄养中' },
  checkout: { cls: 'badge-amber', label: '待接回' },
  closed: { cls: 'badge-gray', label: '已闭环' },
}

export function StatusBadge({ s }: { s: Booking['status'] }) {
  const x = STATUS_BADGE[s]
  return <Badge className={x.cls}>{x.label}</Badge>
}

// 今日喂药计划：套用漏服补救后的调整时间/补服状态
export function todayMedPlan(bookings: Booking[], events: CareEvent[]) {
  const today = new Date().toISOString().slice(0, 10)
  return bookings
    .filter((b) => b.status === 'boarding')
    .flatMap((b) => effectiveMedPlan(b, events, today).map((row) => ({ booking: b, ...row })))
    .sort((a, b2) => (a.time < b2.time ? -1 : 1))
}

const MED_ROW_BADGE: Record<string, { cls: string; text: (r: { time: string; originalTime: string; note?: string }) => string }> = {
  done: { cls: 'badge-green', text: () => '✓ 已喂' },
  pending: { cls: 'badge-amber', text: () => '待喂' },
  made_up: { cls: 'badge-green', text: () => '✓ 已补服成功' },
  skipped: { cls: 'badge-gray', text: () => '本次跳次' },
  missed_pending_review: { cls: 'badge-red', text: () => '⚠ 漏服·待店长复核' },
  missed_pending_remedy: { cls: 'badge-red', text: () => '⚠ 漏服·待补服' },
}

export default function Dashboard() {
  const { bookings, incidents, events, rooms, shiftNotes, currentUser, pets } = useStore()
  const me = currentUser()!

  // ---------- 主人视角 ----------
  if (me.role === 'owner') {
    const mine = bookings.filter((b) => b.ownerId === me.id)
    return (
      <div>
        <h1>你好，{me.name} 🐾</h1>
        <p className="muted">这里是你家宠物的寄养动态：试住结论、每日喂食喂药与视频、异常处理进展。</p>
        <div className="grid grid-2">
          {mine.map((b) => {
            const pet = pets.find((p) => p.id === b.petId)
            const evs = eventsOfPet(events, b.petId)
            const videos = evs.filter((e) => e.type === 'video')
            const incs = incidents.filter((i) => i.petId === b.petId && i.status !== 'resolved')
            const missed = (b.missedMedications ?? []).filter((m) => m.ownerInstruction && m.status !== 'skipped')
            return (
              <div className="card" key={b.id}>
                <div className="row-between">
                  <div className="row">
                    <PetAvatar pet={pet} size="lg" />
                    <div>
                      <b style={{ fontSize: 16 }}>{b.petName}</b>
                      <div className="small muted">订单 {b.code} · {b.profile.breed}</div>
                    </div>
                  </div>
                  <StatusBadge s={b.status} />
                </div>
                <div className="divider" />
                {b.trial?.result ? (
                  <div className="row"><span className="muted small">试住结论：</span><Badge className={RESULT_STYLE[b.trial.result]}>{RESULT_LABEL[b.trial.result]}</Badge></div>
                ) : (
                  <div className="small muted">试住尚未完成，门店将在安排试住后给出房态结论。</div>
                )}
                <div className="small muted" style={{ margin: '6px 0' }}>
                  预约：{fmtDate(b.profile.dropOffTime)} 送 ～ {fmtDate(b.profile.pickUpTime)} 接{b.extended ? '（已延长）' : ''}
                </div>
                <div className="col small">
                  <div>🍚 最新进食：{evs.find((e) => e.type === 'feed')?.detail ?? '—'}</div>
                  <div>💊 最新喂药：{evs.find((e) => e.type === 'medicate') ? `${fmtDate(evs.find((e) => e.type === 'medicate')!.at)} ${evs.find((e) => e.type === 'medicate')!.detail}` : '无用药'}</div>
                  <div>🎬 视频回传：{videos.length ? `${videos.length} 条，最新 ${fmtDate(videos[0].at)}` : '暂无'}</div>
                  {incs.length > 0 && <div className="badge badge-red" style={{ alignSelf: 'flex-start' }}>🚨 {incs.length} 起异常处理中，请到「异常协同」确认</div>}
                  {missed.map((m) => (
                    <div key={m.id} className="summary-box" style={{ marginTop: 4, background: m.severity === 'serious' ? '#fee2e2' : '#fffbeb', borderColor: m.severity === 'serious' ? '#fecaca' : '#fde68a' }}>
                      💊 <b>喂药说明更新：</b>{m.ownerInstruction}
                      <div className="tiny muted" style={{ marginTop: 2 }}>
                        {m.status === 'made_up' ? `已于 ${fmtDate(m.madeUpAt)} 补服成功` : '补救方案执行中'}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="divider" />
                <div className="row">
                  <Link className="btn btn-secondary btn-sm" to={`/care?pet=${b.petId}`}>查看完整照护记录</Link>
                  {b.status === 'closed' && <Link className="btn btn-sm" to={`/summary?pet=${b.petId}`}>查看护理交接摘要</Link>}
                </div>
              </div>
            )
          })}
          {mine.length === 0 && <EmptyState text="你还没有寄养订单，去「预约登记」为宠物建档吧" />}
        </div>
      </div>
    )
  }

  // ---------- 医院视角 ----------
  if (me.role === 'hospital') {
    const invited = incidents.filter((i) => i.participants.includes('hospital'))
    return (
      <div>
        <h1>{me.hospital} · 医疗协同看板</h1>
        <p className="muted">以下为门店邀请贵院协同的宠物异常单，可在「异常协同」中给出处置意见。</p>
        <div className="grid grid-2">
          {invited.map((inc) => {
            const b = bookings.find((x) => x.petId === inc.petId)
            return (
              <div className="card" key={inc.id}>
                <div className="row-between">
                  <b>{b?.petName ?? inc.petId}</b>
                  <Badge className={inc.status === 'resolved' ? 'badge-green' : inc.severity === 'high' ? 'badge-red' : 'badge-amber'}>
                    {inc.status === 'resolved' ? '已闭环' : inc.status === 'handling' ? '处理中' : '待处理'}
                  </Badge>
                </div>
                <div style={{ margin: '6px 0' }}>{inc.title}</div>
                <div className="small muted">过敏史：{b?.profile.allergies} ｜ 用药：{b?.profile.medications.map((m) => m.name).join('、') || '无'}</div>
                {inc.hospitalAdvice && <div className="summary-box" style={{ marginTop: 8 }}>院方意见：{inc.hospitalAdvice}</div>}
                <div style={{ marginTop: 8 }}><Link className="btn btn-sm" to={`/incidents?id=${inc.id}`}>进入协同处理</Link></div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------- 店长 / 护理员视角 ----------
  const active = bookings.filter((b) => b.status !== 'closed')
  const boarding = active.filter((b) => b.status === 'boarding')
  const inTrial = active.filter((b) => b.status === 'trial' || b.status === 'intake')
  const openIncs = incidents.filter((i) => i.status !== 'resolved')
  const riskList = active
    .map((b) => ({ b, risk: computeRisk(b, openIncidentCount(incidents, b.petId)) }))
    .sort((x, y) => y.risk.score - x.risk.score)
  const high = riskList.filter((x) => x.risk.level === 'high')
  const medPlan = todayMedPlan(bookings, events)
  const pendingReviewCount = allMissedMeds(bookings).filter((m) => m.status === 'pending_review').length
  const pendingReviewPet = bookings.find((b) => (b.missedMedications ?? []).some((m) => m.status === 'pending_review'))?.petId
  const latestShift = shiftNotes[0]

  return (
    <div>
      <h1>{me.role === 'manager' ? '店长总览' : '护理工作台'} · 2026-09-12</h1>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="stat green"><div className="num">{boarding.length}</div><div className="lbl">在住宠物</div></div>
        <div className="stat blue"><div className="num">{inTrial.length}</div><div className="lbl">待试住 / 试住中</div></div>
        <div className="stat red"><div className="num">{openIncs.length}</div><div className="lbl">未闭环异常单</div></div>
        <div className="stat amber"><div className="num">{high.length}</div><div className="lbl">高风险宠物</div></div>
      </div>

      {latestShift && (
        <div className="hero-note">
          🔄 <b>最新班次交接（{latestShift.shift === 'day' ? '白班' : '夜班'} {latestShift.date}）：</b>
          {latestShift.content}
          <div style={{ marginTop: 6 }}><Link to="/handovers">查看全部交接 →</Link></div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h2>🚨 当日风险摘要（按宠物）</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>宠物</th><th>状态/房态</th><th>风险</th><th>寄养</th></tr></thead>
              <tbody>
                {riskList.map(({ b, risk }) => {
                  const pet = pets.find((p) => p.id === b.petId)
                  const room = rooms.find((r) => r.id === (b.roomId ?? b.trial?.roomId))
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="row">
                          <PetAvatar pet={pet} />
                          <div><b>{b.petName}</b><div className="tiny muted">{b.profile.breed}</div>
                            {risk.tags.slice(0, 3).map((t) => <span key={t} className={`chip ${risk.level === 'high' ? 'red' : 'amber'}`}>{t}</span>)}
                          </div>
                        </div>
                      </td>
                      <td className="small"><StatusBadge s={b.status} /><div className="tiny muted" style={{ marginTop: 4 }}>{room ? roomTypeLabel(room.type) : '未分房'}</div></td>
                      <td><RiskBadge risk={risk} /></td>
                      <td className="small nowrap">{boardingDays(b)} 天<br /><Link to={`/care?pet=${b.petId}`}>照护记录</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <h2>💊 今日喂药执行（{medPlan.filter((m) => m.status === 'done' || m.status === 'made_up').length}/{medPlan.length}）</h2>
            {medPlan.length === 0 ? <EmptyState text="今日无用药计划" /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>提醒时间</th><th>宠物/药品</th><th>剂量</th><th>状态</th></tr></thead>
                <tbody>
                  {medPlan.map((m, i) => {
                    const badge = MED_ROW_BADGE[m.status]
                    const adjusted = m.time !== m.originalTime
                    return (
                      <tr key={i} style={m.status.startsWith('missed') ? { background: '#fff7ed' } : undefined}>
                        <td className="nowrap">
                          {adjusted && <span className="tiny muted" style={{ textDecoration: 'line-through' }}>{m.originalTime} </span>}
                          <b style={adjusted ? { color: 'var(--red)' } : undefined}>{m.time}</b>
                          {adjusted && <div className="tiny muted">漏服补救调整</div>}
                        </td>
                        <td><b>{m.booking.petName}</b><div className="tiny muted">{m.name}{m.note && m.status.startsWith('missed') ? `｜${m.note.slice(0, 18)}` : ''}</div></td>
                        <td className="small">{m.dosage}</td>
                        <td><Badge className={badge.cls}>{badge.text(m)}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
            {pendingReviewCount > 0 && (
              <div className="hero-note" style={{ marginTop: 10, marginBottom: 0 }}>
                有 <b>{pendingReviewCount}</b> 起严重漏服待店长复核，<Link to={`/care?pet=${pendingReviewPet ?? ''}`}>前往照护记录处理 →</Link>
              </div>
            )}
          </div>

          <div className="card">
            <h2>🚨 未闭环异常</h2>
            {openIncs.length === 0 ? <EmptyState text="所有异常均已闭环" /> : openIncs.map((inc) => (
              <div className="room-card" key={inc.id} style={{ marginBottom: 8 }}>
                <div className="row-between">
                  <b>{bookings.find((b) => b.petId === inc.petId)?.petName} · {inc.title}</b>
                  <Badge className={inc.severity === 'high' ? 'badge-red' : 'badge-amber'}>{inc.severity === 'high' ? '高严重度' : '中低'}</Badge>
                </div>
                <div className="small muted" style={{ margin: '4px 0' }}>
                  {inc.participants.map((r) => ({ manager: '店长', caregiver: '护理员', owner: '主人', hospital: '医院' }[r])).join(' / ')} 协同 · {fmtDate(inc.openedAt)}
                </div>
                <Link className="btn btn-sm" to={`/incidents?id=${inc.id}`}>处理</Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
