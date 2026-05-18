import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={collapsed} />

      <div className="flex flex-1 flex-col min-w-0">
        <Topbar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-screen-2xl p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
