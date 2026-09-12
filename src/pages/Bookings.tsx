import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { fmtDate, LEVEL_LABEL, roomTypeLabel } from '../lib/risk'
import { Badge, EmptyState, Modal, PetAvatar } from '../components/ui'
import { StatusBadge } from './Dashboard'
import type { Booking } from '../types'

function ProfileDetail({ b }: { b: Booking }) {
  const p = b.profile
  return (
    <div>
      <div className="kv">
        <dt>品种</dt><dd>{p.breed}</dd>
        <dt>年龄</dt><dd>{p.ageYears} 岁 {p.ageMonths} 个月{p.weightKg ? ` · ${p.weightKg} kg` : ''}</dd>
        <dt>绝育</dt><dd>{p.neutered == null ? '未说明' : p.neutered ? '已绝育' : '未绝育'}</dd>
        <dt>攻击性</dt><dd>{LEVEL_LABEL[p.aggression]}{p.aggressionNote ? `（${p.aggressionNote}）` : ''}</dd>
        <dt>分离焦虑</dt><dd>{LEVEL_LABEL[p.separationAnxiety]}</dd>
        <dt>过敏史</dt><dd>{p.allergies || '无'}</dd>
        <dt>饮食习惯</dt><dd>{p.dietHabit}</dd>
        <dt>接送时间</dt><dd>送 {fmtDate(p.dropOffTime)}<br />接 {fmtDate(p.pickUpTime)}{b.extended && <Badge className="badge-amber">已延长</Badge>}</dd>
      </div>
      <div className="divider" />
      <h3>疫苗记录</h3>
      <div className="col">
        {p.vaccines.map((v, i) => (
          <div key={i} className="row-between">
            <span>{v.name}</span>
            {v.done ? <Badge className="badge-green">✓ 有效期至 {v.expiryDate}</Badge> : <Badge className="badge-red">✗ 记录不全</Badge>}
          </div>
        ))}
      </div>
      <div className="divider" />
      <h3>寄养期间用药</h3>
      {p.medications.length === 0 ? <div className="small muted">无</div> : (
        <table>
          <thead><tr><th>药品</th><th>剂量/方式</th><th>时间点</th><th>备注</th></tr></thead>
          <tbody>
            {p.medications.map((m) => (
              <tr key={m.id}><td>{m.name}</td><td>{m.dosage} · {m.route}</td><td>{m.times.join(' / ')}</td><td className="small muted">{m.note ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function Bookings() {
  const { bookings, pets, rooms, currentUser } = useStore()
  const me = currentUser()!
  const [q, setQ] = useSearchParams()
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('active')
  const [keyword, setKeyword] = useState('')

  const list = useMemo(() => {
    let arr = me.role === 'owner' ? bookings.filter((b) => b.ownerId === me.id) : [...bookings]
    if (filter === 'active') arr = arr.filter((b) => b.status !== 'closed')
    if (filter === 'closed') arr = arr.filter((b) => b.status === 'closed')
    if (keyword.trim()) arr = arr.filter((b) => b.petName.includes(keyword) || b.code.includes(keyword))
    return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [bookings, me, filter, keyword])

  const detailId = q.get('detail')
  const detail = bookings.find((b) => b.id === detailId)

  return (
    <div>
      <div className="row-between">
        <h1>订单与宠物档案</h1>
        {(me.role === 'manager' || me.role === 'owner') && <Link className="btn" to="/booking/new">＋ 新建寄养预约</Link>}
      </div>

      <div className="row" style={{ margin: '10px 0 16px' }}>
        <div className="seg">
          <button className={filter === 'active' ? 'on' : ''} onClick={() => setFilter('active')}>进行中</button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>全部</button>
          <button className={filter === 'closed' ? 'on' : ''} onClick={() => setFilter('closed')}>已闭环</button>
        </div>
        <input style={{ width: 220 }} placeholder="搜索宠物名 / 订单号" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>宠物</th><th>订单号</th><th>主人</th><th>状态</th><th>房间</th><th>接送时间</th><th>操作</th></tr></thead>
            <tbody>
              {list.map((b) => {
                const pet = pets.find((p) => p.id === b.petId)
                const room = rooms.find((r) => r.id === b.roomId)
                return (
                  <tr key={b.id}>
                    <td><div className="row"><PetAvatar pet={pet} /><b>{b.petName}</b><span className="tiny muted">{b.profile.breed}</span></div></td>
                    <td className="small nowrap">{b.code}</td>
                    <td className="small">{b.ownerName}</td>
                    <td><StatusBadge s={b.status} /></td>
                    <td className="small">{room ? roomTypeLabel(room.type) + ' · ' + room.name : '—'}</td>
                    <td className="tiny muted nowrap">{fmtDate(b.profile.dropOffTime).slice(5)}<br />～ {fmtDate(b.profile.pickUpTime).slice(5)}</td>
                    <td className="nowrap">
                      <button className="btn-link btn-sm" onClick={() => setQ({ detail: b.id })}>档案</button>
                      {' · '}<Link to={`/care?pet=${b.petId}`}>照护</Link>
                      {b.status === 'closed' && <> · <Link to={`/summary?pet=${b.petId}&booking=${b.id}`}>摘要</Link></>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <EmptyState text="没有符合条件的订单" />}
      </div>

      {detail && (
        <Modal title={`${detail.petName} 的入店档案（${detail.code}）`} onClose={() => setQ({})}>
          <ProfileDetail b={detail} />
          <div className="divider" />
          {detail.flaggedRisk && (
            <>
              <h3>⚠ 下次接单风险提示</h3>
              <div className="summary-box" style={{ background: '#fee2e2', borderColor: '#fecaca' }}>{detail.flaggedRisk}</div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
