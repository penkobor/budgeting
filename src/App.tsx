import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Ledger } from '@/pages/Ledger'
import { RecurringPage } from '@/pages/Recurring'
import { CategoriesPage } from '@/pages/Categories'
import { AssetsPage } from '@/pages/Assets'
import { SettingsPage } from '@/pages/Settings'
import { PublicSharePage } from '@/pages/PublicShare'
import { AuthPage } from '@/pages/AuthPage'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import { ToastHost } from '@/components/ui/Toast'
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

function Gate() {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-fg-subtle" />
      </div>
    )
  }
  if (!session) return <AuthPage />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

/**
 * Top-level router: the public share route lives OUTSIDE the auth gate so
 * unauthenticated visitors can view a published page. Everything else flows
 * through `Gate` which redirects to AuthPage when no session exists.
 */
function TopRoutes() {
  return (
    <Routes>
      <Route path="/share/:slug" element={<PublicSharePage />} />
      <Route path="*" element={<Gate />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* `reducedMotion="user"` makes every framer-motion animation honour the
         OS-level `prefers-reduced-motion: reduce` setting, complementing the
         CSS-level reset in `index.css`. */}
      <MotionConfig reducedMotion="user">
        <ConfirmDialogProvider>
          <HashRouter>
            <TopRoutes />
          </HashRouter>
          <ToastHost />
        </ConfirmDialogProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}

export default App
