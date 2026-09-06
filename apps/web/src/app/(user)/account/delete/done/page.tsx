export default function AccountDeletionQueuedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-8 text-center">
      <h1 className="text-lg font-semibold">Deletion queued</h1>
      <p className="text-sm text-slate-600">
        Your account is disabled and signed out everywhere. Deletion will
        complete within 24 hours.
      </p>
    </main>
  );
}
