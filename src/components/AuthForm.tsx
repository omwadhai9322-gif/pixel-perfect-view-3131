import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function AuthForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) toast.error(error.message);
      else if (!data.session) toast.success("Check your email to confirm your account.");
    }
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-accent" />
          <span className="font-mono text-lg font-bold tracking-tight">ROOMBOARD</span>
        </div>
        <p className="label-mono">{mode === "in" ? "Owner sign in" : "Create owner account"}</p>
        <div>
          <label className="label-mono mb-1 block">Email</label>
          <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label-mono mb-1 block">Password</label>
          <input className="field" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button disabled={busy} className="w-full rounded-md bg-primary py-2 font-mono text-xs font-bold uppercase tracking-wide text-primary-foreground hover:bg-accent disabled:opacity-50">
          {mode === "in" ? "Sign in" : "Sign up"}
        </button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full font-mono text-xs text-muted-foreground hover:text-foreground">
          {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
