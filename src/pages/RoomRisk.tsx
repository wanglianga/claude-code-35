import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, openIncidentCount } from '../store'
import { computeRisk, roomTypeLabel } from '../lib/risk'
import { Badge, EmptyState, PetAvatar, RiskBadge } from '../components/ui'
import type { Booking, Room } from '../types'

export default function RoomRisk() {
  const { bookings, rooms, incidents, pets } = useStore()
  const [view, setView] = useState<'room' | 'pet'>('room')

  const active = useMemo(
    () => bookings.filter((b) => b.status === 'boarding' || b.status === 'trial'),
    [bookings],
  )
  const enriched = active.map((b) => ({ b, risk: computeRisk(b, openIncidentCount(incidents, b.petId)) }))

  const byRoom = (type: Room['type']) => {
    const rms = rooms.filter((r) => r.type === type)
    return rms.map((r) => ({
      room: r,
      guests: enriched.filter((x) => (x.b.roomId ?? x.b.trial?.roomId) === r.id),
    }))
  }

  return (
    <div>
      <div className="row-between">
        <h1>房间与宠物风险看板</h1>
        <div className="seg">
          <button className={view === 'room' ? 'on' : ''} onClick={() => setView('room')}>🏨 按房间</button>
          <button className={view === 'pet' ? 'on' : ''} onClick={() => setView('pet')}>🐶 按宠物风险</button>
        </div>
      </div>
      <p className="muted">门店同时按宠物和房间查看风险：高风险宠物以红色边框标出，隔离房/单独照护间与普通房物理分区。</p>

      {view === 'room' ? (
        <div className="room-board">
          {(['standard', 'isolation', 'solo'] as const).map((type) => (
            <div key={type} className={`room-col ${type}`}>
              <h3>{roomTypeLabel(type)}{type === 'standard' ? ' · 可共处' : type === 'isolation' ? ' · 隔离观察' : ' · 1v1 专人'}</h3>
              {byRoom(type).map(({ room, guests }) => (
                <div key={room.id}>
                  <div className="small muted" style={{ margin: '8px 2px 4px' }}>
                    {room.name}（在住 {guests.length}/{room.capacity}）
                  </div>
                  {guests.length === 0 && <div className="room-card tiny muted">空房</div>}
                  {guests.map(({ b, risk }) => {
                    const pet = pets.find((p) => p.id === b.petId)
                    return (
                      <div key={b.id} className={`room-card risk-${risk.level}`}>
                        <div className="row-between">
                          <div className="row"><PetAvatar pet={pet} /><b>{b.petName}</b></div>
                          <RiskBadge risk={risk} />
                        </div>
                        <div className="tiny muted" style={{ margin: '4px 0' }}>{b.profile.breed} · {b.ownerName}</div>
                        <div>{risk.tags.map((t) => <span key={t} className={`chip ${risk.level === 'high' ? 'red' : 'amber'}`}>{t}</span>)}</div>
                        {b.trial?.conclusion && <div className="tiny muted" style={{ marginTop: 4 }}>📋 {b.trial.conclusion.slice(0, 60)}…</div>}
                        <div style={{ marginTop: 6 }}><Link className="small" to={`/care?pet=${b.petId}`}>照护记录 →</Link></div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>风险</th><th>宠物</th><th>当前房间</th><th>风险标签</th><th>试住结论</th><th>未闭环异常</th></tr></thead>
              <tbody>
                {enriched.sort((a, z) => z.risk.score - a.risk.score).map(({ b, risk }) => {
                  const pet = pets.find((p) => p.id === b.petId)
                  const room = rooms.find((r) => r.id === (b.roomId ?? b.trial?.roomId))
                  const openN = openIncidentCount(incidents, b.petId)
                  return (
                    <tr key={b.id}>
                      <td><RiskBadge risk={risk} /></td>
                      <td><div className="row"><PetAvatar pet={pet} /><div><b>{b.petName}</b><div className="tiny muted">{b.profile.breed}</div></div></div></td>
                      <td className="small">{room ? `${roomTypeLabel(room.type)} · ${room.name}` : '未分房'}</td>
                      <td>{risk.tags.length ? risk.tags.map((t) => <span key={t} className={`chip ${risk.level === 'high' ? 'red' : 'amber'}`}>{t}</span>) : <span className="tiny muted">无显著风险因子</span>}</td>
                      <td className="small muted" style={{ maxWidth: 260 }}>{b.trial?.conclusion ?? '试住未完成'}</td>
                      <td>{openN > 0 ? <Badge className="badge-red">{openN} 起</Badge> : <Badge className="badge-green">0</Badge>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {enriched.length === 0 && <EmptyState text="当前没有在住/试住宠物" />}
        </div>
      )}

      <div className="card">
        <h2>⚠ 带「下次接单风险提示」的历史宠物</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>异常宠物在历史订单闭环后被标记，下次该宠物预约时自动提示，辅助接单决策。</div>
        {bookings.filter((b) => b.flaggedRisk).map((b: Booking) => (
          <div key={b.id} className="room-card risk-high">
            <div className="row-between"><b>{b.petName}（历史订单 {b.code}）</b><Badge className="badge-red">下次接单必读</Badge></div>
            <div className="small" style={{ marginTop: 4 }}>{b.flaggedRisk}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
