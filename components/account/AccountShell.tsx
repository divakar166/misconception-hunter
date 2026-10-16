import Image from 'next/image';
import Link from 'next/link';
import { SignOutButton } from './SignOutButton';

const linkClass =
  'rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground';

export function AccountShell({
  email,
  title,
  children,
}: {
  email?: string | null;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/agora-logo-mark.svg" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold tracking-[-0.025em]">Misconception Hunter</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/" className={linkClass}>New session</Link>
          <Link href="/history" className={linkClass}>History</Link>
          <Link href="/memory" className={linkClass}>Memory</Link>
          {email && <SignOutButton className={linkClass} />}
        </nav>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {email && <p className="mt-1 text-sm text-muted-foreground">{email}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
