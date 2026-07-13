import { useState, useEffect } from 'react'

const BREAKPOINT_VENTANA = 768  // ventana angosta de escritorio (sin touch): resize normal de navegador
const BREAKPOINT_TACTIL  = 600  // lado corto para diferenciar TELÉFONO de TABLET (dispositivos táctiles)

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
  const tactil = esTactil()
  return {
    ancho,
    alto,
    // Táctil (celu/tablet): decide por el LADO CORTO del dispositivo, no por el ancho actual.
    //   Así un celu acostado sigue siendo "móvil" (mismo lado corto en cualquier orientación),
    //   y una tablet (aunque esté angosta en portrait) NO cae en el umbral de teléfono.
    // No táctil (PC/notebook): decide por el ancho de la ventana, como un resize normal.
    esMovil: tactil ? (ladoCorto < BREAKPOINT_TACTIL) : (ancho < BREAKPOINT_VENTANA),
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