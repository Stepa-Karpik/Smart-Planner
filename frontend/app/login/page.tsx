import { headers } from "next/headers"
import { redirect } from "next/navigation"

export default async function LoginPage() {
  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "planner.nerior.ru"
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https"
  const returnTo = encodeURIComponent(`${proto}://${host}/today`)

  redirect(`https://auth.nerior.ru/login?return_to=${returnTo}`)
}
