import { Geist, Geist_Mono, Inter } from "next/font/google"
import Link from "next/link"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import ProxyBandwidthIndicator from "@/components/ProxyBandwidthIndicator"
import { cn } from "@workspace/ui/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

import { Toaster } from "react-hot-toast";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider>
          <header className="relative z-20 border-b border-white/10 bg-slate-950 text-slate-100">
            <nav aria-label="Main navigation" className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
              <Link href="/" className="shrink-0 rounded-sm text-base font-semibold tracking-tight transition-colors hover:text-purple-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-400">
                Clipper
              </Link>
              <ProxyBandwidthIndicator />
            </nav>
          </header>
          {children}
          <Toaster 
            position="top-center" 
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1e293b',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)'
              }
            }} 
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
