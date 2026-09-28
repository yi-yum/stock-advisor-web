import React from 'react'
import clsx from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export default function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={clsx(
        'w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg',
        'text-white placeholder-gray-400',
        'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50',
        'transition-colors',
        className
      )}
      {...props}
    />
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={clsx(
        'w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg',
        'text-white placeholder-gray-400',
        'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50',
        'transition-colors resize-vertical',
        className
      )}
      {...props}
    />
  )
}
