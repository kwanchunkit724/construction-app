import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it('renders the planned marker and fills to actual %', () => {
    const { container } = render(
      <ProgressBar value={60} planned={80} status="in-progress" />,
    )
    expect(screen.getByLabelText('計劃進度')).toHaveStyle({ left: '80%' })
    const fill = container.querySelector('.bg-blue-500') as HTMLElement
    expect(fill).toBeTruthy()
    expect(fill.style.width).toBe('60%')
  })

  it('clamps value and planned at 100%', () => {
    const { container } = render(
      <ProgressBar value={150} planned={120} status="completed" />,
    )
    expect(screen.getByLabelText('計劃進度')).toHaveStyle({ left: '100%' })
    const fill = container.querySelector('.bg-green-500') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })
})
