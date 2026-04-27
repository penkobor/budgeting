import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Ledger } from '@/pages/Ledger'
import { RecurringPage } from '@/pages/Recurring'
import { CategoriesPage } from '@/pages/Categories'
import { SettingsPage } from '@/pages/Settings'
import { AuthPage } from '@/pages/AuthPage'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import { ToastHost } from '@/components/ui/Toast'

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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Gate />
      </HashRouter>
      <ToastHost />
    </QueryClientProvider>
  )
}

export default App
