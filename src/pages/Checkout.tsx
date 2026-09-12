import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { boardingDays, fmtDate, LEVEL_LABEL } from '../lib/risk'
import { Badge, EmptyState, Field, PetAvatar } from '../components/ui'
import { StatusBadge } from './Dashboard'
import type { Booking, OrderCharge } from '../types'

const KIND_LABEL: Record<OrderCharge['kind'], string> = {
  boarding: '寄养费',
  addon: '加项服务',
  abnormal_care: '异常照护',
  compensation: '赔付/减免',
  deposit: '押金抵扣',
}
const KIND_CLS: Record<OrderCharge['kind'], string> = {
  boarding: 'badge-blue', addon: 'badge-purple', abnormal_care: 'badge-amber', compensation: 'badge-red', deposit: 'badge-gray',
}

// 依据整单数据自动生成护理交接摘要草稿
function buildSummary(b: Booking, days: number): string {
  const p = b.profile
  const lines: string[] = []
  lines.push(`${b.petName}（${p.breed}，${p.ageYears}岁${p.ageMonths}月）本次寄养 ${days} 天${b.extended ? '（含主人临时延长）' : ''}，房态：${b.trial?.result === 'accepted_solo' ? '单独照护间 1v1' : b.trial?.result === 'accepted_isolation' ? '隔离间' : '普通房'}。`)
  lines.push(`行为基线：攻击性${LEVEL_LABEL[p.aggression]}、分离焦虑${LEVEL_LABEL[p.separationAnxiety]}、${p.neutered ? '已绝育' : '未绝育'}；过敏史：${p.allergies}。`)
  if (p.medications.length) lines.push(`用药：${p.medications.map((m) => `${m.name}（${m.dosage}，${m.times.join('/')}，${m.route}）`).join('；')}。`)
  lines.push(`饮食偏好：${p.dietHabit}`)
  if (b.trial?.conclusion) lines.push(`试住结论：${b.trial.conclusion}`)
  lines.push('接回后请主人继续观察食欲、排便与情绪，按医嘱完成剩余用药疗程；如有异常及时联系门店或合作医院。')
  return lines.join('\n')
}

function riskDraft(b: Booking): string {
  const p = b.profile
  const flags: string[] = []
  if (p.vaccines.some((v) => !v.done)) flags.push('疫苗记录不全（' + p.vaccines.filter((v) => !v.done).map((v) => v.name).join('、') + '），下次接单须先补齐证明')
  if (p.aggression !== 'none') flags.push(`${LEVEL_LABEL[p.aggression]}攻击性（${p.aggressionNote ?? '见档案'}）`)
  if (p.separationAnxiety === 'severe' || p.separationAnxiety === 'moderate') flags.push(`${LEVEL_LABEL[p.separationAnxiety]}分离焦虑`)
  if (b.extended) flags.push('有临时延长寄养记录，排房需预留缓冲')
  if (!flags.length) return ''
  return `历史风险宠物：${flags.join('；')}。下次接单建议：${p.aggression === 'moderate' || p.aggression === 'severe' ? '单独照护间 + 资深护理员；' : '关注应激；'}疫苗不全未补齐前建议拒收或仅隔离照护。`
}

export default function Checkout() {
  const { bookings, pets, incidents, currentUser, addCharge, checkout, addFollowUp } = useStore()
  const me = currentUser()!
  const list = useMemo(() => bookings.filter((b) => b.status === 'boarding' || b.status === 'trial'), [bookings])
  const closed = useMemo(() => bookings.filter((b) => b.status === 'closed').sort((a, z) => (a.actualPickUpAt! < z.actualPickUpAt! ? 1 : -1)), [bookings])
  const [selId, setSelId] = useState(list[0]?.id ?? '')
  const b = bookings.find((x) => x.id === selId)

  // 新增费用
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<OrderCharge['kind']>('addon')
  const [amount, setAmount] = useState<number | ''>('')
  const [note, setNote] = useState('')

  // 摘要 / 风险 / 回访
  const [summary, setSummary] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [flagText, setFlagText] = useState('')
  const [followUp, setFollowUp] = useState({ channel: '电话', content: '' })

  if (!b) return <div><h1>接回结算</h1><div className="card"><EmptyState text="当前没有待接回的在住宠物" /></div>
    <HistoryClosed closed={closed} /></div>

  const pet = pets.find((p) => p.id === b.petId)
  const days = boardingDays(b)
  const incs = incidents.filter((i) => i.petId === b.petId)
  const openIncs = incs.filter((i) => i.status !== 'resolved')
  const subtotal = b.charges.filter((c) => c.kind !== 'deposit').reduce((s, c) => s + c.amount, 0)
  const depositUsed = b.depositPaid
  const payable = subtotal - depositUsed

  function pickBooking(id: string) {
    setSelId(id)
    const x = bookings.find((z) => z.id === id)!
    setSummary(buildSummary(x, boardingDays(x)))
    const rd = riskDraft(x)
    setFlagged(!!rd); setFlagText(rd)
  }

  // 首次进入自动生成草稿
  const effectiveSummary = summary || buildSummary(b, days)
  const effectiveFlag = flagged ? flagText : ''

  function addRow() {
    if (!label.trim() || amount === '') return alert('请填写项目名称和金额（赔付填负数）')
    addCharge(b!.id, { label: label.trim(), kind, amount: Number(amount), note: note.trim() || undefined })
    setLabel(''); setAmount(''); setNote('')
  }

  function doCheckout() {
    if (openIncs.length) return alert(`还有 ${openIncs.length} 起异常未闭环，请先到「异常协同」处理（可店长闭环）`)
    if (!effectiveSummary.trim()) return alert('交接摘要不能为空')
    // 自动补一行押金抵扣
    if (b!.depositPaid > 0 && !b!.charges.some((c) => c.kind === 'deposit')) {
      addCharge(b!.id, { label: '押金抵扣（接回结算）', kind: 'deposit', amount: -b!.depositPaid })
    }
    checkout(b!.id, effectiveSummary.trim(), effectiveFlag.trim())
    alert(`已完成 ${b!.petName} 的接回结算，护理交接摘要已生成，主人可在「护理交接摘要」查看。`)
  }

  return (
    <div>
      <h1>接回结算</h1>
      <p className="muted">主人接回时，寄养天数、加项服务、异常照护、赔付、押金与回访进入同一订单；同时生成护理交接摘要，并把异常宠物写入下次接单风险提示。</p>

      <div className="row" style={{ margin: '10px 0 16px' }}>
        <select style={{ width: 380 }} value={selId} onChange={(e) => pickBooking(e.target.value)}>
          {list.map((x) => <option key={x.id} value={x.id}>{x.petName} · {x.code} · {boardingDays(x)} 天 · {x.ownerName}</option>)}
        </select>
        <StatusBadge s={b.status} />
        {b.extended && <Badge className="badge-purple">已延长寄养</Badge>}
      </div>

      <div className="grid grid-2">
        <div className="col">
          <div className="card">
            <h2>🐾 寄养信息</h2>
            <div className="row"><PetAvatar pet={pet} size="lg" />
              <div><b style={{ fontSize: 16 }}>{b.petName}</b><div className="small muted">{b.profile.breed} · 主人 {b.ownerName}</div></div>
            </div>
            <div className="kv" style={{ marginTop: 10 }}>
              <dt>实际送达</dt><dd>{fmtDate(b.actualDropOffAt ?? b.profile.dropOffTime)}</dd>
              <dt>约定接回</dt><dd>{fmtDate(b.profile.pickUpTime)}</dd>
              <dt>寄养天数</dt><dd><b>{days}</b> 天（按实际在店时间计）</dd>
              <dt>已付押金</dt><dd>¥{b.depositPaid}</dd>
            </div>
            {openIncs.length > 0 && (
              <div className="summary-box" style={{ marginTop: 10, background: '#fee2e2', borderColor: '#fecaca' }}>
                🚨 {openIncs.length} 起异常尚未闭环：{openIncs.map((i) => i.title).join('；')}
              </div>
            )}
          </div>

          <div className="card">
            <h2>💰 同一订单费用明细</h2>
            <table>
              <thead><tr><th>项目</th><th>类别</th><th className="right">金额</th><th>备注</th><th></th></tr></thead>
              <tbody>
                {b.charges.map((c) => (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td><Badge className={KIND_CLS[c.kind]}>{KIND_LABEL[c.kind]}</Badge></td>
                    <td className="right" style={{ color: c.amount < 0 ? 'var(--green)' : undefined, fontWeight: 600 }}>{c.amount < 0 ? '-' : ''}¥{Math.abs(c.amount)}</td>
                    <td className="small muted">{c.note ?? '—'}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divider" />
            <div className="form-grid">
              <Field label="项目名称" full><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如 洗护加项 / 夜间专人值守 / 抓伤安抚减免" /></Field>
              <Field label="类别">
                <select value={kind} onChange={(e) => setKind(e.target.value as OrderCharge['kind'])}>
                  <option value="addon">加项服务</option>
                  <option value="abnormal_care">异常照护</option>
                  <option value="compensation">赔付/减免（负数）</option>
                  <option value="boarding">寄养费补记</option>
                </select>
              </Field>
              <Field label="金额（赔付/减免填负数）"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} placeholder="如 80 或 -200" /></Field>
              <Field label="备注" full><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="费用说明/审批人" /></Field>
            </div>
            <div style={{ marginTop: 8 }}><button className="btn-secondary btn-sm" onClick={addRow}>＋ 添加费用行</button></div>
            <div className="divider" />
            <div className="col small">
              <div className="row-between"><span>费用小计（不含押金）</span><b>¥{subtotal}</b></div>
              <div className="row-between"><span>押金抵扣</span><b>- ¥{depositUsed}</b></div>
              <div className="row-between" style={{ fontSize: 16 }}><b>{payable >= 0 ? '主人应付' : '应退主人'}</b><b style={{ color: payable >= 0 ? 'var(--red)' : 'var(--green)' }}>¥{Math.abs(payable)}</b></div>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <h2>📑 护理交接摘要（接回前自动生成，可编辑）</h2>
            <textarea style={{ minHeight: 200 }} value={effectiveSummary} onChange={(e) => setSummary(e.target.value)} />
            <div style={{ marginTop: 8 }}><button className="btn-secondary btn-sm" onClick={() => setSummary(buildSummary(b, days))}>按订单数据重新生成</button></div>
          </div>

          <div className="card">
            <h2>⚠ 下次接单风险提示</h2>
            <label className="checkbox-row" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={flagged} onChange={(e) => { setFlagged(e.target.checked); if (e.target.checked && !flagText) setFlagText(riskDraft(b)) }} />
              将本宠物标记为异常风险宠物，下次接单自动提示
            </label>
            {flagged && <textarea style={{ minHeight: 100 }} value={flagText} onChange={(e) => setFlagText(e.target.value)} />}
          </div>

          <div className="card">
            <h2>📞 回访记录（同订单留痕，方便主人后续追问）</h2>
            {b.followUps.length > 0 && (
              <div className="timeline" style={{ marginBottom: 8 }}>
                {b.followUps.map((f) => (
                  <div key={f.id} className="tl-item sev-low">
                    <div className="tl-time">{fmtDate(f.at)} · {f.channel}</div>
                    <div>{f.content}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="row">
              <select style={{ width: 110 }} value={followUp.channel} onChange={(e) => setFollowUp({ ...followUp, channel: e.target.value })}>
                <option>电话</option><option>微信</option><option>到店</option>
              </select>
              <input placeholder="回访内容（可接回后补录）" value={followUp.content} onChange={(e) => setFollowUp({ ...followUp, content: e.target.value })} />
              <button className="btn-secondary btn-sm" onClick={() => { if (!followUp.content.trim()) return; addFollowUp(b.id, { channel: followUp.channel, content: followUp.content.trim() }); setFollowUp({ ...followUp, content: '' }) }}>记录</button>
            </div>
          </div>

          <div className="card">
            <button className="btn-danger" style={{ width: '100%', padding: '12px' }} onClick={doCheckout}>确认接回 · 订单闭环</button>
            <div className="tiny muted" style={{ marginTop: 6 }}>闭环后押金自动抵扣、摘要与风险提示写入档案；历史订单可在下方与「订单与宠物」中追溯。</div>
          </div>
        </div>
      </div>

      <HistoryClosed closed={closed} />
    </div>
  )
}

function HistoryClosed({ closed }: { closed: Booking[] }) {
  const { pets } = useStore()
  if (!closed.length) return null
  return (
    <div className="card">
      <h2>📜 已闭环订单（赔付/回访/摘要可追溯）</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>宠物</th><th>订单号</th><th>接回时间</th><th>费用净额</th><th>风险标记</th><th>摘要</th></tr></thead>
          <tbody>
            {closed.map((b) => {
              const pet = pets.find((p) => p.id === b.petId)
              const net = b.charges.reduce((s, c) => s + c.amount, 0)
              return (
                <tr key={b.id}>
                  <td><div className="row"><PetAvatar pet={pet} />{b.petName}</div></td>
                  <td className="small nowrap">{b.code}</td>
                  <td className="small nowrap">{fmtDate(b.actualPickUpAt)}</td>
                  <td className="right nowrap">¥{net}</td>
                  <td>{b.flaggedRisk ? <Badge className="badge-red">已标记</Badge> : <span className="tiny muted">—</span>}</td>
                  <td className="small muted" style={{ maxWidth: 300 }}>{b.handoverSummary?.slice(0, 40)}…</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
