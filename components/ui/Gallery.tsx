'use client'

import { useState } from 'react'
import { useT } from '@/components/i18n/LocaleProvider'
import { Chip } from './Chip'
import { HeroStat } from './HeroStat'
import {
  IconAddNumber,
  IconAnalyse,
  IconCheck,
  IconChevron,
  IconClose,
  IconCopy,
  IconDownload,
  IconEdit,
  IconFind,
  IconImport,
  IconInfo,
  IconPipeline,
  IconPlus,
  IconRegenerate,
  IconSettings,
  IconStack,
  IconToday,
  IconVerified,
} from './icons'
import { Narrative } from './Narrative'
import { Segmented } from './Segmented'
import { Sheet } from './Sheet'

export function Gallery() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a')
  return (
    <div className="gallery">
      <h1>{t('gallery.title')}</h1>
      <section>
        <h2>Icons</h2>
        <ul className="gallery-icons">
          <li>
            <IconToday /> Today
          </li>
          <li>
            <IconPipeline /> Pipeline
          </li>
          <li>
            <IconAnalyse /> Analyse
          </li>
          <li>
            <IconSettings /> Settings
          </li>
          <li>
            <IconChevron /> Next
          </li>
          <li>
            <IconChevron flip /> Previous
          </li>
          <li>
            <IconClose /> Close
          </li>
          <li>
            <IconInfo /> More
          </li>
          <li>
            <IconEdit /> Edit
          </li>
          <li>
            <IconCheck /> Done
          </li>
          <li>
            <IconAddNumber /> Add a number
          </li>
          <li>
            <IconPlus /> Add
          </li>
          <li>
            <IconImport /> Import
          </li>
          <li>
            <IconDownload /> Download
          </li>
          <li>
            <IconCopy /> Copy
          </li>
          <li>
            <IconRegenerate /> Regenerate
          </li>
          <li>
            <IconStack /> Evidence used
          </li>
          <li>
            <IconFind /> Show in the PDF
          </li>
          <li>
            <IconVerified /> Verified
          </li>
        </ul>
      </section>
      <section>
        <h2>Chip</h2>
        <ul className="chips">
          <li>
            <Chip tone="strong" toneLabel={t('strengthOf.strong')} onClick={() => setOpen(true)}>
              Amazon Ads
            </Chip>
          </li>
          <li>
            <Chip tone="partial" toneLabel={t('strengthOf.partial')} onClick={() => setOpen(true)}>
              Amazon PPC
            </Chip>
          </li>
          <li>
            <Chip tone="missing" toneLabel={t('strengthOf.none')} onClick={() => setOpen(true)}>
              Bulksheets
            </Chip>
          </li>
          <li>
            <Chip
              tone="unjudged"
              toneLabel={t('verdict.unjudgedOne')}
              onClick={() => setOpen(true)}
            >
              Residencia en CDMX
            </Chip>
          </li>
          <li>
            <Chip tone="neutral">
              Una palabra clave muy larga que tiene que partirse dentro del chip sin desbordar
            </Chip>
          </li>
        </ul>
      </section>
      <section>
        <h2>Segmented</h2>
        <Segmented
          label="Filtro"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'a', label: 'Todo · 33' },
            { value: 'b', label: 'Sin número · 4' },
            { value: 'c', label: 'Solo CV · 7' },
          ]}
        />
      </section>
      <section>
        <h2>HeroStat</h2>
        <HeroStat
          value="19%"
          label="5 de 27 reciben respuesta"
          series={[10, 12, null, 15, 14, 18, 19, 19]}
          delta="+4 pts"
        />
        <HeroStat value="—" label={t('today.rateTooFew')} delta={null} />
      </section>
      <section>
        <h2>Narrative</h2>
        <Narrative>
          Dos cosas te esperan y siete postulaciones siguen en su tiempo normal de respuesta.
        </Narrative>
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} title="Amazon PPC">
        <p>Detalle de ejemplo.</p>
      </Sheet>
    </div>
  )
}
