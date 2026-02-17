"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-store"
import { useI18n } from "@/lib/i18n"

export default function RegisterPage() {
  const router = useRouter()
  const { signUp } = useAuth()
  const { tr } = useI18n()

  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    const { success, error } = await signUp(email, username, password)
    setLoading(false)

    if (!success) {
      toast.error(error || tr("Registration failed", "Ошибка регистрации"))
      return
    }
    toast.success(tr("Account created", "Аккаунт создан"))
    router.push("/today")
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{tr("Create account", "Создать аккаунт")}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{tr("Register to start planning your schedule", "Зарегистрируйтесь, чтобы начать планировать расписание")}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{tr("Email", "Email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="h-11 rounded-lg border-border bg-muted/50 px-3.5"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="username">{tr("Username", "Username")}</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              className="h-11 rounded-lg border-border bg-muted/50 px-3.5"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{tr("Password", "Пароль")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="h-11 rounded-lg border-border bg-muted/50 px-3.5 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? tr("Hide password", "Скрыть пароль") : tr("Show password", "Показать пароль")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="mt-1 h-11 rounded-lg bg-foreground text-background hover:bg-foreground/90">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr("Create account", "Создать аккаунт")}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {tr("Already have an account?", "Уже есть аккаунт?")}{" "}
          <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
            {tr("Sign in", "Войти")}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
