import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { TablaResponsive } from '../components/TablaResponsive';
import PaymentSelector from '../components/PaymentSelector';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';

function Tesoreria() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const clubId = perfil?.club_id || localStorage.getItem('club_id');

  // ==========================================
  // 1. SEGURIDAD Y ACCESO
  // ==========================================
  const rol = perfil?.rol?.toLowerCase() || '';
  const accesoPermitido = ['admin', 'tesorero', 'superuser'].includes(rol);

  // ==========================================
  // 2. MÁQUINA DEL TIEMPO (PERIODO GLOBAL)
  // ==========================================
  const hoy = new Date();
  const [periodo, setPeriodo] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`);
  const añoSeleccionado = periodo.substring(0, 4);
  const mesSeleccionado = periodo.substring(5, 7);
  
  const objMesVencido = new Date(añoSeleccionado, Number(mesSeleccionado) - 1, 1);
  objMesVencido.setMonth(objMesVencido.getMonth() - 1);
  const nombreMesVencido = objMesVencido.toLocaleString('es-ES', { month: 'long' }).toUpperCase();

  // Estados UI
  const [vista, setVista] = useState('cobros'); 
  const [categoria, setCategoria] = useState('Primera');
  const [cargando, setCargando] = useState(false);

  // Datos
  const [jugadoresInfo, setJugadoresInfo] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [cajaCompleta, setCajaCompleta] = useState([]);
  const [balance, setBalance] = useState({ ingresos: 0, egresos: 0 });
  const [datosReporte, setDatosReporte] = useState(null);

  // Configuración Bancaria
  const [modalConfig, setModalConfig] = useState(false);
  const [formConfig, setFormConfig] = useState({ alias_cobro: '', cbu: '', cvu: '', whatsapp_tesoreria: '' });

  // Modales
  const [modalPago, setModalPago] = useState({ visible: false, deuda: null, jugador: null });
  const [montoPagar, setMontoPagar] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');

  // 🚀 NUEVO MODAL: Gestión de Detalles de Deuda (Para poder eliminar)
  const [modalDetalleDeuda, setModalDetalleDeuda] = useState({ visible: false, jugador: null, deudas: [] });

  const [modalGenerar, setModalGenerar] = useState(false);
  const [formCuota, setFormCuota] = useState({
    concepto: `Cuota ${new Date(añoSeleccionado, Number(mesSeleccionado)-1, 1).toLocaleString('es-ES', { month: 'long' }).toUpperCase()} ${añoSeleccionado}`,
    monto: '', vencimiento: `${periodo}-10`,
    mes: periodo
  });

  const [modalEmpleado, setModalEmpleado] = useState(false);
  const [formEmpleado, setFormEmpleado] = useState({ id: null, nombre_completo: '', rol: '', sueldo_base: '', jugador_id: '' });

  const [modalSueldo, setModalSueldo] = useState({ visible: false, empleado: null });
  const [formSueldo, setFormSueldo] = useState({ monto: '', cajaOrigen: 'Efectivo', descripcion: '' });

  const [modalGasto, setModalGasto] = useState(false);
  const [formGasto, setFormGasto] = useState({ categoria: 'Alquiler Cancha', monto: '', descripcion: '', cajaOrigen: 'Efectivo' });

  const [modalIngresoExtra, setModalIngresoExtra] = useState(false);
  const [formIngresoExtra, setFormIngresoExtra] = useState({ categoria: 'Bufet / Cantina', monto: '', descripcion: '', metodo_pago: 'Efectivo' });

  useEffect(() => {
    if (clubId && accesoPermitido) {
      cargarConfigBancaria();
      if (vista === 'cobros') cargarTableroCobros();
      if (vista === 'staff' || vista === 'viaticos') cargarEmpleados();
      if (vista === 'egresos') cargarEgresosYBalance();
      if (vista === 'reportes') cargarReportes();
    }
  }, [categoria, vista, clubId, periodo, accesoPermitido]);

  useEffect(() => {
    setFormCuota(prev => ({
      ...prev,
      concepto: `Cuota ${new Date(añoSeleccionado, Number(mesSeleccionado)-1, 1).toLocaleString('es-ES', { month: 'long' }).toUpperCase()} ${añoSeleccionado}`,
      mes: periodo,
      vencimiento: `${periodo}-10`
    }));
  }, [periodo, añoSeleccionado, mesSeleccionado]);

  // ==========================================
  // LÓGICA: ELIMINACIÓN DE REGISTROS ERRÓNEOS
  // ==========================================
  const eliminarDeuda = async (deuda) => {
    // 🛡️ REGLA DE INTEGRIDAD: No eliminar si hay pagos parciales asociados.
    if (Number(deuda.monto_pagado) > 0) {
      return showToast("La deuda tiene pagos parciales. No se puede eliminar directamente.", "error");
    }

    if (!window.confirm(`¿Confirmás la eliminación del concepto "${deuda.concepto}"?\n\nEsta acción no se puede deshacer y borrará la obligación de pago del jugador.`)) return;
    
    setCargando(true);
    try {
      const { error } = await supabase.from('tesoreria_deudas').delete().eq('id', deuda.id);
      if (error) throw error;
      
      showToast("Deuda eliminada del sistema.", "success");
      
      // Actualizamos el modal local para que desaparezca la fila
      setModalDetalleDeuda(prev => ({
        ...prev,
        deudas: prev.deudas.filter(d => d.id !== deuda.id)
      }));
      
      cargarTableroCobros();
    } catch (err) {
      console.error(err);
      showToast("Error al eliminar la deuda.", "error");
    } finally {
      setCargando(false);
    }
  };

  const eliminarMovimientoLibroMayor = async (movId) => {
    if (!window.confirm("¿Seguro que querés eliminar este registro?\n\nSi es un pago de staff/viático, el empleado volverá a figurar como pendiente. Esto afectará el flujo de caja global.")) return;
    
    setCargando(true);
    try {
      let tabla = '';
      let idReal = '';

      if (movId.startsWith('eg-')) {
        tabla = 'tesoreria_egresos';
        idReal = movId.replace('eg-', '');
      } else if (movId.startsWith('ext-')) {
        tabla = 'tesoreria_ingresos_extra';
        idReal = movId.replace('ext-', '');
      } else {
        showToast("Por seguridad, los pagos de cuotas y sponsors no se pueden eliminar desde aquí.", "info");
        setCargando(false);
        return;
      }

      const { error } = await supabase.from(tabla).delete().eq('id', idReal);
      if (error) throw error;

      showToast("Movimiento eliminado exitosamente.", "success");
      cargarEgresosYBalance();
    } catch (err) {
      console.error(err);
      showToast("Error al eliminar el registro.", "error");
    } finally {
      setCargando(false);
    }
  };

  // ==========================================
  // RESTO DE LA LÓGICA (MANTENIDA INTACTA)
  // ==========================================
  const cargarConfigBancaria = async () => {
    try {
      const { data, error } = await supabase.from('clubes').select('alias_cobro, cbu, cvu, whatsapp_tesoreria').eq('id', clubId).single();
      if (!error && data) {
        setFormConfig({ alias_cobro: data.alias_cobro || '', cbu: data.cbu || '', cvu: data.cvu || '', whatsapp_tesoreria: data.whatsapp_tesoreria || '' });
      }
    } catch (err) { console.error("Error cargando config bancaria", err); }
  };

  const guardarConfigBancaria = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.from('clubes').update({
        alias_cobro: formConfig.alias_cobro.trim(), cbu: formConfig.cbu.trim(), cvu: formConfig.cvu.trim(), whatsapp_tesoreria: formConfig.whatsapp_tesoreria.trim()
      }).eq('id', clubId);
      if (error) throw error;
      showToast("Datos bancarios actualizados.", "success");
      setModalConfig(false);
    } catch (err) { showToast("Error al guardar datos bancarios.", "error"); } finally { setCargando(false); }
  };

  const enviarWhatsApp = (jugador, deudaTotal) => {
    const msj = `Hola ${jugador.nombre}, te escribimos de Tesorería del Club. Figuras con un saldo pendiente de $${deudaTotal.toLocaleString()}. Por favor, acercate para regularizarlo. ¡Abrazo!`;
    const numeroLimpio = jugador.contacto ? String(jugador.contacto).replace(/[^0-9]/g, '') : '';
    const url = numeroLimpio ? `https://api.whatsapp.com/send?phone=${numeroLimpio}&text=${encodeURIComponent(msj)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msj)}`;
    window.open(url, '_blank');
  };

  const cargarReportes = async () => {
    setCargando(true);
    try {
      const lastN = 6; const selYear = Number(añoSeleccionado); const selMonthIndex = Number(mesSeleccionado) - 1; 
      const startDateGrafico = new Date(selYear, selMonthIndex - (lastN - 1), 1);
      const startDateYTD = new Date(selYear, 0, 1); 
      const fetchStartDate = startDateGrafico < startDateYTD ? startDateGrafico : startDateYTD;
      const endDate = new Date(selYear, selMonthIndex + 1, 0); 
      const startStr = fetchStartDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const { data: pagos } = await supabase.from('tesoreria_pagos').select('monto, fecha_pago, metodo_pago').eq('club_id', clubId).gte('fecha_pago', startStr).lte('fecha_pago', endStr);
      const { data: pagosSponsors } = await supabase.from('sponsors_pagos').select('monto, fecha_pago').eq('club_id', clubId).gte('fecha_pago', startStr).lte('fecha_pago', endStr);
      const { data: ingresosExtras } = await supabase.from('tesoreria_ingresos_extra').select('monto, fecha').eq('club_id', clubId).gte('fecha', startStr).lte('fecha', endStr);
      const { data: egresos } = await supabase.from('tesoreria_egresos').select('monto, fecha, categoria').eq('club_id', clubId).gte('fecha', startStr).lte('fecha', endStr);
      const { data: todasDeudas } = await supabase.from('tesoreria_deudas').select('*').eq('club_id', clubId);
      const { data: todosJugadores } = await supabase.from('jugadores').select('id, nombre, apellido').eq('club_id', clubId);

      const monthsArray = [];
      for (let i = lastN - 1; i >= 0; i--) {
        const d = new Date(selYear, selMonthIndex - i, 1);
        monthsArray.push({ ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, name: d.toLocaleString('es-ES', { month: 'short' }).toUpperCase(), year: d.getFullYear() });
      }

      const mesesMap = {};
      monthsArray.forEach(m => { mesesMap[m.ym] = { name: m.name, ingresos: 0, egresos: 0, year: m.year }; });

      pagos?.forEach(p => { const mk = (p.fecha_pago || '').substring(0, 7); if (mesesMap[mk]) mesesMap[mk].ingresos += Number(p.monto || 0); });
      pagosSponsors?.forEach(p => { const mk = (p.fecha_pago || '').substring(0, 7); if (mesesMap[mk]) mesesMap[mk].ingresos += Number(p.monto || 0); });
      ingresosExtras?.forEach(p => { const mk = (p.fecha || '').substring(0, 7); if (mesesMap[mk]) mesesMap[mk].ingresos += Number(p.monto || 0); });

      const gastosPorCat = {};
      egresos?.forEach(e => {
        const mk = (e.fecha || '').substring(0, 7);
        if (mesesMap[mk]) mesesMap[mk].egresos += Number(e.monto || 0);
        if (e.fecha.startsWith(añoSeleccionado)) { gastosPorCat[e.categoria] = (gastosPorCat[e.categoria] || 0) + Number(e.monto); }
      });

      const dataMeses = monthsArray.map(m => ({ name: `${m.name} ${String(m.year).slice(2)}`, ingresos: mesesMap[m.ym].ingresos, egresos: mesesMap[m.ym].egresos }));
      const dataCat = Object.keys(gastosPorCat).map(k => ({ nombre: k, monto: gastosPorCat[k] })).sort((a,b) => b.monto - a.monto);

      const pagosYTD = (pagos || []).filter(p => p.fecha_pago.startsWith(añoSeleccionado));
      const egresosYTD = (egresos || []).filter(e => e.fecha.startsWith(añoSeleccionado));
      const pagosSponsorsYTD = (pagosSponsors || []).filter(p => p.fecha_pago.startsWith(añoSeleccionado));
      const extrasYTD = (ingresosExtras || []).filter(p => p.fecha.startsWith(añoSeleccionado));
      
      const ingresosSponsorsTotal = pagosSponsorsYTD.reduce((acc, p) => acc + Number(p.monto), 0);
      const ingresosExtrasTotal = extrasYTD.reduce((acc, p) => acc + Number(p.monto), 0);
      const ingresosCuotasTotal = pagosYTD.reduce((acc, p) => acc + Number(p.monto), 0);

      const deudaTotalHistorica = (todasDeudas || []).filter(d => ['Pendiente', 'Parcial'].includes(d.estado)).reduce((acc, d) => acc + (d.monto_original - d.monto_pagado), 0);
      const ingresosTotal = ingresosCuotasTotal + ingresosSponsorsTotal + ingresosExtrasTotal;
      const egresosTotal = egresosYTD.reduce((acc, e) => acc + Number(e.monto), 0);
      const cajaReal = ingresosTotal - egresosTotal;

      const deudasEsteAno = todasDeudas?.filter(d => d.mes_correspondiente?.startsWith(añoSeleccionado) && d.estado !== 'Beca') || [];
      const totalExigido = deudasEsteAno.reduce((acc, d) => acc + Number(d.monto_original), 0);
      const totalCobrado = deudasEsteAno.reduce((acc, d) => acc + Number(d.monto_pagado), 0);
      const tasaCobrabilidad = totalExigido > 0 ? Math.round((totalCobrado / totalExigido) * 100) : 0;

      const deudaPorJugador = {};
      (todasDeudas || []).forEach(d => {
        if (['Pendiente', 'Parcial'].includes(d.estado)) {
          if (!deudaPorJugador[d.jugador_id]) deudaPorJugador[d.jugador_id] = 0;
          deudaPorJugador[d.jugador_id] += (Number(d.monto_original) - Number(d.monto_pagado));
        }
      });

      const topMorosos = Object.keys(deudaPorJugador)
        .map(id => { const jug = todosJugadores?.find(j => String(j.id) === String(id)); return { nombre: jug ? `${jug.apellido}, ${jug.nombre}` : 'Jugador Eliminado', deuda: deudaPorJugador[id] }; })
        .sort((a, b) => b.deuda - a.deuda).slice(0, 5); 

      const dataTortaIngresos = [
        { name: 'Cuotas Sociales', value: ingresosCuotasTotal, color: '#3b82f6' },
        { name: 'Sponsors/Subsidios', value: ingresosSponsorsTotal, color: '#a855f7' },
        { name: 'Ingresos Extras', value: ingresosExtrasTotal, color: '#00ff88' }
      ];

      setDatosReporte({ dataMeses, dataCat, deudaTotal: deudaTotalHistorica, ingresosTotal, egresosTotal, cajaReal, tasaCobrabilidad, topMorosos, dataTortaIngresos });
    } catch (err) { showToast("Error al cargar reportes.", "error"); } finally { setCargando(false); }
  };

  const cargarEgresosYBalance = async () => {
    setCargando(true);
    try {
      const primerDia = `${periodo}-01`;
      const ultimoDiaNum = new Date(añoSeleccionado, Number(mesSeleccionado), 0).getDate(); 
      const ultimoDia = `${periodo}-${ultimoDiaNum}`;

      const { data: egresosMes } = await supabase.from('tesoreria_egresos').select('*').eq('club_id', clubId).gte('fecha', primerDia).lte('fecha', ultimoDia);
      const { data: ingresosMes } = await supabase.from('tesoreria_pagos').select('*').eq('club_id', clubId).gte('fecha_pago', primerDia).lte('fecha_pago', ultimoDia);
      const { data: ingSponsorsMes } = await supabase.from('sponsors_pagos').select('*').eq('club_id', clubId).gte('fecha_pago', primerDia).lte('fecha_pago', ultimoDia);
      const { data: listaSponsors } = await supabase.from('sponsors').select('id, nombre').eq('club_id', clubId);
      const { data: ingExtraMes } = await supabase.from('tesoreria_ingresos_extra').select('*').eq('club_id', clubId).gte('fecha', primerDia).lte('fecha', ultimoDia);

      let movimientos = [];

      (egresosMes || []).forEach(e => {
        const textoDetalle = e.responsable && e.responsable !== 'Tesorero/Admin' ? `${e.descripcion || e.categoria} (Abonado a: ${e.responsable})` : e.descripcion || e.categoria;
        movimientos.push({ id: `eg-${e.id}`, fecha: e.fecha, tipo: 'salida', categoria: e.categoria, descripcion: textoDetalle, monto: Number(e.monto) });
      });

      (ingresosMes || []).forEach(i => movimientos.push({ id: `cuota-${i.id}`, fecha: i.fecha_pago, tipo: 'entrada', categoria: 'Cuota Social', descripcion: 'Cobro registrado por sistema', monto: Number(i.monto) }));
      
      (ingSponsorsMes || []).forEach(s => {
        const nombreSponsor = listaSponsors?.find(sp => sp.id === s.sponsor_id)?.nombre || 'Sponsor Desconocido';
        const textoDetalle = s.descripcion ? `${nombreSponsor} - ${s.descripcion}` : `Aporte de ${nombreSponsor}`;
        movimientos.push({ id: `spon-${s.id}`, fecha: s.fecha_pago, tipo: 'entrada', categoria: s.metodo_pago === 'Especie' ? 'Canje / Especie' : 'Sponsor / Subsidio', descripcion: textoDetalle, monto: Number(s.monto) });
      });

      (ingExtraMes || []).forEach(x => movimientos.push({ id: `ext-${x.id}`, fecha: x.fecha, tipo: 'entrada', categoria: x.categoria, descripcion: x.descripcion || 'Ingreso manual', monto: Number(x.monto) }));

      movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

      const totalEgresos = movimientos.filter(m => m.tipo === 'salida').reduce((acc, curr) => acc + curr.monto, 0);
      const totalIngresos = movimientos.filter(m => m.tipo === 'entrada').reduce((acc, curr) => acc + curr.monto, 0);

      setCajaCompleta(movimientos); setBalance({ ingresos: totalIngresos, egresos: totalEgresos });
    } catch (err) { showToast("Error al cargar libro mayor.", "error"); } finally { setCargando(false); }
  };

  const registrarGastoGeneral = async () => {
    const montoNum = parseFloat(formGasto.monto);
    if (!montoNum || montoNum <= 0) return showToast("Ingresá un monto válido.", "error");
    setCargando(true);
    const descDetallada = formGasto.descripcion ? `${formGasto.descripcion} (Vía ${formGasto.cajaOrigen})` : `${formGasto.categoria} (Vía ${formGasto.cajaOrigen})`;

    try {
      const { error } = await supabase.from('tesoreria_egresos').insert([{ club_id: clubId, categoria: formGasto.categoria, monto: montoNum, fecha: new Date().toISOString().split('T')[0], responsable: 'Tesorero/Admin', descripcion: descDetallada }]);
      if (error) throw error;
      showToast("Gasto registrado.", "success");
      setModalGasto(false); setFormGasto({ categoria: 'Alquiler Cancha', monto: '', descripcion: '', cajaOrigen: 'Efectivo' }); cargarEgresosYBalance();
    } catch (err) { showToast("Error al registrar gasto.", "error"); } finally { setCargando(false); }
  };

  const registrarIngresoExtraordinario = async () => {
    const montoNum = parseFloat(formIngresoExtra.monto);
    if (!montoNum || montoNum <= 0) return showToast("Ingresá un monto válido.", "error");
    setCargando(true);
    try {
      const { error } = await supabase.from('tesoreria_ingresos_extra').insert([{ club_id: clubId, categoria: formIngresoExtra.categoria, monto: montoNum, fecha: new Date().toISOString().split('T')[0], descripcion: formIngresoExtra.descripcion || formIngresoExtra.categoria, metodo_pago: formIngresoExtra.metodo_pago }]);
      if (error) throw error;
      showToast("Ingreso extra registrado.", "success");
      setModalIngresoExtra(false); setFormIngresoExtra({ categoria: 'Bufet / Cantina', monto: '', descripcion: '', metodo_pago: 'Efectivo' }); cargarEgresosYBalance();
    } catch (err) { showToast("Error al registrar ingreso extra.", "error"); } finally { setCargando(false); }
  };

  const cargarEmpleados = async () => {
    setCargando(true);
    try {
      const { data: emp } = await supabase.from('tesoreria_empleados').select('*').eq('club_id', clubId).eq('estado', 'Activo').order('rol');
      const primerDia = `${periodo}-01`; const ultimoDiaNum = new Date(añoSeleccionado, Number(mesSeleccionado), 0).getDate(); const ultimoDia = `${periodo}-${ultimoDiaNum}`;
      const { data: pagosMes } = await supabase.from('tesoreria_egresos').select('responsable, fecha, monto, categoria, descripcion').eq('club_id', clubId).gte('fecha', primerDia).lte('fecha', ultimoDia);

      const empleadosConEstado = (emp || []).map(e => {
        const nombreEmpleado = e.nombre_completo?.trim().toLowerCase();
        const pagoSueldo = (pagosMes || []).find(p => (p.categoria === 'Sueldos y Viáticos' || p.categoria === 'Sueldos') && p.responsable?.trim().toLowerCase() === nombreEmpleado && !p.descripcion?.toLowerCase().includes('comisión'));
        const bonosMes = (pagosMes || []).filter(p => p.responsable?.trim().toLowerCase() === nombreEmpleado && p.descripcion?.toLowerCase().includes('comisión')).reduce((acc, curr) => acc + Number(curr.monto), 0);
        return { ...e, pagoEsteMes: pagoSueldo, bonosExtra: bonosMes };
      });

      setEmpleados(empleadosConEstado);
      const { data: jubs } = await supabase.from('jugadores').select('id, nombre, apellido').eq('club_id', clubId).order('apellido');
      setJugadoresInfo(jubs || []);
    } catch (err) { showToast("Error al cargar nómina.", "error"); } finally { setCargando(false); }
  };

  const guardarEmpleado = async () => {
    if (!formEmpleado.nombre_completo || !formEmpleado.rol || !formEmpleado.sueldo_base) return showToast("Completá todos los campos.", "error");
    setCargando(true);
    try {
      const datosParaBD = { club_id: clubId, nombre_completo: formEmpleado.nombre_completo, rol: formEmpleado.rol, sueldo_base: parseFloat(formEmpleado.sueldo_base), jugador_id: formEmpleado.jugador_id ? Number(formEmpleado.jugador_id) : null };
      if (formEmpleado.id) await supabase.from('tesoreria_empleados').update(datosParaBD).eq('id', formEmpleado.id); else await supabase.from('tesoreria_empleados').insert([datosParaBD]);
      showToast(formEmpleado.id ? "Empleado actualizado." : "Empleado registrado.", "success");
      setModalEmpleado(false); setFormEmpleado({ id: null, nombre_completo: '', rol: '', sueldo_base: '', jugador_id: '' }); cargarEmpleados();
    } catch (err) { showToast("Error al guardar.", "error"); } finally { setCargando(false); }
  };

  const abrirEdicionEmpleado = (emp) => { setFormEmpleado({ id: emp.id, nombre_completo: emp.nombre_completo, rol: emp.rol, sueldo_base: emp.sueldo_base, jugador_id: emp.jugador_id || '' }); setModalEmpleado(true); };

  const registrarPagoSueldo = async () => {
    const pagoNum = parseFloat(formSueldo.monto);
    if (!pagoNum || pagoNum <= 0) return showToast("Monto inválido.", "error");
    setCargando(true);
    const descBase = formSueldo.descripcion || `Sueldo de ${nombreMesVencido}`;
    const descDetallada = `${descBase} (Vía ${formSueldo.cajaOrigen})`;

    try {
      const { error } = await supabase.from('tesoreria_egresos').insert([{ club_id: clubId, categoria: 'Sueldos y Viáticos', monto: pagoNum, fecha: new Date().toISOString().split('T')[0], responsable: modalSueldo.empleado.nombre_completo, descripcion: descDetallada }]);
      if (error) throw error;
      showToast(`Liquidación registrada.`, "success");
      setModalSueldo({ visible: false, empleado: null }); setFormSueldo({ monto: '', cajaOrigen: 'Efectivo', descripcion: '' }); cargarEmpleados();
    } catch (err) { showToast("Error al registrar egreso.", "error"); } finally { setCargando(false); }
  };

  const cargarTableroCobros = async () => {
    setCargando(true);
    try {
      const { data: jubs, error: jError } = await supabase.from('jugadores').select('id, nombre, apellido, categoria, contacto').eq('club_id', clubId).eq('categoria', categoria).order('apellido');
      if (jError || !jubs || jubs.length === 0) { setJugadoresInfo([]); return; }
      const idsJugadores = jubs.map(j => { const n = Number(j.id); return Number.isNaN(n) ? String(j.id) : n; }).filter(id => id !== null && id !== undefined);

      let deudas = [];
      const { data: deudasData, error: deudasError } = await supabase.from('tesoreria_deudas').select('*').eq('club_id', clubId).in('jugador_id', idsJugadores);
      if (!deudasError) deudas = deudasData || [];

      if ((deudas.length === 0) || deudasError) {
        const { data: byMonth, error: byMonthErr } = await supabase.from('tesoreria_deudas').select('*').eq('club_id', clubId).eq('mes_correspondiente', periodo);
        if (!byMonthErr && byMonth && byMonth.length > 0) { deudas = byMonth.filter(d => idsJugadores.some(id => String(id) === String(d.jugador_id))); } 
      }

      const hoyDate = new Date(); const hace30Dias = new Date(); hace30Dias.setDate(hoyDate.getDate() - 30);
      const { data: asist } = await supabase.from('asistencias').select('jugador_id, estado, fecha').eq('club_id', clubId).gte('fecha', hace30Dias.toISOString().split('T')[0]);

      const infoCruzada = (jubs || []).map(j => {
        const misAsistencias = (asist || []).filter(a => String(a.jugador_id) === String(j.id));
        const sesionesValidas = misAsistencias.filter(a => ['presente', 'ausente', 'tarde'].includes(a.estado?.toLowerCase()));
        const presentes = sesionesValidas.filter(a => ['presente', 'tarde'].includes(a.estado?.toLowerCase())).length;
        const porcAsistencia = sesionesValidas.length >= 3 ? Math.round((presentes / sesionesValidas.length) * 100) : null;
        
        const misDeudas = (deudas || []).filter(d => String(d.jugador_id) === String(j.id));
        const deudaTotal = misDeudas.filter(d => { const st = String(d.estado || '').toLowerCase(); return st === 'pendiente' || st === 'parcial'; }).reduce((acc, d) => acc + (Number(d.monto_original || 0) - Number(d.monto_pagado || 0)), 0);
        const esBecado = misDeudas.some(d => String(d.mes_correspondiente) === periodo && String(d.estado || '').toLowerCase() === 'beca');
        const pagoEsteMes = misDeudas.find(d => String(d.mes_correspondiente) === periodo && String(d.estado || '').toLowerCase() === 'pagada');
        
        return { ...j, porcAsistencia, sesionesValidas: sesionesValidas.length, misDeudas, deudaTotal, esBecado, pagoEsteMes };
      });
      setJugadoresInfo(infoCruzada);
    } catch (error) { showToast("Error al cargar tablero.", "error"); } finally { setCargando(false); }
  };

  const generarCuotasMasivas = async () => {
    const montoNum = parseFloat(formCuota.monto);
    if (!montoNum || montoNum <= 0) return showToast("El monto debe ser mayor a 0.", "error");
    setCargando(true);
    try {
      const { data: deudasExistentes } = await supabase.from('tesoreria_deudas').select('jugador_id').eq('club_id', clubId).eq('mes_correspondiente', formCuota.mes).eq('concepto', formCuota.concepto);
      const idsConDeuda = new Set((deudasExistentes || []).map(d => String(d.jugador_id)));
      const jugadoresSinCuota = jugadoresInfo.filter(j => !idsConDeuda.has(String(j.id)));
      if (jugadoresSinCuota.length === 0) { showToast("Todos ya tienen esta cuota generada.", "info"); setModalGenerar(false); setCargando(false); return; }
      const nuevasDeudas = jugadoresSinCuota.map(j => ({ club_id: clubId, jugador_id: j.id, concepto: formCuota.concepto, monto_original: montoNum, fecha_vencimiento: formCuota.vencimiento, mes_correspondiente: formCuota.mes, estado: 'Pendiente' }));
      await supabase.from('tesoreria_deudas').insert(nuevasDeudas);
      showToast(`Se generaron ${nuevasDeudas.length} cuotas nuevas.`, "success"); setModalGenerar(false); cargarTableroCobros();
    } catch (err) { showToast("Error al generar cuotas.", "error"); } finally { setCargando(false); }
  };

  const procesarPago = async () => {
    const pagoNum = parseFloat(montoPagar);
    if (!pagoNum || pagoNum <= 0) return showToast("Ingresá un monto válido.", "error");
    setCargando(true);
    try {
      const nuevoPagado = Number(modalPago.deuda.monto_pagado) + pagoNum;
      const nuevoEstado = nuevoPagado >= modalPago.deuda.monto_original ? 'Pagada' : 'Parcial';
      await supabase.from('tesoreria_pagos').insert([{ club_id: clubId, deuda_id: modalPago.deuda.id, jugador_id: modalPago.jugador.id, monto: pagoNum, metodo_pago: metodoPago, fecha_pago: new Date().toISOString().split('T')[0] }]);
      await supabase.from('tesoreria_deudas').update({ monto_pagado: nuevoPagado, estado: nuevoEstado }).eq('id', modalPago.deuda.id);
      showToast(`Pago registrado con éxito.`, "success"); setModalPago({ visible: false, deuda: null, jugador: null }); setMontoPagar(''); setMetodoPago('Efectivo'); cargarTableroCobros();
    } catch (err) { showToast("Error al procesar pago.", "error"); } finally { setCargando(false); }
  };

  const otorgarBeca = async (deudaId) => {
    if(!window.confirm("¿Confirmás la beca para esta cuota?")) return;
    setCargando(true);
    try { await supabase.from('tesoreria_deudas').update({ estado: 'Beca' }).eq('id', deudaId); showToast("Beca registrada.", "success"); cargarTableroCobros(); } 
    catch (err) { showToast("Error al aplicar beca.", "error"); } finally { setCargando(false); }
  };

  if (!accesoPermitido) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', animation: 'fadeIn 0.3s' }}>
        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🔒</div>
        <h2 style={{ color: '#ef4444' }}>ACCESO RESTRINGIDO</h2>
        <p style={{ color: 'var(--text-dim)' }}>Este módulo contiene información financiera sensible.<br/>Solo administradores o tesoreros pueden ingresar.</p>
      </div>
    );
  }

  const GRUPOS_DEUDA = { part: '#3b82f6', eco: '#00ff88', acc: 'var(--text-dim)' };
  const GRUPOS_DEUDA_LABEL = { part: 'ASISTENCIA', eco: 'ESTADO DE CUENTA', acc: 'ACCIONES' };
  const COLS_DEUDA = [
    { k: 'asistencia', t: 'ASISTENCIA', g: 'part', r: j => j.porcAsistencia !== null ? (
      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: j.porcAsistencia < 50 ? '#7f1d1d' : 'transparent', color: j.porcAsistencia < 50 ? '#fff' : j.porcAsistencia < 75 ? '#f59e0b' : '#00ff88' }}>{j.porcAsistencia}%</span>
    ) : <span style={{ color: '#555', fontSize: '0.7rem' }}>Muestra insuf.</span> },
    { k: 'deuda', t: 'DEUDA', g: 'eco', r: j => j.esBecado ? (
      <span style={{ background: '#3b82f6', color: 'var(--text)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>🎓 BECADO</span>
    ) : j.deudaTotal > 0 ? (
      <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.1rem' }}>${j.deudaTotal.toLocaleString()}</span>
    ) : j.pagoEsteMes ? (
      <span style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.8rem' }}>✅ PAGADO</span>
    ) : (
      <span style={{ color: 'var(--text-dim)', fontWeight: 'bold', fontSize: '0.8rem' }}>AL DÍA</span>
    ) },
    { k: 'acciones', t: 'ACCIONES', g: 'acc', r: j => {
      const misDeudasSeguras = j.misDeudas || [];
      const pendientes = misDeudasSeguras.filter(d => ['Pendiente', 'Parcial'].includes(d.estado));
      const deudaACobrar = pendientes[0];
      if (!(j.deudaTotal > 0) || j.esBecado) return <span style={{ color: '#555', fontSize: '0.75rem' }}>—</span>;
      return (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setModalDetalleDeuda({ visible: true, jugador: j, deudas: pendientes })} style={{ background: 'transparent', color: '#facc15', border: '1px solid #facc15', padding: '8px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem', minHeight: '38px' }}>📋 DETALLE</button>
          <button onClick={() => enviarWhatsApp(j, j.deudaTotal)} style={{ background: 'transparent', color: '#25D366', border: '1px solid #25D366', padding: '8px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem', minHeight: '38px' }}>💬 AVISAR</button>
          {deudaACobrar && (<>
            <button onClick={() => otorgarBeca(deudaACobrar.id)} style={{ background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', padding: '8px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem', minHeight: '38px' }}>🎓 BECAR</button>
            <button onClick={() => setModalPago({ visible: true, deuda: deudaACobrar, jugador: j })} style={{ background: '#00ff88', color: '#000', padding: '8px 15px', borderRadius: '4px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem', minHeight: '38px' }}>💸 COBRAR</button>
          </>)}
        </div>
      );
    } },
  ];

  const GRUPOS_STAFF = { gen: 'var(--text-dim)', eco: '#f59e0b', acc: 'var(--text-dim)' };
  const GRUPOS_STAFF_LABEL = { gen: 'LIQUIDACIÓN', eco: 'MONTO', acc: 'ACCIONES' };
  const colEmpAcciones = (color) => ({ k: 'acciones', t: 'ACCIONES', g: 'acc', r: emp => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button onClick={() => abrirEdicionEmpleado(emp)} style={{ background: 'transparent', color: 'var(--text)', border: '1px solid #555', padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', minHeight: '38px' }}>✏️ EDITAR</button>
      {emp.pagoEsteMes ? (
        <button disabled style={{ background: 'var(--panel)', color: '#555', border: '1px solid var(--border)', padding: '8px 15px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.8rem', minHeight: '38px' }}>✅ LIQUIDADO</button>
      ) : (
        <button onClick={() => { setFormSueldo({ ...formSueldo, monto: emp.sueldo_base, descripcion: `${color === '#f59e0b' ? 'Sueldo' : 'Viático'} de ${nombreMesVencido}`, cajaOrigen: 'Efectivo' }); setModalSueldo({ visible: true, empleado: emp }); }} style={{ background: color, color: color === '#f59e0b' ? '#000' : '#fff', border: 'none', padding: '8px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem', minHeight: '38px' }}>💳 PAGAR</button>
      )}
    </div>
  ) });
  const colEmpLiq = (label) => ({ k: 'liq', t: 'LIQUIDACIÓN', g: 'gen', r: emp => emp.pagoEsteMes ? (
    <span style={{ color: '#00ff88', fontWeight: 900, fontSize: '0.75rem' }}>✅ {label}</span>
  ) : (
    <span style={{ background: '#7f1d1d', color: 'var(--text)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>❌ PENDIENTE</span>
  ) });
  const colEmpMonto = { k: 'monto', t: 'MONTO', g: 'eco', r: emp => (
    <div>
      <span style={{ fontWeight: 900, fontSize: '1.05rem' }}>${Number(emp.sueldo_base).toLocaleString()}</span>
      {emp.bonosExtra > 0 && <div style={{ fontSize: '0.7rem', color: '#00ff88', fontWeight: 'bold' }}>🌟 +${emp.bonosExtra.toLocaleString()}</div>}
    </div>
  ) };
  const COLS_STAFF = [colEmpLiq('LIQUIDADO'), colEmpMonto, colEmpAcciones('#f59e0b')];
  const COLS_VIATICOS = [colEmpLiq('PAGADO'), colEmpMonto, colEmpAcciones('#a855f7')];

  const GRUPOS_MOV = { gen: 'var(--text-dim)', eco: '#00ff88' };
  const GRUPOS_MOV_LABEL = { gen: 'DETALLE', eco: 'MONTO' };
  const COLS_MOV = [
    { k: 'tipo', t: 'TIPO', g: 'gen', r: mov => (
      <span style={{ background: mov.tipo === 'entrada' ? 'rgba(0,255,136,0.1)' : 'rgba(239,68,68,0.1)', color: mov.tipo === 'entrada' ? '#00ff88' : '#ef4444', border: `1px solid ${mov.tipo === 'entrada' ? '#00ff88' : '#ef4444'}`, padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>{mov.tipo === 'entrada' ? '⬇️' : '⬆️'} {mov.categoria}</span>
    ) },
    { k: 'monto', t: 'MONTO', g: 'eco', r: mov => (
      <span style={{ fontWeight: 900, fontSize: '1.05rem', color: mov.tipo === 'entrada' ? '#00ff88' : '#ef4444' }}>{mov.tipo === 'entrada' ? '+' : '-'} ${Number(mov.monto).toLocaleString()}</span>
    ) },
    { k: 'acciones', t: 'ACCIONES', g: 'gen', r: mov => (mov.id.startsWith('eg-') || mov.id.startsWith('ext-')) ? (
      <button onClick={() => eliminarMovimientoLibroMayor(mov.id)} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: '8px 10px', borderRadius: '4px', minHeight: '38px' }}>🗑️ Eliminar</button>
    ) : <span style={{ fontSize: '0.7rem', color: '#555' }}>Automático</span> },
  ];

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', animation: 'fadeIn 0.3s', paddingBottom: '80px' }}>
      
      {/* NAVEGACIÓN PRINCIPAL Y SELECTOR DE PERIODO */}
      <div className="bento-card" style={{ marginBottom: '20px', border: '1px solid #3b82f6', background: 'var(--panel)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div className="stat-label" style={{ color: '#3b82f6' }}>MÓDULO FINANCIERO</div>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>TESORERÍA Y CAJA</h2>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => setModalConfig(true)} 
              style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              ⚙️ CONFIG. BANCARIA
            </button>
            <div style={{ background: '#0a0a0a', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>PERÍODO ACTIVO</span>
              <input 
                type="month" 
                value={periodo} 
                onChange={(e) => setPeriodo(e.target.value)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '1rem', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '20px' }}>
             <button onClick={() => setVista('cobros')} style={{ ...tabBtn, background: vista === 'cobros' ? '#3b82f6' : 'transparent', color: vista === 'cobros' ? '#fff' : '#888' }}>💰 COBROS DE CUOTAS</button>
             <button onClick={() => setVista('staff')} style={{ ...tabBtn, background: vista === 'staff' ? '#f59e0b' : 'transparent', color: vista === 'staff' ? '#000' : '#888' }}>👥 STAFF / EMPLEADOS</button>
             <button onClick={() => setVista('viaticos')} style={{ ...tabBtn, background: vista === 'viaticos' ? '#a855f7' : 'transparent', color: vista === 'viaticos' ? '#fff' : '#888' }}>🏃‍♂️ JUGADORES (VIÁTICOS)</button>
             <button onClick={() => setVista('egresos')} style={{ ...tabBtn, background: vista === 'egresos' ? '#00ff88' : 'transparent', color: vista === 'egresos' ? '#000' : '#888' }}>🏦 CAJA Y MAYOR</button>
             <button onClick={() => setVista('reportes')} style={{ ...tabBtn, background: vista === 'reportes' ? '#ef4444' : 'transparent', color: vista === 'reportes' ? '#fff' : '#888' }}>📊 REPORTES</button>
        </div>
      </div>

      {cargando && !modalSueldo.visible && !modalEmpleado && !modalGasto && !modalIngresoExtra && !modalGenerar && !modalPago.visible && !modalConfig && !modalDetalleDeuda.visible ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#3b82f6' }}>Consultando registros... ⏳</div>
      ) : (
        <>
          {/* ==================================================== */}
          {/* VISTA 1: COBRANZAS                                   */}
          {/* ==================================================== */}
          {vista === 'cobros' && (
             <div className="bento-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={selectStyle}>
                    <option value="Primera">Primera</option><option value="Tercera">Tercera</option><option value="Cuarta">Cuarta</option>
                  </select>
                  <h3 style={{ margin: 0 }}>Estado de Cuenta</h3>
                </div>
                <button onClick={() => setModalGenerar(true)} style={{ background: '#a855f7', color: 'var(--text)', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span>⚙️</span> GENERAR CUOTAS MASIVAS
                </button>
              </div>

              <TablaResponsive
                filas={jugadoresInfo}
                columnas={COLS_DEUDA}
                colsClave={['asistencia', 'deuda']}
                grupos={GRUPOS_DEUDA}
                gruposLabel={GRUPOS_DEUDA_LABEL}
                titulo="ESTADO DE CUENTA"
                vacio="No hay jugadores en esta categoría."
                getId={(j) => j.id}
                getTitulo={(j) => `${j.apellido}, ${j.nombre}`}
              >
              <div className="table-wrapper">
                <table style={{ width: '100%', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-dim)', fontSize: '0.75rem', background: '#0a0a0a' }}>
                      <th style={{ padding: '12px' }}>JUGADOR</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>COMPROMISO (30D)</th>
                      <th style={{ padding: '12px' }}>DEUDA PENDIENTE</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jugadoresInfo.map(j => {
                      const misDeudasSeguras = j.misDeudas || [];
                      const pendientes = misDeudasSeguras.filter(d => ['Pendiente', 'Parcial'].includes(d.estado));
                      const deudaACobrar = pendientes[0];

                      return (
                        <tr key={j.id} style={{ borderBottom: '1px solid #222' }}>
                          <td style={{ padding: '15px 12px', fontWeight: 'bold' }}>{j.apellido}, {j.nombre}</td>
                          <td style={{ textAlign: 'center' }}>
                            {j.porcAsistencia !== null ? (
                              <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: j.porcAsistencia < 50 ? '#7f1d1d' : 'transparent', color: j.porcAsistencia < 50 ? '#fff' : j.porcAsistencia < 75 ? '#f59e0b' : '#00ff88' }}>
                                {j.porcAsistencia}% {j.porcAsistencia < 50 && '⚠️ Riesgo'}
                              </span>
                            ) : (
                              <span style={{ color: '#555', fontSize: '0.7rem' }} title={`Sesiones registradas: ${j.sesionesValidas || 0}`}>Muestra insuficiente</span>
                            )}
                          </td>
                          <td style={{ padding: '12px' }}>
                            {j.esBecado ? (
                              <span style={{ background: '#3b82f6', color: 'var(--text)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>🎓 BECADO / EXENTO</span>
                            ) : j.deudaTotal > 0 ? (
                              <div>
                                <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.1rem' }}>${j.deudaTotal.toLocaleString()}</span>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                  {pendientes.length} concepto(s) pend.
                                </div>
                              </div>
                            ) : j.pagoEsteMes ? (
                              <span style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.8rem' }}>✅ PAGADO ESTE MES</span>
                            ) : (
                              <span style={{ color: 'var(--text-dim)', fontWeight: 'bold', fontSize: '0.8rem' }}>AL DÍA (Sin deuda)</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            {j.deudaTotal > 0 && !j.esBecado && (
                              <>
                                <button onClick={() => setModalDetalleDeuda({ visible: true, jugador: j, deudas: pendientes })} style={{ background: 'transparent', color: '#facc15', border: '1px solid #facc15', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem' }} title="Gestionar / Eliminar Conceptos">
                                  📋 DETALLE
                                </button>
                                <button onClick={() => enviarWhatsApp(j, j.deudaTotal)} style={{ background: 'transparent', color: '#25D366', border: '1px solid #25D366', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }} title="Reclamar por WhatsApp">
                                  💬 AVISAR
                                </button>
                                {deudaACobrar && (
                                  <>
                                    <button onClick={() => otorgarBeca(deudaACobrar.id)} style={{ background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem' }} title="Eximir pago">
                                      🎓 BECAR
                                    </button>
                                    <button onClick={() => setModalPago({ visible: true, deuda: deudaACobrar, jugador: j })} style={{ background: '#00ff88', color: '#000', padding: '6px 15px', borderRadius: '4px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>
                                      💸 COBRAR
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {jugadoresInfo.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No hay jugadores en esta categoría.</td></tr>}
                  </tbody>
                </table>
              </div>
              </TablaResponsive>
            </div>
          )}

          {/* ==================================================== */}
          {/* VISTA 2: STAFF Y EMPLEADOS                           */}
          {/* ==================================================== */}
          {vista === 'staff' && (
            <div className="bento-card" style={{ borderTop: '3px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, color: '#f59e0b' }}>Liquidación Staff - {nombreMesVencido}</h3>
                <button onClick={() => { setFormEmpleado({ id: null, nombre_completo: '', rol: '', sueldo_base: '', jugador_id: '' }); setModalEmpleado(true); }} style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  + NUEVO EMPLEADO
                </button>
              </div>

              <TablaResponsive
                filas={empleados.filter(e => !e.jugador_id)}
                columnas={COLS_STAFF}
                colsClave={['liq', 'monto']}
                grupos={GRUPOS_STAFF}
                gruposLabel={GRUPOS_STAFF_LABEL}
                titulo="STAFF"
                vacio="No hay miembros del staff registrados."
                getId={(e) => e.id}
                getTitulo={(e) => e.nombre_completo}
                getSubtitulo={(e) => (e.rol || '').toUpperCase()}
              >
              <div className="table-wrapper">
                <table style={{ width: '100%', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-dim)', fontSize: '0.75rem', background: '#0a0a0a' }}>
                      <th style={{ padding: '12px' }}>NOMBRE / ROL</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>LIQUIDACIÓN {nombreMesVencido}</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>SUELDO BASE</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empleados.filter(e => !e.jugador_id).map(emp => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '15px 12px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{emp.nombre_completo}</div>
                          <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold' }}>{emp.rol.toUpperCase()}</div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {emp.pagoEsteMes ? (
                            <div style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', padding: '6px', borderRadius: '6px', display: 'inline-block' }}>
                              <span style={{ color: '#00ff88', fontWeight: 900, fontSize: '0.75rem' }}>✅ LIQUIDADO</span>
                              <div style={{ color: '#aaa', fontSize: '0.65rem', marginTop: '3px' }}>El {emp.pagoEsteMes.fecha.split('-').reverse().join('/')}</div>
                            </div>
                          ) : (
                            <span style={{ background: '#7f1d1d', color: 'var(--text)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>❌ PENDIENTE</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>${Number(emp.sueldo_base).toLocaleString()}</div>
                          {emp.bonosExtra > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#00ff88', fontWeight: 'bold', background: 'rgba(0,255,136,0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                              🌟 + ${emp.bonosExtra.toLocaleString()} (Bonos)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                          <button onClick={() => abrirEdicionEmpleado(emp)} style={{ background: 'transparent', color: 'var(--text)', border: '1px solid #555', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }} title="Editar Datos">✏️</button>
                          {emp.pagoEsteMes ? (
                             <button disabled style={{ background: 'var(--panel)', color: '#555', border: '1px solid var(--border)', padding: '6px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'not-allowed', fontSize: '0.8rem' }}>✅ LIQUIDADO</button>
                          ) : (
                             <button onClick={() => { setFormSueldo({...formSueldo, monto: emp.sueldo_base, descripcion: `Sueldo de ${nombreMesVencido}`, cajaOrigen: 'Efectivo'}); setModalSueldo({ visible: true, empleado: emp }); }} style={{ background: '#ef4444', color: 'var(--text)', border: 'none', padding: '6px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>💳 PAGAR BASE</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {empleados.filter(e => !e.jugador_id).length === 0 && (
                      <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No hay miembros del staff registrados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              </TablaResponsive>
            </div>
          )}

          {/* ==================================================== */}
          {/* VISTA 3: VIÁTICOS DE JUGADORES                       */}
          {/* ==================================================== */}
          {vista === 'viaticos' && (
            <div className="bento-card" style={{ borderTop: '3px solid #a855f7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, color: '#a855f7' }}>Viáticos de Jugadores - {nombreMesVencido}</h3>
                <button onClick={() => { setFormEmpleado({ id: null, nombre_completo: '', rol: '', sueldo_base: '', jugador_id: '' }); setModalEmpleado(true); }} style={{ background: '#a855f7', color: 'var(--text)', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  + ASIGNAR VIÁTICO
                </button>
              </div>

              <TablaResponsive
                filas={empleados.filter(e => e.jugador_id)}
                columnas={COLS_VIATICOS}
                colsClave={['liq', 'monto']}
                grupos={GRUPOS_STAFF}
                gruposLabel={GRUPOS_STAFF_LABEL}
                titulo="VIÁTICOS"
                vacio="No hay jugadores con viáticos asignados."
                getId={(e) => e.id}
                getTitulo={(e) => e.nombre_completo}
                getSubtitulo={() => "Plantel Activo"}
              >
              <div className="table-wrapper">
                <table style={{ width: '100%', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-dim)', fontSize: '0.75rem', background: '#0a0a0a' }}>
                      <th style={{ padding: '12px' }}>NOMBRE DEL JUGADOR</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>LIQUIDACIÓN {nombreMesVencido}</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>MONTO VIÁTICO</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empleados.filter(e => e.jugador_id).map(emp => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '15px 12px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{emp.nombre_completo}</div>
                          <span style={{ fontSize: '0.65rem', color: '#a855f7', border: '1px solid #a855f7', padding: '2px 6px', borderRadius: '10px' }}>Plantel Activo</span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {emp.pagoEsteMes ? (
                             <div style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', padding: '6px', borderRadius: '6px', display: 'inline-block' }}>
                               <span style={{ color: '#00ff88', fontWeight: 900, fontSize: '0.75rem' }}>✅ VIÁTICO PAGADO</span>
                               <div style={{ color: '#aaa', fontSize: '0.65rem', marginTop: '3px' }}>El {emp.pagoEsteMes.fecha.split('-').reverse().join('/')}</div>
                             </div>
                          ) : (
                            <span style={{ background: '#7f1d1d', color: 'var(--text)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>❌ PENDIENTE</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>${Number(emp.sueldo_base).toLocaleString()}</div>
                          {emp.bonosExtra > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#00ff88', fontWeight: 'bold', background: 'rgba(0,255,136,0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                              🌟 + ${emp.bonosExtra.toLocaleString()} (Comisión)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                          <button onClick={() => abrirEdicionEmpleado(emp)} style={{ background: 'transparent', color: 'var(--text)', border: '1px solid #555', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }} title="Editar Datos">✏️</button>
                          {emp.pagoEsteMes ? (
                             <button disabled style={{ background: 'var(--panel)', color: '#555', border: '1px solid var(--border)', padding: '6px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'not-allowed', fontSize: '0.8rem' }}>✅ LIQUIDADO</button>
                          ) : (
                             <button onClick={() => { setFormSueldo({...formSueldo, monto: emp.sueldo_base, descripcion: `Viático de ${nombreMesVencido}`, cajaOrigen: 'Efectivo'}); setModalSueldo({ visible: true, empleado: emp }); }} style={{ background: '#a855f7', color: 'var(--text)', border: 'none', padding: '6px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>💳 PAGAR VIÁTICO</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {empleados.filter(e => e.jugador_id).length === 0 && (
                      <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No hay jugadores con viáticos asignados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              </TablaResponsive>
            </div>
          )}

          {/* ==================================================== */}
          {/* VISTA 4: CAJA COMPLETA Y LIBRO MAYOR                 */}
          {/* ==================================================== */}
          {vista === 'egresos' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <div style={{ background: 'var(--panel)', padding: '20px', borderRadius: '12px', border: '1px solid #00ff88', textAlign: 'center' }}>
                  <div className="stat-label">INGRESOS DEL MES</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#00ff88' }}>+ ${balance.ingresos.toLocaleString()}</div>
                </div>
                <div style={{ background: 'var(--panel)', padding: '20px', borderRadius: '12px', border: '1px solid #ef4444', textAlign: 'center' }}>
                  <div className="stat-label">SALIDAS DEL MES</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444' }}>- ${balance.egresos.toLocaleString()}</div>
                </div>
                <div style={{ background: '#0a0a0a', padding: '20px', borderRadius: '12px', border: `2px solid ${(balance.ingresos - balance.egresos) >= 0 ? '#3b82f6' : '#ef4444'}`, textAlign: 'center' }}>
                  <div className="stat-label" style={{ color: 'var(--text)' }}>BALANCE FINAL</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: (balance.ingresos - balance.egresos) >= 0 ? '#3b82f6' : '#ef4444' }}>
                    ${(balance.ingresos - balance.egresos).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="bento-card" style={{ borderTop: '3px solid #00ff88' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                  <h3 style={{ margin: 0, color: '#00ff88' }}>Libro Mayor (Flujo Detallado)</h3>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => setModalIngresoExtra(true)} style={{ background: '#00ff88', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                      + INGRESAR PLATA
                    </button>
                    <button onClick={() => setModalGasto(true)} style={{ background: '#ef4444', color: 'var(--text)', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                      - REGISTRAR SALIDA
                    </button>
                  </div>
                </div>

                <TablaResponsive
                  filas={cajaCompleta}
                  columnas={COLS_MOV}
                  colsClave={['tipo', 'monto']}
                  grupos={GRUPOS_MOV}
                  gruposLabel={GRUPOS_MOV_LABEL}
                  titulo="LIBRO MAYOR"
                  vacio="No hay movimientos registrados este mes."
                  getId={(mov) => mov.id}
                  getTitulo={(mov) => mov.descripcion || mov.categoria}
                  getSubtitulo={(mov) => mov.fecha.split('-').reverse().join('/')}
                >
                <div className="table-wrapper">
                  <table style={{ width: '100%', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-dim)', fontSize: '0.75rem', background: '#0a0a0a' }}>
                        <th style={{ padding: '12px' }}>FECHA</th>
                        <th style={{ padding: '12px' }}>TIPO / CATEGORÍA</th>
                        <th style={{ padding: '12px' }}>DESCRIPCIÓN</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>MONTO</th>
                        <th style={{ padding: '12px', textAlign: 'center', width: '50px' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cajaCompleta.map(mov => (
                        <tr key={mov.id} style={{ borderBottom: '1px solid #222' }}>
                          <td style={{ padding: '15px 12px', color: '#aaa', fontSize: '0.85rem' }}>{mov.fecha.split('-').reverse().join('/')}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ background: mov.tipo === 'entrada' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: mov.tipo === 'entrada' ? '#00ff88' : '#ef4444', border: `1px solid ${mov.tipo === 'entrada' ? '#00ff88' : '#ef4444'}`, padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                              {mov.tipo === 'entrada' ? '⬇️' : '⬆️'} {mov.categoria}
                            </span>
                          </td>
                          <td style={{ padding: '12px', fontSize: '0.85rem' }}>{mov.descripcion}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, fontSize: '1.1rem', color: mov.tipo === 'entrada' ? '#00ff88' : '#ef4444' }}>
                            {mov.tipo === 'entrada' ? '+' : '-'} ${Number(mov.monto).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {/* 🚀 BOTÓN DE ELIMINAR SOLO PARA EGRESOS O INGRESOS EXTRAS MANUALES */}
                            {(mov.id.startsWith('eg-') || mov.id.startsWith('ext-')) ? (
                              <button onClick={() => eliminarMovimientoLibroMayor(mov.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem' }} title="Eliminar registro">
                                🗑️
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: '#555' }} title="Origen de sistema">Auto</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {cajaCompleta.length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No hay movimientos registrados este mes.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                </TablaResponsive>
              </div>
            </>
          )}

          {/* ==================================================== */}
          {/* VISTA 5: REPORTES                                    */}
          {/* ==================================================== */}
          {vista === 'reportes' && datosReporte && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              <div className="bento-card" style={{ display: 'flex', justifyContent: 'space-around', gridColumn: '1 / -1', textAlign: 'center', borderTop: '3px solid #a855f7', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#00ff88' }}>${datosReporte.ingresosTotal.toLocaleString()}</div>
                  <div className="stat-label">RECAUDACIÓN YTD ({añoSeleccionado})</div>
                </div>
                <div style={{ flex: 1, minWidth: '150px', borderLeft: '1px solid #333', paddingLeft: '10px' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444' }}>${datosReporte.egresosTotal.toLocaleString()}</div>
                  <div className="stat-label">GASTOS YTD ({añoSeleccionado})</div>
                </div>
                <div style={{ flex: 1, minWidth: '150px', borderLeft: '1px solid #333', paddingLeft: '10px' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: datosReporte.cajaReal >= 0 ? '#3b82f6' : '#ef4444' }}>${datosReporte.cajaReal.toLocaleString()}</div>
                  <div className="stat-label">CAJA FUERTE DISPONIBLE</div>
                </div>
                <div style={{ flex: 1, minWidth: '150px', borderLeft: '1px solid #333', paddingLeft: '10px' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: datosReporte.tasaCobrabilidad > 75 ? '#00ff88' : '#f59e0b' }}>{datosReporte.tasaCobrabilidad}%</div>
                  <div className="stat-label">TASA DE COBRABILIDAD</div>
                </div>
              </div>

              <div className="bento-card" style={{ height: '350px' }}>
                 <div className="stat-label" style={{ marginBottom: '15px' }}>FLUJO DE CAJA MENSUAL</div>
                 <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={datosReporte.dataMeses}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false}/>
                      <XAxis dataKey="name" stroke="#555" fontSize={10}/>
                      <YAxis stroke="#555" fontSize={10} width={60} tickFormatter={(val) => `$${val/1000}k`} />
                      <Tooltip contentStyle={{background:'#111', border:'1px solid #333', borderRadius:'8px'}} itemStyle={{ color: 'var(--text)', fontWeight: 'bold' }} labelStyle={{ color: '#aaa', marginBottom: '5px' }} />
                      <Line type="monotone" name="Ingresos" dataKey="ingresos" stroke="#00ff88" strokeWidth={3} dot={{fill: '#00ff88'}} />
                      <Line type="monotone" name="Egresos" dataKey="egresos" stroke="#ef4444" strokeWidth={3} dot={{fill: '#ef4444'}} />
                    </LineChart>
                 </ResponsiveContainer>
              </div>

              <div className="bento-card" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
                 <div className="stat-label" style={{ marginBottom: '15px' }}>DISTRIBUCIÓN DE INGRESOS</div>
                 <div style={{ flex: 1, position: 'relative' }}>
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={datosReporte.dataTortaIngresos} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none">
                          {datosReporte.dataTortaIngresos.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{background:'#111', border:'1px solid #333', borderRadius:'8px'}} itemStyle={{ color: 'var(--text)', fontWeight: 'bold' }} formatter={(val) => `$${val.toLocaleString()}`} />
                      </PieChart>
                   </ResponsiveContainer>
                   <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Total</div>
                      <div style={{ fontWeight: 'bold' }}>${datosReporte.ingresosTotal.toLocaleString()}</div>
                   </div>
                 </div>
              </div>

              <div className="bento-card" style={{ gridColumn: '1 / -1', display: 'flex', gap: '20px', flexWrap: 'wrap', background: 'transparent', border: 'none', padding: 0 }}>
                <div style={{ flex: 1, minWidth: '300px', background: 'var(--panel)', padding: '20px', borderRadius: '12px', border: '1px solid #ef4444' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div className="stat-label" style={{ color: '#ef4444' }}>🔴 TOP 5 DEUDORES (HISTÓRICO)</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ef4444' }}>${datosReporte.deudaTotal.toLocaleString()} <span style={{fontSize: '0.7rem', color:'#666'}}>en la calle</span></div>
                  </div>
                  {datosReporte.topMorosos.length === 0 ? (
                    <div style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>No hay deudas registradas. ¡Excelente!</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {datosReporte.topMorosos.map((m, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#1a1a1a', borderRadius: '6px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{idx + 1}. {m.nombre}</span>
                          <span style={{ color: '#ef4444', fontWeight: 900 }}>${m.deuda.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: '300px', background: 'var(--panel)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div className="stat-label" style={{ marginBottom: '15px' }}>DISTRIBUCIÓN DE EGRESOS</div>
                  <div style={{ height: '200px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={datosReporte.dataCat} layout="vertical" margin={{ left: 30, right: 20 }}>
                          <XAxis type="number" hide />
                          <YAxis dataKey="nombre" type="category" stroke="#888" fontSize={10} width={90} />
                          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius:'8px' }} itemStyle={{ color: 'var(--text)', fontWeight: 'bold' }} labelStyle={{ color: '#aaa' }} formatter={(val) => `$${val.toLocaleString()}`} />
                          <Bar dataKey="monto" radius={[0, 4, 4, 0]} barSize={15}>
                            {datosReporte.dataCat.map((entry, index) => <Cell key={index} fill={entry.nombre === 'Sueldos y Viáticos' ? '#f59e0b' : '#333'} />)}
                          </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================================================== */}
      {/* 🚀 MODAL: DETALLES DE DEUDA (ELIMINAR CONCEPTOS)     */}
      {/* ==================================================== */}
      {modalDetalleDeuda.visible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '450px', border: '1px solid #facc15' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ marginTop: 0, color: '#facc15' }}>Detalle de Obligaciones</h3>
              <button onClick={() => setModalDetalleDeuda({ visible: false, jugador: null, deudas: [] })} style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Jugador: <strong>{modalDetalleDeuda.jugador?.apellido}, {modalDetalleDeuda.jugador?.nombre}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', paddingRight: '5px' }}>
              {modalDetalleDeuda.deudas.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>No hay deudas pendientes detectadas.</div>
              ) : (
                modalDetalleDeuda.deudas.map(d => (
                  <div key={d.id} style={{ background: 'var(--panel)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text)' }}>{d.concepto}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Original: ${Number(d.monto_original).toLocaleString()} | Pagado: <span style={{ color: d.monto_pagado > 0 ? '#00ff88' : '#888' }}>${Number(d.monto_pagado).toLocaleString()}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => eliminarDeuda(d)}
                      disabled={Number(d.monto_pagado) > 0 || cargando}
                      style={{ 
                        background: 'transparent', border: '1px solid', borderColor: Number(d.monto_pagado) > 0 ? '#333' : '#ef4444', 
                        color: Number(d.monto_pagado) > 0 ? '#555' : '#ef4444', padding: '8px', borderRadius: '6px', cursor: Number(d.monto_pagado) > 0 ? 'not-allowed' : 'pointer' 
                      }}
                      title={Number(d.monto_pagado) > 0 ? 'No se puede borrar porque tiene pagos' : 'Eliminar concepto'}
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* RESTO DE MODALES                                     */}
      {/* ==================================================== */}
      {modalConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '450px', border: '1px solid #3b82f6' }}>
            <h3 style={{ marginTop: 0, color: '#3b82f6' }}>Configuración Bancaria</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Estos datos se usarán en el Kiosco.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div><label style={lblStyle}>Alias MercadoPago / Banco</label><input type="text" value={formConfig.alias_cobro} onChange={(e) => setFormConfig({...formConfig, alias_cobro: e.target.value})} style={inputFormStyle} /></div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}><label style={lblStyle}>CBU</label><input type="text" value={formConfig.cbu} onChange={(e) => setFormConfig({...formConfig, cbu: e.target.value})} style={inputFormStyle} /></div>
                <div style={{ flex: 1 }}><label style={lblStyle}>CVU</label><input type="text" value={formConfig.cvu} onChange={(e) => setFormConfig({...formConfig, cvu: e.target.value})} style={inputFormStyle} /></div>
              </div>
              <div><label style={lblStyle}>WhatsApp Tesorería (para comprobantes)</label><input type="text" value={formConfig.whatsapp_tesoreria} onChange={(e) => setFormConfig({...formConfig, whatsapp_tesoreria: e.target.value})} style={inputFormStyle} /><span style={{fontSize: '0.7rem', color: '#555'}}>Ej: 5491144445555</span></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalConfig(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={guardarConfigBancaria} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#3b82f6', border: 'none', color: 'var(--text)', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {modalGenerar && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '450px', border: '1px solid #a855f7' }}>
            <h3 style={{ marginTop: 0, color: '#a855f7' }}>Generar Obligaciones Masivas</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Para jugadores de <strong>{categoria}</strong>.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div><label style={lblStyle}>Concepto</label><input type="text" value={formCuota.concepto} onChange={(e) => setFormCuota({...formCuota, concepto: e.target.value})} style={inputFormStyle} /></div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}><label style={lblStyle}>Monto Total ($)</label><input type="number" value={formCuota.monto} onChange={(e) => setFormCuota({...formCuota, monto: e.target.value})} style={inputFormStyle} /></div>
                <div style={{ flex: 1 }}><label style={lblStyle}>Mes Contable</label><input type="month" value={formCuota.mes} onChange={(e) => setFormCuota({...formCuota, mes: e.target.value})} style={inputFormStyle} /></div>
              </div>
              <div><label style={lblStyle}>Fecha Límite</label><input type="date" value={formCuota.vencimiento} onChange={(e) => setFormCuota({...formCuota, vencimiento: e.target.value})} style={inputFormStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalGenerar(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={generarCuotasMasivas} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#a855f7', border: 'none', color: 'var(--text)', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>GENERAR</button>
            </div>
          </div>
        </div>
      )}

      {modalPago.visible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '400px', border: '1px solid #00ff88' }}>
            <h3 style={{ marginTop: 0, color: '#00ff88' }}>Registrar Ingreso</h3>
            <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>De:</div>
              <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>{modalPago.jugador.apellido}, {modalPago.jugador.nombre}</div>
              <div style={{ fontSize: '0.8rem', color: '#3b82f6', marginTop: '5px' }}>📌 {modalPago.deuda.concepto}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div><label style={lblStyle}>Restante ($)</label><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444' }}>${(modalPago.deuda.monto_original - modalPago.deuda.monto_pagado).toLocaleString()}</div></div>
              <div><label style={lblStyle}>¿Cuánto paga ahora?</label><input type="number" value={montoPagar} onChange={(e) => setMontoPagar(e.target.value)} style={{ ...inputFormStyle, borderColor: '#00ff88', fontSize: '1.2rem', padding: '15px' }} /></div>
              <div>
                <label style={lblStyle}>Auditoría</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={inputFormStyle}>
                  <option value="Efectivo">💵 Efectivo</option><option value="Transferencia MP">📱 Transferencia MP</option><option value="Transferencia Banco">🏦 Transferencia Banco</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => {setModalPago({visible: false, deuda: null, jugador: null}); setMontoPagar(''); setMetodoPago('Efectivo');}} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>CANCELAR</button>
              <button onClick={procesarPago} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#00ff88', border: 'none', color: '#000', fontWeight: '900', borderRadius: '6px', cursor: 'pointer' }}>COBRAR</button>
            </div>
          </div>
        </div>
      )}

      {modalEmpleado && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '450px', border: '1px solid #f59e0b' }}>
            <h3 style={{ marginTop: 0, color: '#f59e0b' }}>{formEmpleado.id ? 'Modificar Empleado' : 'Alta de Personal'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div style={{ background: 'var(--panel)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <label style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold' }}>¿Es jugador?</label>
                <select value={formEmpleado.jugador_id} onChange={(e) => { const jId = e.target.value; const jSel = jugadoresInfo.find(j => String(j.id) === jId); setFormEmpleado({ ...formEmpleado, jugador_id: jId, nombre_completo: jSel ? `${jSel.nombre} ${jSel.apellido}` : formEmpleado.nombre_completo }); }} style={{ ...inputFormStyle, border: 'none', background: 'transparent', padding: '5px 0' }}>
                  <option value="">No, es personal externo.</option>{jugadoresInfo.map(j => <option key={j.id} value={j.id}>{j.apellido}, {j.nombre}</option>)}
                </select>
              </div>
              <div><label style={lblStyle}>Nombre</label><input type="text" value={formEmpleado.nombre_completo} onChange={(e) => setFormEmpleado({...formEmpleado, nombre_completo: e.target.value})} style={inputFormStyle} disabled={formEmpleado.jugador_id !== ''} /></div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}><label style={lblStyle}>Rol</label><input type="text" value={formEmpleado.rol} onChange={(e) => setFormEmpleado({...formEmpleado, rol: e.target.value})} style={inputFormStyle} /></div>
                <div style={{ flex: 1 }}><label style={lblStyle}>Base ($)</label><input type="number" value={formEmpleado.sueldo_base} onChange={(e) => setFormEmpleado({...formEmpleado, sueldo_base: e.target.value})} style={inputFormStyle} /></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalEmpleado(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={guardarEmpleado} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#f59e0b', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {modalSueldo.visible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '420px', border: '1px solid #ef4444' }}>
            <h3 style={{ marginTop: 0, color: '#ef4444' }}>Liquidar a {modalSueldo.empleado.nombre_completo}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div><label style={lblStyle}>Monto a enviar ($)</label><input type="number" value={formSueldo.monto} onChange={(e) => setFormSueldo({...formSueldo, monto: e.target.value})} style={{ ...inputFormStyle, borderColor: '#ef4444', fontSize: '1.2rem', padding: '15px' }} /></div>
              <div><label style={lblStyle}>Detalle</label><input type="text" value={formSueldo.descripcion} onChange={(e) => setFormSueldo({...formSueldo, descripcion: e.target.value})} placeholder={`Sueldo de ${nombreMesVencido}`} style={inputFormStyle} /></div>
              <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <PaymentSelector titulo="¿Con qué transferís?" onMethodSelect={(metodo) => setFormSueldo({...formSueldo, cajaOrigen: metodo})} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalSueldo({visible: false, empleado: null})} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={registrarPagoSueldo} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#ef4444', border: 'none', color: 'var(--text)', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>PAGAR</button>
            </div>
          </div>
        </div>
      )}

      {modalGasto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '400px', border: '1px solid #ef4444' }}>
            <h3 style={{ marginTop: 0, color: '#ef4444' }}>Registrar Gasto</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div>
                <label style={lblStyle}>Categoría</label>
                <select value={formGasto.categoria} onChange={(e) => setFormGasto({...formGasto, categoria: e.target.value})} style={inputFormStyle}>
                  <option value="Alquiler Cancha">🏟️ Alquiler Cancha</option><option value="Arbitrajes">⚖️ Arbitrajes</option><option value="Materiales">⚽ Materiales</option><option value="Mantenimiento">🛠️ Mantenimiento</option><option value="Comisiones / Terceros">🤝 Comisiones</option><option value="Varios">🛒 Varios</option>
                </select>
              </div>
              <div><label style={lblStyle}>Monto ($)</label><input type="number" value={formGasto.monto} onChange={(e) => setFormGasto({...formGasto, monto: e.target.value})} style={{ ...inputFormStyle, borderColor: '#ef4444', fontSize: '1.2rem', padding: '15px' }} /></div>
              <div><label style={lblStyle}>Descripción</label><input type="text" value={formGasto.descripcion} onChange={(e) => setFormGasto({...formGasto, descripcion: e.target.value})} style={inputFormStyle} /></div>
              <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <PaymentSelector titulo="¿Con qué app pagás?" onMethodSelect={(metodo) => setFormGasto({...formGasto, cajaOrigen: metodo})} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalGasto(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={registrarGastoGeneral} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#ef4444', border: 'none', color: 'var(--text)', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>REGISTRAR</button>
            </div>
          </div>
        </div>
      )}

      {modalIngresoExtra && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '400px', border: '1px solid #00ff88' }}>
            <h3 style={{ marginTop: 0, color: '#00ff88' }}>Ingreso Extra</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div>
                <label style={lblStyle}>Origen</label>
                <select value={formIngresoExtra.categoria} onChange={(e) => setFormIngresoExtra({...formIngresoExtra, categoria: e.target.value})} style={inputFormStyle}>
                  <option value="Bufet / Cantina">🍔 Bufet / Cantina</option><option value="Rifas / Eventos">🎟️ Rifas / Eventos</option><option value="Venta Indumentaria">👕 Indumentaria</option><option value="Donaciones">🎁 Donaciones</option><option value="Otros Ingresos">💰 Otros Ingresos</option>
                </select>
              </div>
              <div><label style={lblStyle}>Monto ($)</label><input type="number" value={formIngresoExtra.monto} onChange={(e) => setFormIngresoExtra({...formIngresoExtra, monto: e.target.value})} style={{ ...inputFormStyle, borderColor: '#00ff88', fontSize: '1.2rem', padding: '15px' }} /></div>
              <div>
                <label style={lblStyle}>Auditoría</label>
                <select value={formIngresoExtra.metodo_pago} onChange={(e) => setFormIngresoExtra({...formIngresoExtra, metodo_pago: e.target.value})} style={inputFormStyle}>
                  <option value="Efectivo">💵 Efectivo</option><option value="Transferencia MP">📱 Transferencia MP</option><option value="Transferencia Banco">🏦 Transferencia Banco</option>
                </select>
              </div>
              <div><label style={lblStyle}>Descripción</label><input type="text" value={formIngresoExtra.descripcion} onChange={(e) => setFormIngresoExtra({...formIngresoExtra, descripcion: e.target.value})} style={inputFormStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalIngresoExtra(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={registrarIngresoExtraordinario} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#00ff88', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>SUMAR</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const tabBtn = { padding: '10px 15px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '900', transition: '0.2s' };
const selectStyle = { padding: '8px 15px', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 'bold', outline: 'none' };
const inputFormStyle = { width: '100%', padding: '10px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', marginTop: '5px', outline: 'none' };
const lblStyle = { fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' };

export default Tesoreria;