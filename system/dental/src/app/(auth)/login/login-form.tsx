"use client"

import { useActionState } from "react"
import { Stethoscope, TriangleAlert } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { loginAction, type LoginState } from "@/lib/actions/auth"
import { useI18n } from "@/components/lang-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const initialState: LoginState = { error: null }

export function LoginForm() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const next = searchParams.get("next")

  const [state, formAction, pending] = useActionState(loginAction, initialState)

  const errorMessage =
    state.error === "account_disabled"
      ? t.auth.accountDisabled
      : state.error === "invalid_credentials"
        ? t.auth.invalidCredentials
        : null

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Stethoscope className="h-6 w-6" />
        </div>
        <CardTitle className="text-xl">{t.auth.welcomeBack}</CardTitle>
        <CardDescription>{t.app.clinicName}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-2">
            <Label htmlFor="username">{t.auth.username}</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              dir="ltr"
              autoFocus
              required
              placeholder="demo"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t.auth.password}</Label>
              <span className="text-xs text-muted-foreground">{t.auth.forgotPassword}</span>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t.auth.signingIn : t.auth.signIn}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}