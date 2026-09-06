export default function VerifyRequestPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-8 text-center">
      <h1 className="text-lg font-semibold">Check your email</h1>
      <p className="text-sm text-slate-600">
        If that address has an account, a one-time sign-in link is on its way.
        It expires in 10 minutes and can only be used once.
      </p>
    </main>
  );
}
