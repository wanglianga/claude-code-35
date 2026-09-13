import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore, ABNORMAL_LABEL, ROLE_LABEL } from '../store'
import { fmtDate } from '../lib/risk'
import { localToStored } from '../lib/time'
import { Badge, EmptyState, Field, PetAvatar } from '../components/ui'
import type { Incident } from '../types'

const ROLE_BADGE: Record<string, string> = {
  manager: 'badge-amber',
  caregiver: 'badge-blue',
  owner: 'badge-green',
  hospital: 'badge-red',
}

function IncidentCard({ inc }: { inc: Incident }) {
  const { bookings, pets, users, currentUser, addIncidentAction, resolveIncident, extendBooking } = useStore()
  const me = currentUser()!
  const booking = bookings.find((b) => b.petId === inc.petId)
  const pet = pets.find((p) => p.id === inc.petId)
  const [text, setText] = useState('')
  const [advice, setAdvice] = useState(inc.hospitalAdvice ?? '')
  const [resolution, setResolution] = useState(inc.resolution ?? '')
  const [extendTo, setExtendTo] = useState(inc.extendTo ? inc.extendTo.slice(0, 16) : '2026-09-18T18:00')
  const canAct = inc.participants.includes(me.role)
  const actorName = (id: string) => users.find((u) => u.id === id)?.name ?? id

  function post() {
    if (!text.trim()) return
    addIncidentAction(inc.id, text.trim())
    setText('')
  }

  return (
    <div className="card" style={{ borderLeft: `4px solid ${inc.severity === 'high' ? 'var(--red)' : inc.severity === 'medium' ? 'var(--amber)' : 'var(--blue)'}` }}>
      <div className="row-between">
        <div className="row">
          <PetAvatar pet={pet} />
          <div>
            <b>{inc.title}</b>
            <div className="tiny muted">订单 {booking?.code} · 开单 {fmtDate(inc.openedAt)} · 开单人 {actorName(inc.openedById)}</div>
          </div>
        </div>
        <div className="row">
          {inc.participants.map((r) => <Badge key={r} className={ROLE_BADGE[r]}>{ROLE_LABEL[r]}</Badge>)}
          <Badge className={inc.status === 'resolved' ? 'badge-green' : inc.severity === 'high' ? 'badge-red' : 'badge-amber'}>
            {inc.status === 'resolved' ? '✓ 已闭环' : inc.status === 'handling' ? '处理中' : '待处理'}
          </Badge>
        </div>
      </div>

      {/* 咬伤员工信息 */}
      {inc.kind === 'bite_staff' && inc.staffInjured && (
        <div className="summary-box" style={{ marginTop: 10, background: '#fee2e2', borderColor: '#fecaca' }}>
          ⚠ 员工受伤：{inc.staffInjured}
        </div>
      )}

      {/* 医院意见 */}
      {inc.hospitalAdvice && (
        <div className="summary-box" style={{ marginTop: 10 }}>🏥 院方医疗意见：{inc.hospitalAdvice}</div>
      )}

      {/* 延长寄养 */}
      {inc.kind === 'extend' && (
        <div className="row" style={{ marginTop: 10 }}>
          <Badge className="badge-purple">新接回时间：{fmtDate(inc.extendTo)}</Badge>
          <Badge className={inc.ownerConfirmed ? 'badge-green' : 'badge-amber'}>{inc.ownerConfirmed ? '主人已确认' : '待主人确认'}</Badge>
        </div>
      )}

      {/* 处理动作时间线 —— 围绕同一只宠物，四方留痕 */}
      <div className="divider" />
      <h3>协同处理记录（{inc.actions.length}）</h3>
      <div className="timeline">
        {inc.actions.map((a) => (
          <div key={a.id} className={`tl-item ${inc.severity === 'high' ? 'sev-high' : 'sev-medium'}`}>
            <div className="tl-time">{fmtDate(a.at)}</div>
            <div className="tl-title"><Badge className={ROLE_BADGE[a.actorRole]}>{ROLE_LABEL[a.actorRole]}</Badge> {actorName(a.actorId)}</div>
            <div>{a.action}</div>
          </div>
        ))}
      </div>

      {inc.resolution && <div className="summary-box" style={{ marginTop: 8 }}>闭环说明：{inc.resolution}（{fmtDate(inc.resolvedAt)}）</div>}

      {inc.status !== 'resolved' && (
        <div className="divider" />
      )}

      {/* 角色化操作区 */}
      {inc.status !== 'resolved' && canAct && (
        <div className="col">
          {/* 医院：医疗意见 */}
          {me.role === 'hospital' && (
            <>
              <Field label="🏥 院方处置意见（将同步给门店与主人）">
                <textarea value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="诊断/处置建议/是否需要送院/用药禁忌…" />
              </Field>
              <div>
                <button onClick={() => { if (!advice.trim()) return alert('请填写医疗意见'); addIncidentAction(inc.id, `【医疗意见】${advice.trim()}`); useStore.setState({ incidents: useStore.getState().incidents.map((x) => x.id === inc.id ? { ...x, hospitalAdvice: advice.trim() } : x) }) }}>提交医疗意见</button>
              </div>
            </>
          )}

          {/* 主人：延长寄养确认 */}
          {me.role === 'owner' && inc.kind === 'extend' && !inc.ownerConfirmed && (
            <div className="row">
              <input type="datetime-local" style={{ width: 220 }} value={extendTo} onChange={(e) => setExtendTo(e.target.value)} />
              <button className="btn-secondary" onClick={() => {
                addIncidentAction(inc.id, `主人确认延长寄养至 ${fmtDate(localToStored(extendTo))}，知悉续计费用。`)
                extendBooking(booking!.id, localToStored(extendTo), { label: `延长寄养至 ${fmtDate(localToStored(extendTo)).slice(5)}`, kind: 'addon', amount: 170, note: '主人临时延长，含单独照护加价（示例）' })
                useStore.setState({ incidents: useStore.getState().incidents.map((x) => x.id === inc.id ? { ...x, extendTo: localToStored(extendTo), ownerConfirmed: true } : x) })
              }}>确认延长并知悉费用</button>
            </div>
          )}

          {/* 通用留痕 */}
          <Field label={`补充处理进展（${ROLE_LABEL[me.role]}视角）`}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={
              me.role === 'owner' ? '回复门店：知晓/送物品/用药授权…' :
              me.role === 'caregiver' ? '现场处置、宠物最新状态…' :
              '协调进展、费用/赔付沟通…'
            } />
          </Field>
          <div className="row-between">
            <button className="btn-secondary" onClick={post}>追加协同记录</button>
            {me.role === 'manager' && (
              <div className="row">
                <input style={{ width: 280 }} placeholder="闭环说明（处置结果/后续注意）" value={resolution} onChange={(e) => setResolution(e.target.value)} />
                <button className="btn-danger" onClick={() => { if (!resolution.trim()) return alert('店长闭环需填写处置结果'); resolveIncident(inc.id, resolution.trim()) }}>店长闭环该异常</button>
              </div>
            )}
          </div>
        </div>
      )}
      {inc.status !== 'resolved' && !canAct && <div className="small muted">你所在角色非该单协同方，仅可查看。</div>}
    </div>
  )
}

export default function Incidents() {
  const { incidents, bookings, currentUser } = useStore()
  const me = currentUser()!
  const [q, setQ] = useSearchParams()
  const [tab, setTab] = useState<'open' | 'resolved' | 'all'>('open')

  const myPetIds = useMemo(
    () => new Set(bookings.filter((b) => b.ownerId === me.id).map((b) => b.petId)),
    [bookings, me],
  )

  const list = useMemo(() => {
    let arr = [...incidents]
    if (me.role === 'owner') arr = arr.filter((i) => myPetIds.has(i.petId))
    if (me.role === 'hospital') arr = arr.filter((i) => i.participants.includes('hospital'))
    if (tab === 'open') arr = arr.filter((i) => i.status !== 'resolved')
    if (tab === 'resolved') arr = arr.filter((i) => i.status === 'resolved')
    return arr.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))
  }, [incidents, me, tab, myPetIds])

  const focusId = q.get('id')

  return (
    <div>
      <h1>异常协同处理</h1>
      <p className="muted">拒食、呕吐、腹泻、咬伤员工、疫苗记录不全、主人临时延长寄养 —— 店长、护理员、主人、合作医院围绕同一只宠物在同一单据内留痕协同。</p>
      <div className="row" style={{ margin: '10px 0 16px' }}>
        <div className="seg">
          <button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>处理中（{incidents.filter((i) => i.status !== 'resolved').length}）</button>
          <button className={tab === 'resolved' ? 'on' : ''} onClick={() => setTab('resolved')}>已闭环</button>
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>全部</button>
        </div>
      </div>

      {focusId && (
        <div className="hero-note">
          当前定位异常单：<b>{incidents.find((i) => i.id === focusId)?.title}</b>
          <button className="btn-link" style={{ marginLeft: 10 }} onClick={() => setQ({})}>查看全部</button>
        </div>
      )}

      {list.length === 0 ? <div className="card"><EmptyState text="暂无异常单" /></div> :
        list.filter((i) => !focusId || i.id === focusId).map((inc) => <IncidentCard key={inc.id} inc={inc} />)}
    </div>
  )
}
