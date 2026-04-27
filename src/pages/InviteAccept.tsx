import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useConsumeInvite } from '@/hooks/spaces'

export function InviteAcceptPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const consume = useConsumeInvite()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current || !token) return
    fired.current = true
    consume.mutate(token)
  }, [token, consume])

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card p-6 md:p-8 max-w-md w-full text-center space-y-4">
        {consume.isPending && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-fg-subtle mx-auto" />
            <div className="text-sm text-fg-muted">Joining space…</div>
          </>
        )}
        {consume.isSuccess && consume.data && (
          <>
            <CheckCircle2 className="w-10 h-10 text-positive mx-auto" />
            <h1 className="text-xl font-semibold">Welcome to {consume.data.name}!</h1>
            <button onClick={() => navigate(`/spaces/${consume.data.id}`)} className="btn-primary w-full">
              Open space
            </button>
          </>
        )}
        {consume.isError && (
          <>
            <AlertTriangle className="w-10 h-10 text-negative mx-auto" />
            <h1 className="text-lg font-semibold">Couldn't accept invite</h1>
            <p className="text-sm text-fg-muted">{(consume.error as Error).message}</p>
            <Link to="/settings" className="btn-outline w-full">Back to settings</Link>
          </>
        )}
      </div>
    </div>
  )
}
