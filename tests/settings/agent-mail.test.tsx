// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/components/i18n/LocaleProvider'
import type { MailStatus } from '@/lib/satellite/mail'

const setMailSwitchAction = vi.fn()
const disconnectGmailAction = vi.fn()
vi.mock('@/app/(app)/settings/actions', () => ({
  setMailSwitchAction: (...a: unknown[]) => setMailSwitchAction(...a),
  disconnectGmailAction: (...a: unknown[]) => disconnectGmailAction(...a),
}))

const { AgentMail } = await import('@/components/settings/AgentMail')

beforeEach(() => {
  setMailSwitchAction.mockReset().mockResolvedValue({ ok: true })
  disconnectGmailAction.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

const status = (over: Partial<MailStatus> = {}): MailStatus => ({
  state: 'connected',
  account: 'ana@gmail.com',
  readAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  alerts: true,
  outcomes: true,
  drafts: false,
  ...over,
})
const show = (locale: 'es' | 'en', mail: MailStatus) =>
  render(
    <LocaleProvider locale={locale}>
      <AgentMail mail={mail} />
    </LocaleProvider>,
  )

describe('AgentMail (Ajustes → Agente → Correo)', () => {
  it('connected: the state text, the account and three switches as stored', () => {
    show('es', status())
    expect(screen.getByText(/^Gmail conectado · leído hace 12 min/)).toBeTruthy()
    expect(screen.getByText('ana@gmail.com')).toBeTruthy()
    const sw = (name: string) => screen.getByRole('switch', { name }).getAttribute('aria-checked')
    expect(sw('Alertas de LinkedIn')).toBe('true')
    expect(sw('Respuestas de empresas')).toBe('true')
    expect(sw('Borradores de seguimiento')).toBe('false')
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeTruthy()
  })

  it('never connected: tells where to connect, no switches', () => {
    show('es', status({ state: 'never', account: null, readAt: null }))
    expect(
      screen.getByText('Gmail no está conectado. En la Mac, ejecuta: npm run gmail:connect'),
    ).toBeTruthy()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Desconectar' })).toBeNull()
  })

  it('revoked by Google: says so', () => {
    show('es', status({ state: 'revoked' }))
    expect(screen.getByText('Google desconectó Gmail. Vuelve a conectarlo.')).toBeTruthy()
  })

  it('English texts', () => {
    show('en', status({ state: 'never', account: null, readAt: null }))
    expect(
      screen.getByText("Gmail isn't connected. On the Mac, run: npm run gmail:connect"),
    ).toBeTruthy()
  })

  it('a switch writes at once and rolls back when refused', async () => {
    show('es', status())
    const drafts = screen.getByRole('switch', { name: 'Borradores de seguimiento' })
    await act(async () => {
      fireEvent.click(drafts)
    })
    expect(setMailSwitchAction).toHaveBeenCalledWith('mailDrafts', true)
    expect(drafts.getAttribute('aria-checked')).toBe('true')

    setMailSwitchAction.mockResolvedValue({ ok: false, code: 'agent-unavailable', error: 'x' })
    await act(async () => {
      fireEvent.click(drafts)
    })
    expect(drafts.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch('base de datos del agente')
  })

  it('Desconectar asks, then points at myaccount to finish', async () => {
    show('es', status())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
    })
    expect(disconnectGmailAction).toHaveBeenCalledOnce()
    expect(screen.getByText(/Desconectando. El agente quita su acceso/)).toBeTruthy()
    const link = screen.getByRole('link', { name: 'myaccount.google.com' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/myaccount\.google\.com\//)
    expect(screen.queryByRole('button', { name: 'Desconectar' })).toBeNull()
  })

  it('a request already pending shows as disconnecting from the start', () => {
    show('es', status({ state: 'disconnecting' }))
    expect(screen.getByText(/Desconectando/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desconectar' })).toBeNull()
  })

  it('names no raw colour', () => {
    for (const f of [
      'components/settings/AgentMail.tsx',
      'components/today/MailSuggestions.tsx',
      'components/application/MailThread.tsx',
      'components/application/InterviewCard.tsx',
      'components/application/YouList.tsx',
    ]) {
      expect(readFileSync(f, 'utf8')).not.toMatch(
        /#[0-9a-fA-F]{3,8}\b|rgba?\(|var\(--(graphite|amber)/,
      )
    }
  })
})
