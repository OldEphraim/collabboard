'use client'

import { createContext, useContext } from 'react'

export const HighContrastContext = createContext<boolean>(false)

export function useHighContrast(): boolean {
  return useContext(HighContrastContext)
}
