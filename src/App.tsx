import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useStore, ROLE_LABEL } from './store'
import type { Role } from './types'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Bookings from './pages/Bookings'
import BookingForm from './pages/BookingForm'
import TrialEvaluation from './pages/TrialEvaluation'
import CareTimeline from './pages/CareTimeline'
import Incidents from './pages/Incidents'
import RoomRisk from './pages/RoomRisk'
import ShiftHandover from './pages/ShiftHandover'
import Checkout from './pages/Checkout'
import OwnerSummary from './pages/OwnerSummary'

interface NavItem { to: string; icon: string; label: string; roles: Role[] }

const NAV: NavItem[] = [
  { to: '/', icon: '🏠', label: '总览看板', roles: ['manager', 'caregiver', 'owner', 'hospital'] },
  { to: '/bookings', icon: '📋', label: '订单与宠物', roles: ['manager', 'caregiver', 'owner'] },
  { to: '/booking/new', icon: '📝', label: '预约登记', roles: ['manager', 'owner'] },
  { to: '/trial', icon: '🧪', label: '试住评估', roles: ['manager', 'caregiver', 'owner'] },
  { to: '/care', icon: '💊', label: '照护记录', roles: ['manager', 'caregiver', 'owner', 'hospital'] },
  { to: '/incidents', icon: '🚨', label: '异常协同', roles: ['manager', 'caregiver', 'owner', 'hospital'] },
  { to: '/rooms', icon: '🏨', label: '房间风险看板', roles: ['manager', 'caregiver'] },
  { to: '/handovers', icon: '🔄', label: '班次交接', roles: ['manager', 'caregiver'] },
  { to: '/checkout', icon: '🧾', label: '接回结算', roles: ['manager'] },
  { to: '/summary', icon: '📑', label: '护理交接摘要', roles: ['owner', 'manager'] },
]

function Shell() {
  const user = useStore((s) => s.users.find((u) => u.id === s.currentUserId))
  const logout = useStore((s) => s.logout)
  const resetDemo = useStore((s) => s.resetDemo)
  const loc = useLocation()
  const nav = useNavigate()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />

  const items = NAV.filter((n) => n.roles.includes(user.role))

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="paw">🐾</span><span className="txt">暖爪寄养照护</span></div>
        <div className="brand-sub">试住评估 · 喂药记录 · 风险协同</div>
        <nav>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span>{n.icon}</span><span className="label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="role-tag">
          <span className="badge badge-amber">{ROLE_LABEL[user.role]}</span>
        </div>
        <div className="who">
          <div className="meta">
            <div style={{ color: '#f3f4f6', fontWeight: 600 }}>{user.name}</div>
            <div style={{ color: '#9ca3af' }}>@{user.username}</div>
            {user.hospital && <div style={{ color: '#9ca3af' }}>{user.hospital}</div>}
          </div>
          <button className="btn-secondary btn-sm" onClick={() => { logout(); nav('/login') }}>退出登录</button>
          <button
            className="btn-link small"
            style={{ marginTop: 6, color: '#9ca3af' }}
            onClick={() => { if (confirm('确定恢复演示数据？你新增的记录将被清空。')) { resetDemo(); location.reload() } }}
          >
            恢复演示数据
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="small muted">城市宠物寄养试住评估与喂药记录平台 · 演示日期 2026-09-12（周六）</div>
          <div className="small muted">在住宠物健康与风险，围绕同一只宠物协同</div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/booking/new" element={<BookingForm />} />
            <Route path="/trial" element={<TrialEvaluation />} />
            <Route path="/care" element={<CareTimeline />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/rooms" element={<RoomRisk />} />
            <Route path="/handovers" element={<ShiftHandover />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/summary" element={<OwnerSummary />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const currentUserId = useStore((s) => s.currentUserId)
  return (
    <Routes>
      <Route path="/login" element={currentUserId ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={<Shell />} />
    </Routes>
  )
}
