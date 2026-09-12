import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore, MISSED_REASON_LABEL, MISSED_STATUS_LABEL } from '../store'
import { fmtDate } from '../lib/risk'
import { Badge, EmptyState, PetAvatar } from '../components/ui'
import { StatusBadge } from './Dashboard'

export default function OwnerSummary() {
  const { bookings, pets, currentUser } = useStore()
  const me = currentUser()!
  const [q] = useSearchParams()

  const visible = useMemo(() => {
    let arr = bookings
    if (me.role === 'owner') arr = arr.filter((b) => b.ownerId === me.id)
    // 主人主要看已闭环订单的摘要；在住宠物显示"接回前预览"
    return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [bookings, me])

  const focusPet = q.get('pet')
  const focusBooking = q.get('booking')
  const [selected, setSelected] = useState(
    focusBooking ?? visible.find((b) => b.petId === focusPet)?.id ?? visible[0]?.id ?? '',
  )
  const b = bookings.find((x) => x.id === selected)

  if (!b) return <div><h1>护理交接摘要</h1><div className="card"><EmptyState text="暂无订单" /></div></div>
  const pet = pets.find((p) => p.id === b.petId)
  const totalNet = b.charges.reduce((s, c) => s + c.amount, 0)

  return (
    <div>
      <h1>护理交接摘要</h1>
      <p className="muted">主人接回前，页面为每只宠物生成护理交接摘要 —— 一张纸看懂本次寄养；接回后也可随时回看，方便后续追问。</p>

      <div className="grid" style={{ gridTemplateColumns: '280px 1fr' }}>
        <div className="card">
          <h3>选择订单</h3>
          {visible.map((x) => {
            const p = pets.find((z) => z.id === x.petId)
            return (
              <div key={x.id} className={`room-card ${x.id === selected ? 'risk-medium' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setSelected(x.id)}>
                <div className="row-between">
                  <div className="row"><PetAvatar pet={p} /><b>{x.petName}</b></div>
                  <StatusBadge s={x.status} />
                </div>
                <div className="tiny muted" style={{ marginTop: 4 }}>{x.code} · {fmtDate(x.actualPickUpAt ?? x.profile.pickUpTime).slice(0, 10)}</div>
              </div>
            )
          })}
        </div>

        <div className="card" id="summary-print">
          <div className="row-between">
            <div className="row">
              <PetAvatar pet={pet} size="lg" />
              <div>
                <h2 style={{ margin: 0 }}>{b.petName} 的护理交接摘要</h2>
                <div className="small muted">订单 {b.code} · 主人 {b.ownerName} · 暖爪城市宠物寄养</div>
              </div>
            </div>
            {b.status === 'closed'
              ? <Badge className="badge-green">✓ {fmtDate(b.actualPickUpAt)} 已接回</Badge>
              : <Badge className="badge-amber">接回前预览</Badge>}
          </div>

          <div className="divider" />
          <dl className="kv">
            <dt>品种年龄</dt><dd>{b.profile.breed} · {b.profile.ageYears}岁{b.profile.ageMonths}月{b.profile.weightKg ? ` · ${b.profile.weightKg}kg` : ''}</dd>
            <dt>寄养时段</dt><dd>{fmtDate(b.actualDropOffAt ?? b.profile.dropOffTime)} ～ {fmtDate(b.actualPickUpAt ?? b.profile.pickUpTime)}{b.extended && '（含临时延长）'}</dd>
            <dt>疫苗</dt><dd>{b.profile.vaccines.map((v) => v.done ? `✓${v.name}` : `✗${v.name}缺失`).join('；')}</dd>
            <dt>过敏/用药</dt><dd>{b.profile.allergies}；{b.profile.medications.length ? b.profile.medications.map((m) => `${m.name} ${m.dosage} ${m.times.join('/')}`).join('；') : '无长期用药'}</dd>
          </dl>

          <div className="divider" />
          <h3>📋 护理交接说明</h3>
          {b.handoverSummary
            ? <div className="summary-box">{b.handoverSummary}</div>
            : <div className="small muted">订单闭环时由店长生成，当前为待生成状态。接回结算后可在此查看完整摘要。</div>}

          {(b.missedMedications ?? []).length > 0 && (
            <>
              <div className="divider" />
              <h3>💊 喂药漏服补救记录</h3>
              {(b.missedMedications ?? []).map((m) => (
                <div key={m.id} className="room-card" style={{ borderLeft: `4px solid ${m.severity === 'serious' ? 'var(--red)' : 'var(--amber)'}` }}>
                  <div className="row-between">
                    <b>{m.medName}</b>
                    <Badge className={m.status === 'made_up' ? 'badge-green' : m.status === 'skipped' ? 'badge-gray' : 'badge-red'}>{MISSED_STATUS_LABEL[m.status]}</Badge>
                  </div>
                  <div className="small muted" style={{ margin: '4px 0' }}>
                    计划 {fmtDate(m.scheduledAt)}｜原因：{MISSED_REASON_LABEL[m.reason]}｜发现时状态：{m.petCondition}
                  </div>
                  {m.ownerInstruction && <div className="summary-box" style={{ marginTop: 6 }}><b>新喂药说明：</b>{m.ownerInstruction}</div>}
                  {m.nextSchedule && <div className="small" style={{ marginTop: 4 }}>⏰ 后续用药时间已调整为 {m.nextSchedule.nextDate} {m.nextSchedule.adjustedTime}（原 {m.nextSchedule.originalTime}）</div>}
                  {m.madeUpAt && <div className="small" style={{ color: 'var(--green)', marginTop: 4 }}>✓ {fmtDate(m.madeUpAt)} 已补服成功：{m.madeUpNote}</div>}
                </div>
              ))}
            </>
          )}

          {b.flaggedRisk && (
            <>
              <div className="divider" />
              <h3>⚠ 下次寄养风险提示</h3>
              <div className="summary-box" style={{ background: '#fee2e2', borderColor: '#fecaca' }}>{b.flaggedRisk}</div>
            </>
          )}

          {b.charges.length > 0 && (
            <>
              <div className="divider" />
              <h3>🧾 本订单费用（含加项/异常照护/赔付/押金）</h3>
              <table>
                <thead><tr><th>项目</th><th className="right">金额</th></tr></thead>
                <tbody>
                  {b.charges.map((c) => (
                    <tr key={c.id}><td>{c.label}<span className="tiny muted" style={{ marginLeft: 8 }}>{c.note}</span></td>
                      <td className="right" style={{ color: c.amount < 0 ? 'var(--green)' : undefined, fontWeight: 600 }}>{c.amount < 0 ? '-' : ''}¥{Math.abs(c.amount)}</td></tr>
                  ))}
                  <tr><td><b>净额</b></td><td className="right"><b>¥{totalNet}</b></td></tr>
                </tbody>
              </table>
            </>
          )}

          {b.followUps.length > 0 && (
            <>
              <div className="divider" />
              <h3>📞 回访记录</h3>
              {b.followUps.map((f) => (
                <div key={f.id} className="small">· {fmtDate(f.at)}（{f.channel}）{f.content}</div>
              ))}
            </>
          )}

          <div className="divider" />
          <div className="row-between">
            <button className="btn-secondary btn-sm" onClick={() => window.print()}>🖨 打印 / 保存为 PDF</button>
            <span className="tiny muted">如有疑问，可凭订单号 {b.code} 联系门店查询同订单全部照护与沟通记录。</span>
          </div>
        </div>
      </div>
    </div>
  )
}
