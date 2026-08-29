import { createFileRoute } from '@tanstack/react-router'

import { USFMRenderer } from '#/components/usfm'
import firstJohn from '#/data/usfm-source/web/92-1JNeng-web-c.usfm?raw'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="min-h-screen bg-[#f5efe5] px-5 py-12 sm:px-10 sm:py-20">
      <div className="mx-auto max-w-3xl rounded-sm border border-[#ded2c1] bg-[#fffdf8] px-6 py-12 shadow-[0_2rem_5rem_rgb(67_47_26_/_0.08)] sm:px-14 sm:py-16">
        <p className="mb-4 text-center font-sans text-xs font-bold tracking-[0.2em] text-[#9a5736] uppercase">
          World English Bible
        </p>
        <USFMRenderer usfm={firstJohn} />
      </div>
    </main>
  )
}
