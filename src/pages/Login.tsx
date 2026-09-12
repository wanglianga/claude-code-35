import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, ROLE_LABEL } from '../store'
import type { Role } from '../types'

const DEMO: { role: Role; username: string; desc: string; perms: string; emoji: string }[] = [
  { role: 'manager', username: 'manager', emoji: '👔', desc: '王店长 · 门店最高权限', perms: '预约/试住判定、异常协同、房间与宠物风险、结算赔付、班次交接' },
  { role: 'caregiver', username: 'caregiver', emoji: '🧑‍⚕️', desc: '李护 · 一线护理员', perms: '试住观察、喂食/喂药/遛狗/清洁/视频时间线、异常上报、交接查看' },
  { role: 'owner', username: 'owner', emoji: '🙋‍♀️', desc: '陈女士 · 宠物主人（奶茶/团子/年糕）', perms: '预约登记、查看视频与照护记录、异常确认、延长寄养、接回摘要与账单' },
  { role: 'hospital', username: 'hospital', emoji: '🏥', desc: '林医生 · 瑞鹏合作动物医院', perms: '查看授权宠物病历相关照护/异常记录、给出医疗处置意见' },
]

export default function Login() {
  const login = useStore((s) => s.login)
  const nav = useNavigate()
  const [username, setUsername] = useState('manager')
  const [password, setPassword] = useState('123456')
  const [err, setErr] = useState('')

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const u = login(username, password)
    if (u) nav('/')
    else setErr('用户名或密码错误（演示账号密码均为 123456）')
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 34 }}>🐾</div>
          <h1 style={{ marginBottom: 4 }}>暖爪 · 城市宠物寄养照护平台</h1>
          <div className="muted">试住评估 ｜ 喂药与照护时间线 ｜ 四方异常协同 ｜ 风险看板与班次交接</div>
        </div>
        <div className="login-grid">
          <form onSubmit={submit} className="col">
            <h2>账号登录</h2>
            <label className="field"><span>用户名</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="如 manager" />
            </label>
            <label className="field"><span>密码</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="123456" />
            </label>
            {err && <div className="badge badge-red" style={{ alignSelf: 'flex-start' }}>{err}</div>}
            <button type="submit">登 录</button>
            <div className="small muted" style={{ marginTop: 6 }}>
              所有演示账号密码均为 <b>123456</b>；点击右侧角色卡可自动填充。
              另有护理员 <b>zhaohu</b>、主人 <b>zhou</b>（周先生，阿狼主人）可登录体验。
            </div>
          </form>
          <div>
            <h2>逐角色演示账号</h2>
            {DEMO.map((d) => (
              <div
                key={d.role}
                className={`demo-account ${username === d.username ? 'selected' : ''}`}
                onClick={() => { setUsername(d.username); setPassword('123456'); setErr('') }}
              >
                <div className="row-between">
                  <b>{d.emoji} {d.desc}</b>
                  <span className="badge badge-amber">{ROLE_LABEL[d.role]}</span>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  账号 <b>{d.username}</b> / 密码 <b>123456</b>
                </div>
                <div className="small" style={{ marginTop: 4 }}>{d.perms}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
