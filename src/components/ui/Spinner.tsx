import React from 'react'
import clsx from 'clsx'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

export default function Spinner({ size = 'md', className, label }: SpinnerProps) {
  const sizeMap = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }

  return (
    <div className={clsx('flex flex-col items-center justify-center gap-4', className)}>
      <div
        className={clsx(
          'border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin',
          sizeMap[size]
        )}
      />
      {label && <p className="text-gray-300">{label}</p>}
    </div>
  )
}
