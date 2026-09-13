import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { DIM_LABEL, RESULT_LABEL, RESULT_STYLE, dimAverage, fmtDate, suggestTrialResult } from '../lib/risk'
import { Badge, Field, PetAvatar, ScorePicker } from '../components/ui'
import { StatusBadge } from './Dashboard'
import { localToStored } from '../lib/time'
import type { Booking, TrialDimension, TrialResult } from '../types'

const DIMS: TrialDimension[] = ['interaction', 'eating', 'defecation', 'barking', 'scratching', 'rest']
const DIM_ICONS: Record<TrialDimension, string> = {
  interaction: '🐕‍🦺', eating: '🍚', defecation: '💩', barking: '📢', scratching: '🐾', rest: '😴',
}
const SCORE_LABELS: [string, string, string, string, string] = ['很好', '较好', '一般', '较差', '很差']
const RESULTS: TrialResult[] = ['accepted_standard', 'accepted_isolation', 'accepted_solo', 'rejected']

export default function TrialEvaluation() {
  const { bookings, pets, rooms, users, currentUser, scheduleTrial, addObservation, assessTrial, startBoarding } = useStore()
  const me = currentUser()!
  const isManager = me.role === 'manager'

  const candidates = useMemo(
    () => bookings.filter((b) => b.status === 'intake' || b.status === 'trial' || (b.status === 'boarding' && !b.trial?.result)),
    [bookings],
  )
  const assessed = useMemo(() => bookings.filter((b) => b.trial?.result), [bookings])

  const [selId, setSelId] = useState(candidates[0]?.id ?? assessed[0]?.id ?? '')
  const b = bookings.find((x) => x.id === selId)

  // 安排试住
  const caregivers = users.filter((u) => u.role === 'caregiver')
  const [schedAt, setSchedAt] = useState('2026-09-12T14:00')
  const [schedRoom, setSchedRoom] = useState(rooms[0].id)
  const [schedWho, setSchedWho] = useState(caregivers[0]?.id ?? '')

  // 观察录入
  const [dim, setDim] = useState<TrialDimension>('interaction')
  const [score, setScore] = useState(3)
  const [detail, setDetail] = useState('')

  // 评估
  const [result, setResult] = useState<TrialResult | ''>('')
  const [conclusion, setConclusion] = useState('')
  const [assessRoom, setAssessRoom] = useState('')

  if (!b) return <div className="empty">暂无可评估的订单</div>
  const pet = pets.find((p) => p.id === b.petId)
  const trial = b.trial
  const suggested = suggestTrialResult(b)
  const userName = (id?: string) => users.find((u) => u.id === id)?.name ?? '—'

  // 各维度最差/平均
  const dimStats = DIMS.map((d) => {
    const obs = trial?.observations.filter((o) => o.dimension === d) ?? []
    return { d, list: obs, avg: dimAverage(obs.map((o) => o.level)) }
  })

  function submitObservation() {
    if (!detail.trim()) return alert('请填写观察描述')
    addObservation(b!.id, { dimension: dim, level: score as 1 | 2 | 3 | 4 | 5, detail: detail.trim() })
    setDetail('')
  }

  function doAssess() {
    if (!result) return alert('请选择试住结果（房态）')
    if (!conclusion.trim()) return alert('请填写评估结论')
    if (!assessRoom) return alert('请确认安排房间')
    assessTrial(b!.id, result as TrialResult, conclusion.trim(), assessRoom)
  }

  return (
    <div>
      <h1>试住评估</h1>
      <p className="muted">门店安排试住 → 护理员按六维度记录观察 → 店长综合判定：可接收普通房 / 隔离房 / 单独照护，或暂不接收。</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <select style={{ width: 360 }} value={selId} onChange={(e) => { setSelId(e.target.value); setResult(''); setConclusion(''); setAssessRoom('') }}>
          {candidates.map((x) => <option key={x.id} value={x.id}>〔待评估〕{x.petName} · {x.code} · {x.profile.breed}</option>)}
          {assessed.filter((x) => !candidates.some((c) => c.id === x.id)).map((x) => (
            <option key={x.id} value={x.id}>〔已评估〕{x.petName} · {x.code} · {RESULT_LABEL[x.trial!.result!]}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-2">
        {/* 左：资料与观察 */}
        <div>
          <div className="card">
            <div className="row-between">
              <div className="row">
                <PetAvatar pet={pet} size="lg" />
                <div><b style={{ fontSize: 16 }}>{b.petName}</b>
                  <div className="small muted">{b.profile.breed} · {b.profile.ageYears}岁{b.profile.ageMonths}月 · {b.ownerName}</div>
                </div>
              </div>
              <StatusBadge s={b.status} />
            </div>
            <div className="divider" />
            <div className="row" style={{ gap: 6 }}>
              {b.profile.vaccines.map((v, i) => v.done
                ? <span key={i} className="badge badge-green">✓ {v.name}</span>
                : <span key={i} className="badge badge-red">✗ {v.name}缺失</span>)}
              <span className="chip">攻击性 {['无', '轻度', '中度', '严重'][['none', 'mild', 'moderate', 'severe'].indexOf(b.profile.aggression)]}</span>
              <span className="chip">分离焦虑 {['无', '轻度', '中度', '严重'][['none', 'mild', 'moderate', 'severe'].indexOf(b.profile.separationAnxiety)]}</span>
              <span className="chip">绝育：{b.profile.neutered == null ? '不明' : b.profile.neutered ? '是' : '否'}</span>
              <span className="chip">过敏：{b.profile.allergies}</span>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>饮食：{b.profile.dietHabit}</div>
          </div>

          {/* 安排试住（店长） */}
          {!trial && isManager && (
            <div className="card">
              <h2>📅 安排试住</h2>
              <div className="form-grid">
                <Field label="试住时间"><input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} /></Field>
                <Field label="试住观察房间">
                  <select value={schedRoom} onChange={(e) => setSchedRoom(e.target.value)}>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
                <Field label="负责护理员" full>
                  <select value={schedWho} onChange={(e) => setSchedWho(e.target.value)}>
                    {caregivers.map((c) => <option key={c.id} value={c.id}>{c.name}（@{c.username}）</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => scheduleTrial(b.id, localToStored(schedAt), schedRoom, schedWho)}>确认安排，进入试住</button>
              </div>
            </div>
          )}
          {!trial && !isManager && <div className="card empty">等待店长安排试住时间与房间。</div>}

          {/* 观察记录 */}
          {trial && !trial.result && (
            <div className="card">
              <h2>📝 试住观察记录（护理员）</h2>
              <div className="small muted" style={{ marginBottom: 8 }}>
                试住开始 {fmtDate(trial.scheduledAt)} · 负责：{userName(trial.caregiverId)}
              </div>
              <Field label="观察维度">
                <div className="seg">
                  {DIMS.map((d) => (
                    <button key={d} type="button" className={dim === d ? 'on' : ''} onClick={() => setDim(d)}>
                      {DIM_ICONS[d]} {DIM_LABEL[d]}
                    </button>
                  ))}
                </div>
              </Field>
              <div style={{ margin: '10px 0' }}>
                <div className="small muted" style={{ marginBottom: 4 }}>表现评分（1 很好 → 5 很差）</div>
                <ScorePicker value={score} onChange={setScore} labels={SCORE_LABELS} />
              </div>
              <Field label="观察描述"><textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="具体表现、持续时间、触发因素…" /></Field>
              <div style={{ marginTop: 8 }}><button onClick={submitObservation}>提交观察</button></div>
            </div>
          )}
        </div>

        {/* 右：六维面板 + 评估 */}
        <div>
          <div className="card">
            <h2>🧪 六维度试住表现</h2>
            <div className="grid grid-2">
              {dimStats.map(({ d, list, avg }) => (
                <div key={d} className="room-card" style={{ borderLeft: `4px solid ${avg === 0 ? '#cbd5e1' : avg <= 2 ? '#059669' : avg <= 3.5 ? '#d97706' : '#dc2626'}` }}>
                  <div className="row-between"><b>{DIM_ICONS[d]} {DIM_LABEL[d]}</b>
                    {list.length > 0
                      ? <Badge className={avg <= 2 ? 'badge-green' : avg <= 3.5 ? 'badge-amber' : 'badge-red'}>{avg.toFixed(1)} 分 / {list.length} 条</Badge>
                      : <span className="tiny muted">未记录</span>}
                  </div>
                  {list.slice(-2).map((o) => (
                    <div key={o.id} className="tiny muted" style={{ marginTop: 4 }}>{fmtDate(o.at).slice(5)}（{o.level}分）{o.detail}</div>
                  ))}
                </div>
              ))}
            </div>
            {trial?.observations.length ? (
              <div className="small muted" style={{ marginTop: 8 }}>
                综合建议参考：<b className={suggested.startsWith('rejected') ? '' : ''}>{RESULT_LABEL[suggested]}</b>（系统按疫苗/攻击性/观察分自动建议，最终由店长判定）
              </div>
            ) : <div className="small muted" style={{ marginTop: 8 }}>尚无观察记录，护理员提交后可进行房态判定。</div>}
          </div>

          {/* 店长判定 */}
          {trial && !trial.result && isManager && (
            <div className="card">
              <h2>👔 店长判定：接收与房态</h2>
              <div className="col">
                {RESULTS.map((r) => (
                  <label key={r} className="checkbox-row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
                    <input type="radio" name="result" checked={result === r} onChange={() => { setResult(r); setAssessRoom(rooms.find((rm) => rm.id === trial.roomId)?.id ?? rooms[0].id) }} />
                    <Badge className={RESULT_STYLE[r]}>{RESULT_LABEL[r]}</Badge>
                    <span className="small muted">
                      {r === 'accepted_standard' && '各维度正常、疫苗齐全，可与其他动物共处'}
                      {r === 'accepted_isolation' && '疫苗不全或应激/轻症，隔离观察，远离其他动物'}
                      {r === 'accepted_solo' && '攻击性/严重焦虑等，需 1v1 单独照护'}
                      {r === 'rejected' && '风险超出门店照护能力，暂不接收'}
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ margin: '10px 0' }}>
                <Field label="安排房间">
                  <select value={assessRoom} onChange={(e) => setAssessRoom(e.target.value)}>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="评估结论（写入档案，交接可见）"><textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} placeholder="房态理由、护理要点、禁忌、是否需要医院协查…" /></Field>
              <div className="row" style={{ marginTop: 10 }}>
                <button onClick={doAssess}>确认试住结论并分房</button>
                {result !== 'rejected' && <button className="btn-secondary" onClick={() => { if (!result) return alert('请先选择可接收的房态'); doAssess(); setTimeout(() => startBoarding(b.id), 0) }}>判定并直接开始寄养</button>}
              </div>
            </div>
          )}

          {trial?.result && (
            <div className="card">
              <h2>✅ 试住结论</h2>
              <div className="row"><Badge className={RESULT_STYLE[trial.result]}>{RESULT_LABEL[trial.result]}</Badge>
                <span className="small muted">{fmtDate(trial.assessedAt)} · {userName(trial.assessorId)}</span></div>
              <div className="summary-box" style={{ marginTop: 10 }}>{trial.conclusion}</div>
              {b.status !== 'boarding' && b.status !== 'closed' && isManager && (
                <button style={{ marginTop: 10 }} onClick={() => startBoarding(b.id)}>宠物已送达，开始寄养计费</button>
              )}
              {b.status === 'boarding' && <div className="badge badge-green" style={{ marginTop: 10 }}>寄养进行中</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
