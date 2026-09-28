import React from 'react'
import clsx from 'clsx'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export default function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-gray-800 border border-gray-700 rounded-lg p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div className={clsx('mb-4 pb-4 border-b border-gray-700', className)} {...props}>
      {children}
    </div>
  )
}

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode
}

export function CardTitle({ className, children, ...props }: CardTitleProps) {
  return (
    <h2 className={clsx('text-xl font-bold', className)} {...props}>
      {children}
    </h2>
  )
}

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function CardContent({ className, children, ...props }: CardContentProps) {
  return (
    <div className={clsx('', className)} {...props}>
      {children}
    </div>
  )
}
