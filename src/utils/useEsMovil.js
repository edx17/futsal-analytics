import { useState, useEffect } from 'react'

const BREAKPOINT = 768

// ¿El input primario es táctil? (celu/tablet = coarse; notebook con trackpad = fine)
function esTactil() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia) return window.matchMedia('(pointer: coarse)').matches
  return (navigator.maxTouchPoints || 0) > 0
}

function medir() {
  if (typeof window === 'undefined') return { esMovil: false, ancho: 1024, alto: 768 }
  const ancho = window.innerWidth
  const alto = window.innerHeight
  const ladoCorto = Math.min(ancho, alto)
  return {
    ancho,
    alto,
    // Móvil si:
    //  - la ventana es angosta (ancho < 768): cubre celu vertical y ventanas chicas de PC.
    //  - O es táctil con lado corto de teléfono (< 768): cubre el CELU ACOSTADO.
    // La tablet (lado corto = 768) NO entra: se comporta como PC en ambas orientaciones.
    // La notebook (no táctil) tampoco, aunque tenga la ventana bajita.
    esMovil: ancho < BREAKPOINT || (esTactil() && ladoCorto < BREAKPOINT),
  }
}

/** Hook principal (booleano). Un solo listener debounced para toda la app. */
export function useEsMovil() {
  const [esMovil, setEsMovil] = useState(() => medir().esMovil)

  useEffect(() => {
    let t
    const check = () => {
      clearTimeout(t)
      t = setTimeout(() => setEsMovil(medir().esMovil), 150)
    }
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return esMovil
}

/** Hook extendido (opcional): incluye orientación. No lo necesitás para las 6 pantallas actuales. */
export function useDispositivo() {
  const build = () => {
    const m = medir()
    return { ...m, esPortrait: m.alto >= m.ancho, esLandscape: m.ancho > m.alto }
  }
  const [estado, setEstado] = useState(build)

  useEffect(() => {
    let t
    const check = () => {
      clearTimeout(t)
      t = setTimeout(() => setEstado(build()), 150)
    }
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return estado
}

export default useEsMovil