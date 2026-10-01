import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Logo } from "../components/Logo";
import { Button, ErrorNote, Field, inputClass } from "../components/ui";

const REMEMBER_KEY = "sic_remember_email";

const demos = [
  { role: "Supervisor", email: "supervisor@aseo.com" },
  { role: "Coordinador", email: "coordinador@aseo.com" },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const remembered = localStorage.getItem(REMEMBER_KEY);
  const [email, setEmail] = useState(remembered || "supervisor@aseo.com");
  const [password, setPassword] = useState("demo");
  const [remember, setRemember] = useState(Boolean(remembered));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, email);
      else localStorage.removeItem(REMEMBER_KEY);
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ingresar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-dark px-12 py-12 text-white lg:flex">
        <div className="absolute -left-16 top-24 h-56 w-56 rounded-full bg-cyan/20 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
        <Logo className="relative h-28 w-auto max-w-xs" />
        <div className="relative">
          <h1 className="max-w-md text-4xl font-extrabold leading-tight">Supervisión Inteligente de Servicios en Campo</h1>
          <p className="mt-4 max-w-md text-lg text-slate-200">Supervisión inteligente. Operaciones bajo control.</p>
        </div>
        <p className="relative text-sm text-slate-400">FieldCheck</p>
      </section>

      <section className="flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-md">
          <Logo className="mb-6 h-20 w-auto lg:hidden" />
          <h2 className="text-2xl font-extrabold text-brand-dark">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-muted">Usa una cuenta de demostración. La contraseña es demo.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Correo">
              <input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
            </Field>
            <Field label="Contraseña">
              <input className={inputClass} value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 accent-cyan" />
              Recordar sesión
            </label>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button className="w-full" disabled={busy}>{busy ? "Ingresando…" : "Iniciar sesión"}</Button>
          </form>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {demos.map((demo) => (
              <button
                key={demo.email}
                type="button"
                onClick={() => {
                  setEmail(demo.email);
                  setPassword("demo");
                }}
                className="rounded-xl border border-line bg-sand px-3 py-3 text-left text-sm hover:border-cyan"
              >
                <span className="block font-semibold">{demo.role}</span>
                <span className="text-muted">{demo.email}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
