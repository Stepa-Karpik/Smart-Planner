"use client"

import { useEffect, useState } from "react"
import { Toaster } from "@/components/ui/sonner"

export function AppToaster() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return <Toaster position="bottom-right" richColors closeButton />
}
