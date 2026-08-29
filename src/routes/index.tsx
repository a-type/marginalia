import { createFileRoute } from '@tanstack/react-router'

import { USFMRenderer } from '#/components/usfm'
import firstJohn from '#/data/usfm-source/web/92-1JNeng-web-c.usfm?raw'
import cls from './index.module.css'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className={cls.root}>
      <div className={cls.card}>
        <p className={cls.label}>World English Bible</p>
        <USFMRenderer usfm={firstJohn} />
      </div>
    </main>
  )
}
