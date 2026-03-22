import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
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
  
  // Cálculo de Mes Vencido según el periodo elegido
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

  // Modales
  const [modalPago, setModalPago] = useState({ visible: false, deuda: null, jugador: null });
  const [montoPagar, setMontoPagar] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');

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

  // Efecto Maestro
  useEffect(() => {
    if (clubId && accesoPermitido) {
      if (vista === 'cobros') cargarTableroCobros();
      if (vista === 'staff' || vista === 'viaticos') cargarEmpleados();
      if (vista === 'egresos') cargarEgresosYBalance();
      if (vista === 'reportes') cargarReportes();
    }
  }, [categoria, vista, clubId, periodo, accesoPermitido]);

  // Actualizar formCuota si cambian de mes
  useEffect(() => {
    setFormCuota(prev => ({
      ...prev,
      concepto: `Cuota ${new Date(añoSeleccionado, Number(mesSeleccionado)-1, 1).toLocaleString('es-ES', { month: 'long' }).toUpperCase()} ${añoSeleccionado}`,
      mes: periodo,
      vencimiento: `${periodo}-10`
    }));
  }, [periodo, añoSeleccionado, mesSeleccionado]);

  // ==========================================
  // LÓGICA: WHATSAPP 
  // ==========================================
  const enviarWhatsApp = (jugador, deudaTotal) => {
    const msj = `Hola ${jugador.nombre}, te escribimos de Tesorería del Club. Figuras con un saldo pendiente de $${deudaTotal.toLocaleString()}. Por favor, acercate para regularizarlo. ¡Abrazo!`;
    const numeroLimpio = jugador.contacto ? String(jugador.contacto).replace(/[^0-9]/g, '') : '';
    const url = numeroLimpio 
      ? `https://api.whatsapp.com/send?phone=${numeroLimpio}&text=${encodeURIComponent(msj)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msj)}`;
    window.open(url, '_blank');
  };

  // ==========================================
  // LÓGICA: REPORTES Y KPIs AVANZADOS
  // ==========================================
  const cargarReportes = async () => {
    setCargando(true);
    try {
      const lastN = 6;
      const selYear = Number(añoSeleccionado);
      const selMonthIndex = Number(mesSeleccionado) - 1; 

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
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; 
        monthsArray.push({ ym, name: d.toLocaleString('es-ES', { month: 'short' }).toUpperCase(), year: d.getFullYear() });
      }

      const mesesMap = {};
      monthsArray.forEach(m => { mesesMap[m.ym] = { name: m.name, ingresos: 0, egresos: 0, year: m.year }; });

      pagos?.forEach(p => { const mesKey = (p.fecha_pago || '').substring(0, 7); if (mesesMap[mesKey]) mesesMap[mesKey].ingresos += Number(p.monto || 0); });
      pagosSponsors?.forEach(p => { const mesKey = (p.fecha_pago || '').substring(0, 7); if (mesesMap[mesKey]) mesesMap[mesKey].ingresos += Number(p.monto || 0); });
      ingresosExtras?.forEach(p => { const mesKey = (p.fecha || '').substring(0, 7); if (mesesMap[mesKey]) mesesMap[mesKey].ingresos += Number(p.monto || 0); });

      const gastosPorCat = {};
      egresos?.forEach(e => {
        const mesKey = (e.fecha || '').substring(0, 7);
        if (mesesMap[mesKey]) mesesMap[mesKey].egresos += Number(e.monto || 0);
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
        .map(id => {
          const jug = todosJugadores?.find(j => String(j.id) === String(id));
          return { nombre: jug ? `${jug.apellido}, ${jug.nombre}` : 'Jugador Eliminado', deuda: deudaPorJugador[id] };
        })
        .sort((a, b) => b.deuda - a.deuda).slice(0, 5); 

      const dataTortaIngresos = [
        { name: 'Cuotas Sociales', value: ingresosCuotasTotal, color: '#3b82f6' },
        { name: 'Sponsors/Subsidios', value: ingresosSponsorsTotal, color: '#a855f7' },
        { name: 'Ingresos Extras', value: ingresosExtrasTotal, color: '#00ff88' }
      ];

      setDatosReporte({ dataMeses, dataCat, deudaTotal: deudaTotalHistorica, ingresosTotal, egresosTotal, cajaReal, tasaCobrabilidad, topMorosos, dataTortaIngresos });
    } catch (err) { 
      console.error(err);
      showToast("Error al cargar reportes.", "error"); 
    } finally { 
      setCargando(false); 
    }
  };

  // ==========================================
  // LÓGICA: EGRESOS GENERALES Y CAJA COMPLETA
  // ==========================================
  const cargarEgresosYBalance = async () => {
    setCargando(true);
    try {
      const primerDia = `${periodo}-01`;
      const ultimoDiaNum = new Date(añoSeleccionado, Number(mesSeleccionado), 0).getDate(); 
      const ultimoDia = `${periodo}-${ultimoDiaNum}`;

      // 1. Traer Gastos (Egresos)
      const { data: egresosMes } = await supabase.from('tesoreria_egresos').select('*').eq('club_id', clubId).gte('fecha', primerDia).lte('fecha', ultimoDia);
      
      // 2. Traer Ingresos de Cuotas
      const { data: ingresosMes } = await supabase.from('tesoreria_pagos').select('*').eq('club_id', clubId).gte('fecha_pago', primerDia).lte('fecha_pago', ultimoDia);
      
      // 3. Traer Ingresos de Sponsors (También traemos la lista de sponsors para enlazar los nombres)
      const { data: ingSponsorsMes } = await supabase.from('sponsors_pagos').select('*').eq('club_id', clubId).gte('fecha_pago', primerDia).lte('fecha_pago', ultimoDia);
      const { data: listaSponsors } = await supabase.from('sponsors').select('id, nombre').eq('club_id', clubId);
      
      // 4. Traer Ingresos Extraordinarios
      const { data: ingExtraMes } = await supabase.from('tesoreria_ingresos_extra').select('*').eq('club_id', clubId).gte('fecha', primerDia).lte('fecha', ultimoDia);

      // Consolidar todos los movimientos en un solo arreglo (Libro Mayor)
      let movimientos = [];

      (egresosMes || []).forEach(e => {
        // Mejoramos la descripción para que quede claro quién se llevó la plata si es un responsable
        const textoDetalle = e.responsable && e.responsable !== 'Tesorero/Admin' 
          ? `${e.descripcion || e.categoria} (Abonado a: ${e.responsable})` 
          : e.descripcion || e.categoria;

        movimientos.push({ 
          id: `eg-${e.id}`, fecha: e.fecha, tipo: 'salida', categoria: e.categoria, 
          descripcion: textoDetalle, monto: Number(e.monto) 
        });
      });

      (ingresosMes || []).forEach(i => movimientos.push({ id: `cuota-${i.id}`, fecha: i.fecha_pago, tipo: 'entrada', categoria: 'Cuota Social', descripcion: 'Cobro registrado por sistema', monto: Number(i.monto) }));
      
      (ingSponsorsMes || []).forEach(s => {
        const nombreSponsor = listaSponsors?.find(sp => sp.id === s.sponsor_id)?.nombre || 'Sponsor Desconocido';
        const textoDetalle = s.descripcion ? `${nombreSponsor} - ${s.descripcion}` : `Aporte de ${nombreSponsor}`;
        
        movimientos.push({ 
          id: `spon-${s.id}`, 
          fecha: s.fecha_pago, 
          tipo: 'entrada', 
          categoria: s.metodo_pago === 'Especie' ? 'Canje / Especie' : 'Sponsor / Subsidio', 
          descripcion: textoDetalle, 
          monto: Number(s.monto) 
        });
      });

      (ingExtraMes || []).forEach(x => movimientos.push({ id: `ext-${x.id}`, fecha: x.fecha, tipo: 'entrada', categoria: x.categoria, descripcion: x.descripcion || 'Ingreso manual', monto: Number(x.monto) }));

      // Ordenar por fecha (más reciente arriba)
      movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

      const totalEgresos = movimientos.filter(m => m.tipo === 'salida').reduce((acc, curr) => acc + curr.monto, 0);
      const totalIngresos = movimientos.filter(m => m.tipo === 'entrada').reduce((acc, curr) => acc + curr.monto, 0);

      setCajaCompleta(movimientos);
      setBalance({ ingresos: totalIngresos, egresos: totalEgresos });
    } catch (err) { 
      showToast("Error al cargar libro mayor.", "error"); 
    } finally { 
      setCargando(false); 
    }
  };

  const registrarGastoGeneral = async () => {
    const montoNum = parseFloat(formGasto.monto);
    if (!montoNum || montoNum <= 0) return showToast("Ingresá un monto válido.", "error");
    setCargando(true);
    try {
      const { error } = await supabase.from('tesoreria_egresos').insert([{
        club_id: clubId, categoria: formGasto.categoria, monto: montoNum, fecha: new Date().toISOString().split('T')[0],
        responsable: 'Tesorero/Admin', descripcion: formGasto.descripcion || formGasto.categoria
      }]);
      if (error) throw error;
      showToast("Gasto registrado correctamente.", "success");
      setModalGasto(false); setFormGasto({ categoria: 'Alquiler Cancha', monto: '', descripcion: '', cajaOrigen: 'Efectivo' });
      cargarEgresosYBalance();
    } catch (err) { showToast("Error al registrar gasto.", "error"); } finally { setCargando(false); }
  };

  const registrarIngresoExtraordinario = async () => {
    const montoNum = parseFloat(formIngresoExtra.monto);
    if (!montoNum || montoNum <= 0) return showToast("Ingresá un monto válido.", "error");
    setCargando(true);
    try {
      const { error } = await supabase.from('tesoreria_ingresos_extra').insert([{
        club_id: clubId, categoria: formIngresoExtra.categoria, monto: montoNum, fecha: new Date().toISOString().split('T')[0],
        descripcion: formIngresoExtra.descripcion || formIngresoExtra.categoria, metodo_pago: formIngresoExtra.metodo_pago
      }]);
      if (error) throw error;
      showToast("Ingreso extraordinario registrado.", "success");
      setModalIngresoExtra(false); setFormIngresoExtra({ categoria: 'Bufet / Cantina', monto: '', descripcion: '', metodo_pago: 'Efectivo' });
      cargarEgresosYBalance();
    } catch (err) { showToast("Error al registrar ingreso extra.", "error"); } finally { setCargando(false); }
  };

  // ==========================================
  // LÓGICA: EMPLEADOS Y SUELDOS 
  // ==========================================
  const cargarEmpleados = async () => {
    setCargando(true);
    try {
      const { data: emp } = await supabase.from('tesoreria_empleados').select('*').eq('club_id', clubId).eq('estado', 'Activo').order('rol');
      
      const primerDia = `${periodo}-01`;
      const ultimoDiaNum = new Date(añoSeleccionado, Number(mesSeleccionado), 0).getDate(); 
      const ultimoDia = `${periodo}-${ultimoDiaNum}`;

      const { data: pagosMes } = await supabase.from('tesoreria_egresos')
        .select('responsable, fecha, monto, categoria, descripcion').eq('club_id', clubId).gte('fecha', primerDia).lte('fecha', ultimoDia);

      const empleadosConEstado = (emp || []).map(e => {
        const nombreEmpleado = e.nombre_completo?.trim().toLowerCase();
        
        // Buscamos si ya se le liquidó el sueldo base (excluimos comisiones)
        const pagoSueldo = (pagosMes || []).find(p => 
          (p.categoria === 'Sueldos y Viáticos' || p.categoria === 'Sueldos') && 
          p.responsable?.trim().toLowerCase() === nombreEmpleado &&
          !p.descripcion?.toLowerCase().includes('comisión') 
        );

        // Sumamos todos los bonos extras/comisiones que tuvo este mes
        const bonosMes = (pagosMes || []).filter(p => 
          p.responsable?.trim().toLowerCase() === nombreEmpleado &&
          p.descripcion?.toLowerCase().includes('comisión')
        ).reduce((acc, curr) => acc + Number(curr.monto), 0);

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
      if (formEmpleado.id) await supabase.from('tesoreria_empleados').update(datosParaBD).eq('id', formEmpleado.id);
      else await supabase.from('tesoreria_empleados').insert([datosParaBD]);
      showToast(formEmpleado.id ? "Empleado actualizado." : "Empleado registrado.", "success");
      setModalEmpleado(false); setFormEmpleado({ id: null, nombre_completo: '', rol: '', sueldo_base: '', jugador_id: '' }); cargarEmpleados();
    } catch (err) { showToast("Error al guardar.", "error"); } finally { setCargando(false); }
  };

  const abrirEdicionEmpleado = (emp) => {
    setFormEmpleado({ id: emp.id, nombre_completo: emp.nombre_completo, rol: emp.rol, sueldo_base: emp.sueldo_base, jugador_id: emp.jugador_id || '' });
    setModalEmpleado(true);
  };

  const registrarPagoSueldo = async () => {
    const pagoNum = parseFloat(formSueldo.monto);
    if (!pagoNum || pagoNum <= 0) return showToast("Monto inválido.", "error");
    setCargando(true);
    try {
      const { error } = await supabase.from('tesoreria_egresos').insert([{
        club_id: clubId, categoria: 'Sueldos y Viáticos', monto: pagoNum, fecha: new Date().toISOString().split('T')[0],
        responsable: modalSueldo.empleado.nombre_completo, descripcion: formSueldo.descripcion || `Sueldo de ${nombreMesVencido}`
      }]);
      if (error) throw error;
      showToast(`Pago registrado con éxito.`, "success");
      setModalSueldo({ visible: false, empleado: null }); setFormSueldo({ monto: '', cajaOrigen: 'Efectivo', descripcion: '' }); cargarEmpleados();
    } catch (err) { showToast("Error al registrar egreso.", "error"); } finally { setCargando(false); }
  };

  // ==========================================
  // LÓGICA: COBROS DE CUOTAS
  // ==========================================
  const cargarTableroCobros = async () => {
    setCargando(true);
    try {
      const { data: jubs, error: jError } = await supabase.from('jugadores').select('id, nombre, apellido, categoria, contacto').eq('club_id', clubId).eq('categoria', categoria).order('apellido');
      if (jError) { showToast("Error al cargar jugadores.", "error"); setJugadoresInfo([]); return; }
      if (!jubs || jubs.length === 0) { setJugadoresInfo([]); return; }

      const idsJugadores = jubs.map(j => { const n = Number(j.id); return Number.isNaN(n) ? String(j.id) : n; }).filter(id => id !== null && id !== undefined);

      let deudas = [];
      const { data: deudasData, error: deudasError } = await supabase.from('tesoreria_deudas').select('*').eq('club_id', clubId).in('jugador_id', idsJugadores);
      if (!deudasError) deudas = deudasData || [];

      if ((deudas.length === 0) || deudasError) {
        const { data: byMonth, error: byMonthErr } = await supabase.from('tesoreria_deudas').select('*').eq('club_id', clubId).eq('mes_correspondiente', periodo);
        if (!byMonthErr && byMonth && byMonth.length > 0) { deudas = byMonth.filter(d => idsJugadores.some(id => String(id) === String(d.jugador_id))); } 
      }

      const hoyDate = new Date();
      const hace30Dias = new Date(); hace30Dias.setDate(hoyDate.getDate() - 30);
      const { data: asist } = await supabase.from('asistencias').select('jugador_id, estado, fecha').eq('club_id', clubId).gte('fecha', hace30Dias.toISOString().split('T')[0]);

      const infoCruzada = (jubs || []).map(j => {
        const misAsistencias = (asist || []).filter(a => String(a.jugador_id) === String(j.id));
        const presentes = misAsistencias.filter(a => a.estado === 'presente' || a.estado === 'tarde').length;
        const porcAsistencia = misAsistencias.length > 0 ? Math.round((presentes / misAsistencias.length) * 100) : null;
        const misDeudas = (deudas || []).filter(d => String(d.jugador_id) === String(j.id));
        const deudaTotal = misDeudas.filter(d => { const st = String(d.estado || '').toLowerCase(); return st === 'pendiente' || st === 'parcial'; }).reduce((acc, d) => acc + (Number(d.monto_original || 0) - Number(d.monto_pagado || 0)), 0);
        const esBecado = misDeudas.some(d => String(d.mes_correspondiente) === periodo && String(d.estado || '').toLowerCase() === 'beca');
        const pagoEsteMes = misDeudas.find(d => String(d.mes_correspondiente) === periodo && String(d.estado || '').toLowerCase() === 'pagada');
        return { ...j, porcAsistencia, misDeudas, deudaTotal, esBecado, pagoEsteMes };
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
      showToast(`Pago registrado con éxito.`, "success"); setModalPago({ visible: false, deuda: null, jugador: null }); setMontoPagar(''); cargarTableroCobros();
    } catch (err) { showToast("Error al procesar pago.", "error"); } finally { setCargando(false); }
  };

  const otorgarBeca = async (deudaId) => {
    if(!window.confirm("¿Confirmás la beca para esta cuota?")) return;
    setCargando(true);
    try { await supabase.from('tesoreria_deudas').update({ estado: 'Beca' }).eq('id', deudaId); showToast("Beca registrada.", "success"); cargarTableroCobros(); } 
    catch (err) { showToast("Error al aplicar beca.", "error"); } finally { setCargando(false); }
  };

  // SI NO TIENE PERMISOS, LO REBOTAMOS ACÁ
  if (!accesoPermitido) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', animation: 'fadeIn 0.3s' }}>
        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🔒</div>
        <h2 style={{ color: '#ef4444' }}>ACCESO RESTRINGIDO</h2>
        <p style={{ color: 'var(--text-dim)' }}>Este módulo contiene información financiera sensible.<br/>Solo administradores o tesoreros pueden ingresar.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', animation: 'fadeIn 0.3s', paddingBottom: '80px' }}>
      
      {/* NAVEGACIÓN PRINCIPAL Y SELECTOR DE PERIODO */}
      <div className="bento-card" style={{ marginBottom: '20px', border: '1px solid #3b82f6', background: 'var(--panel)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div className="stat-label" style={{ color: '#3b82f6' }}>MÓDULO FINANCIERO</div>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>TESORERÍA Y CAJA</h2>
          </div>
          
          {/* MÁQUINA DEL TIEMPO */}
          <div style={{ background: '#0a0a0a', padding: '10px 15px', borderRadius: '8px', border: '1px solid #333' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>PERÍODO ACTIVO</span>
            <input 
              type="month" 
              value={periodo} 
              onChange={(e) => setPeriodo(e.target.value)} 
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
            />
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

      {cargando && !modalSueldo.visible && !modalEmpleado && !modalGasto && !modalIngresoExtra && !modalGenerar && !modalPago.visible ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#3b82f6' }}>Consultando libros contables... ⏳</div>
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
                    <option value="Primera">Primera</option><option value="Reserva">Reserva</option><option value="Tercera">Tercera</option><option value="Cuarta">Cuarta</option>
                  </select>
                  <h3 style={{ margin: 0 }}>Estado de Cuenta</h3>
                </div>
                <button onClick={() => setModalGenerar(true)} style={{ background: '#a855f7', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span>⚙️</span> GENERAR CUOTAS MASIVAS
                </button>
              </div>

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
                      const deudaACobrar = misDeudasSeguras.find(d => ['Pendiente', 'Parcial'].includes(d.estado));

                      return (
                        <tr key={j.id} style={{ borderBottom: '1px solid #222' }}>
                          <td style={{ padding: '15px 12px', fontWeight: 'bold' }}>{j.apellido}, {j.nombre}</td>
                          <td style={{ textAlign: 'center' }}>
                            {j.porcAsistencia !== null && j.porcAsistencia !== undefined ? (
                              <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: j.porcAsistencia < 50 ? '#7f1d1d' : 'transparent', color: j.porcAsistencia < 50 ? '#fff' : j.porcAsistencia < 75 ? '#f59e0b' : '#00ff88' }}>
                                {j.porcAsistencia}% {j.porcAsistencia < 50 && '⚠️ Riesgo'}
                              </span>
                            ) : <span style={{ color: '#555', fontSize: '0.7rem' }}>Sin datos</span>}
                          </td>
                          <td style={{ padding: '12px' }}>
                            {j.esBecado ? (
                              <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>🎓 BECADO / EXENTO</span>
                            ) : j.deudaTotal > 0 ? (
                              <div>
                                <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.1rem' }}>${j.deudaTotal.toLocaleString()}</span>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                  {misDeudasSeguras.filter(d => ['Pendiente', 'Parcial'].includes(d.estado)).length} concepto(s) pend.
                                </div>
                              </div>
                            ) : j.pagoEsteMes ? (
                              <span style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.8rem' }}>✅ PAGADO ESTE MES</span>
                            ) : (
                              <span style={{ color: '#888', fontWeight: 'bold', fontSize: '0.8rem' }}>AL DÍA (Sin deuda)</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            {j.deudaTotal > 0 && !j.esBecado && deudaACobrar && (
                              <>
                                <button onClick={() => enviarWhatsApp(j, j.deudaTotal)} style={{ background: 'transparent', color: '#25D366', border: '1px solid #25D366', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }} title="Reclamar por WhatsApp">
                                  💬 AVISAR
                                </button>
                                <button onClick={() => otorgarBeca(deudaACobrar.id)} style={{ background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem' }} title="Eximir pago">
                                  🎓 BECAR
                                </button>
                                <button onClick={() => setModalPago({ visible: true, deuda: deudaACobrar, jugador: j })} style={{ background: '#00ff88', color: '#000', padding: '6px 15px', borderRadius: '4px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>
                                  💸 COBRAR
                                </button>
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
            </div>
          )}

          {/* ==================================================== */}
          {/* VISTA 2: STAFF Y EMPLEADOS (SIN JUGADORES)           */}
          {/* ==================================================== */}
          {vista === 'staff' && (
            <div className="bento-card" style={{ borderTop: '3px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, color: '#f59e0b' }}>Liquidación Staff - {nombreMesVencido}</h3>
                <button onClick={() => { setFormEmpleado({ id: null, nombre_completo: '', rol: '', sueldo_base: '', jugador_id: '' }); setModalEmpleado(true); }} style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  + NUEVO EMPLEADO
                </button>
              </div>

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
                            <span style={{ background: '#7f1d1d', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>❌ PENDIENTE</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>${Number(emp.sueldo_base).toLocaleString()}</div>
                          {emp.bonosExtra > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#00ff88', fontWeight: 'bold', background: 'rgba(0,255,136,0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                              🌟 + ${emp.bonosExtra.toLocaleString()} (Bonos/Comisión)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                          <button onClick={() => abrirEdicionEmpleado(emp)} style={{ background: 'transparent', color: '#fff', border: '1px solid #555', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }} title="Editar Datos">✏️</button>
                          {emp.pagoEsteMes ? (
                             <button disabled style={{ background: '#222', color: '#555', border: '1px solid #333', padding: '6px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'not-allowed', fontSize: '0.8rem' }}>✅ LIQUIDADO</button>
                          ) : (
                             <button onClick={() => { setFormSueldo({...formSueldo, monto: emp.sueldo_base, descripcion: `Sueldo de ${nombreMesVencido}`}); setModalSueldo({ visible: true, empleado: emp }); }} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>💳 PAGAR BASE</button>
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
            </div>
          )}

          {/* ==================================================== */}
          {/* VISTA 3: JUGADORES CON VIÁTICOS Y COMISIONES         */}
          {/* ==================================================== */}
          {vista === 'viaticos' && (
            <div className="bento-card" style={{ borderTop: '3px solid #a855f7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, color: '#a855f7' }}>Viáticos de Jugadores - {nombreMesVencido}</h3>
                <button onClick={() => { setFormEmpleado({ id: null, nombre_completo: '', rol: '', sueldo_base: '', jugador_id: '' }); setModalEmpleado(true); }} style={{ background: '#a855f7', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  + ASIGNAR VIÁTICO
                </button>
              </div>

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
                            <span style={{ background: '#7f1d1d', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>❌ PENDIENTE</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>${Number(emp.sueldo_base).toLocaleString()}</div>
                          {emp.bonosExtra > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#00ff88', fontWeight: 'bold', background: 'rgba(0,255,136,0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                              🌟 + ${emp.bonosExtra.toLocaleString()} (Comisión Sponsor)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                          <button onClick={() => abrirEdicionEmpleado(emp)} style={{ background: 'transparent', color: '#fff', border: '1px solid #555', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }} title="Editar Datos">✏️</button>
                          {emp.pagoEsteMes ? (
                             <button disabled style={{ background: '#222', color: '#555', border: '1px solid #333', padding: '6px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'not-allowed', fontSize: '0.8rem' }}>✅ LIQUIDADO</button>
                          ) : (
                             <button onClick={() => { setFormSueldo({...formSueldo, monto: emp.sueldo_base, descripcion: `Viático de ${nombreMesVencido}`}); setModalSueldo({ visible: true, empleado: emp }); }} style={{ background: '#a855f7', color: '#fff', border: 'none', padding: '6px 15px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>💳 PAGAR VIÁTICO</button>
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
            </div>
          )}

          {/* ==================================================== */}
          {/* VISTA 4: CAJA COMPLETA (LIBRO MAYOR Y EXTRAS)        */}
          {/* ==================================================== */}
          {vista === 'egresos' && (
            <>
              {/* DASHBOARD DE CAJA */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <div style={{ background: '#111', padding: '20px', borderRadius: '12px', border: '1px solid #00ff88', textAlign: 'center' }}>
                  <div className="stat-label">INGRESOS DEL MES</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#00ff88' }}>+ ${balance.ingresos.toLocaleString()}</div>
                </div>
                <div style={{ background: '#111', padding: '20px', borderRadius: '12px', border: '1px solid #ef4444', textAlign: 'center' }}>
                  <div className="stat-label">SALIDAS DEL MES</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444' }}>- ${balance.egresos.toLocaleString()}</div>
                </div>
                <div style={{ background: '#0a0a0a', padding: '20px', borderRadius: '12px', border: `2px solid ${(balance.ingresos - balance.egresos) >= 0 ? '#3b82f6' : '#ef4444'}`, textAlign: 'center' }}>
                  <div className="stat-label" style={{ color: '#fff' }}>BALANCE FINAL</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: (balance.ingresos - balance.egresos) >= 0 ? '#3b82f6' : '#ef4444' }}>
                    ${(balance.ingresos - balance.egresos).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* TABLA DE FLUJO DE CAJA (LIBRO MAYOR) */}
              <div className="bento-card" style={{ borderTop: '3px solid #00ff88' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                  <h3 style={{ margin: 0, color: '#00ff88' }}>Libro Mayor (Flujo Detallado)</h3>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => setModalIngresoExtra(true)} style={{ background: '#00ff88', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                      + INGRESAR PLATA
                    </button>
                    <button onClick={() => setModalGasto(true)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                      - REGISTRAR SALIDA
                    </button>
                  </div>
                </div>

                <div className="table-wrapper">
                  <table style={{ width: '100%', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-dim)', fontSize: '0.75rem', background: '#0a0a0a' }}>
                        <th style={{ padding: '12px' }}>FECHA</th>
                        <th style={{ padding: '12px' }}>TIPO / CATEGORÍA</th>
                        <th style={{ padding: '12px' }}>DESCRIPCIÓN</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>MONTO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cajaCompleta.map(mov => (
                        <tr key={mov.id} style={{ borderBottom: '1px solid #222' }}>
                          <td style={{ padding: '15px 12px', color: '#aaa', fontSize: '0.85rem' }}>{mov.fecha.split('-').reverse().join('/')}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              background: mov.tipo === 'entrada' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                              color: mov.tipo === 'entrada' ? '#00ff88' : '#ef4444', 
                              border: `1px solid ${mov.tipo === 'entrada' ? '#00ff88' : '#ef4444'}`, 
                              padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' 
                            }}>
                              {mov.tipo === 'entrada' ? '⬇️' : '⬆️'} {mov.categoria}
                            </span>
                          </td>
                          <td style={{ padding: '12px', fontSize: '0.85rem' }}>{mov.descripcion}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 900, fontSize: '1.1rem', color: mov.tipo === 'entrada' ? '#00ff88' : '#ef4444' }}>
                            {mov.tipo === 'entrada' ? '+' : '-'} ${Number(mov.monto).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {cajaCompleta.length === 0 && (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No hay movimientos registrados este mes.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ==================================================== */}
          {/* VISTA 5: REPORTES Y KPI (DASHBOARD PRO)              */}
          {/* ==================================================== */}
          {vista === 'reportes' && datosReporte && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              
              {/* FILA 1: KPIs PRINCIPALES */}
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
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: datosReporte.cajaReal >= 0 ? '#3b82f6' : '#ef4444' }}>
                    ${datosReporte.cajaReal.toLocaleString()}
                  </div>
                  <div className="stat-label">CAJA FUERTE DISPONIBLE</div>
                </div>
                <div style={{ flex: 1, minWidth: '150px', borderLeft: '1px solid #333', paddingLeft: '10px' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: datosReporte.tasaCobrabilidad > 75 ? '#00ff88' : '#f59e0b' }}>
                    {datosReporte.tasaCobrabilidad}%
                  </div>
                  <div className="stat-label">TASA DE COBRABILIDAD</div>
                </div>
              </div>

              {/* FILA 2: GRÁFICOS */}
              <div className="bento-card" style={{ height: '350px' }}>
                 <div className="stat-label" style={{ marginBottom: '15px' }}>FLUJO DE CAJA MENSUAL</div>
                 <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={datosReporte.dataMeses}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false}/>
                      <XAxis dataKey="name" stroke="#555" fontSize={10}/>
                      <YAxis stroke="#555" fontSize={10} width={60} tickFormatter={(val) => `$${val/1000}k`} />
                      <Tooltip contentStyle={{background:'#111', border:'1px solid #333', borderRadius:'8px'}} itemStyle={{ color: '#fff', fontWeight: 'bold' }} labelStyle={{ color: '#aaa', marginBottom: '5px' }} />
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
                          {datosReporte.dataTortaIngresos.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{background:'#111', border:'1px solid #333', borderRadius:'8px'}} itemStyle={{ color: '#fff', fontWeight: 'bold' }} formatter={(val) => `$${val.toLocaleString()}`} />
                      </PieChart>
                   </ResponsiveContainer>
                   <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#888' }}>Total</div>
                      <div style={{ fontWeight: 'bold' }}>${datosReporte.ingresosTotal.toLocaleString()}</div>
                   </div>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', fontSize: '0.75rem', marginTop: '10px' }}>
                    <span style={{ color: '#3b82f6' }}>■ Cuotas Sociales</span>
                    <span style={{ color: '#a855f7' }}>■ Sponsors</span>
                    <span style={{ color: '#00ff88' }}>■ Extras</span>
                 </div>
              </div>

              {/* FILA 3: LISTAS DE CUIDADO */}
              <div className="bento-card" style={{ gridColumn: '1 / -1', display: 'flex', gap: '20px', flexWrap: 'wrap', background: 'transparent', border: 'none', padding: 0 }}>
                
                {/* TOP 5 MOROSOS */}
                <div style={{ flex: 1, minWidth: '300px', background: '#111', padding: '20px', borderRadius: '12px', border: '1px solid #ef4444' }}>
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

                {/* DISTRIBUCIÓN DE EGRESOS */}
                <div style={{ flex: 1, minWidth: '300px', background: '#111', padding: '20px', borderRadius: '12px', border: '1px solid #333' }}>
                  <div className="stat-label" style={{ marginBottom: '15px' }}>DISTRIBUCIÓN DE EGRESOS</div>
                  <div style={{ height: '200px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={datosReporte.dataCat} layout="vertical" margin={{ left: 30, right: 20 }}>
                          <XAxis type="number" hide />
                          <YAxis dataKey="nombre" type="category" stroke="#888" fontSize={10} width={90} />
                          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ background: '#000', border: '1px solid #333', borderRadius:'8px' }} itemStyle={{ color: '#fff', fontWeight: 'bold' }} labelStyle={{ color: '#aaa' }} formatter={(val) => `$${val.toLocaleString()}`} />
                          <Bar dataKey="monto" radius={[0, 4, 4, 0]} barSize={15}>
                            {datosReporte.dataCat.map((entry, index) => (
                              <Cell key={index} fill={entry.nombre === 'Sueldos y Viáticos' ? '#f59e0b' : '#333'} />
                            ))}
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
      {/* MODAL 1: GENERAR CUOTAS MASIVAS                      */}
      {/* ==================================================== */}
      {modalGenerar && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '450px', border: '1px solid #a855f7' }}>
            <h3 style={{ marginTop: 0, color: '#a855f7' }}>Generar Obligaciones Masivas</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Se creará una deuda para todos los jugadores de <strong>{categoria}</strong>. Si un jugador ya tiene este concepto, será ignorado para evitar duplicados.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div>
                <label style={lblStyle}>Concepto de Pago</label>
                <input type="text" value={formCuota.concepto} onChange={(e) => setFormCuota({...formCuota, concepto: e.target.value})} style={inputFormStyle} />
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={lblStyle}>Monto Total ($)</label>
                  <input type="number" value={formCuota.monto} onChange={(e) => setFormCuota({...formCuota, monto: e.target.value})} placeholder="Ej: 15000" style={inputFormStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lblStyle}>Mes Contable</label>
                  <input type="month" value={formCuota.mes} onChange={(e) => setFormCuota({...formCuota, mes: e.target.value})} style={inputFormStyle} />
                </div>
              </div>
              <div>
                <label style={lblStyle}>Fecha Límite</label>
                <input type="date" value={formCuota.vencimiento} onChange={(e) => setFormCuota({...formCuota, vencimiento: e.target.value})} style={inputFormStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalGenerar(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={generarCuotasMasivas} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#a855f7', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>
                {cargando ? 'CREANDO...' : 'GENERAR A TODOS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 2: COBRAR CUOTA                                */}
      {/* ==================================================== */}
      {modalPago.visible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '400px', border: '1px solid #00ff88' }}>
            <h3 style={{ marginTop: 0, color: '#00ff88' }}>Registrar Ingreso</h3>
            <div style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #333' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Abonando a cuenta de:</div>
              <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>{modalPago.jugador.apellido}, {modalPago.jugador.nombre}</div>
              <div style={{ fontSize: '0.8rem', color: '#3b82f6', marginTop: '5px' }}>📌 {modalPago.deuda.concepto}</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={lblStyle}>Deuda restante ($)</label>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444' }}>
                  ${(modalPago.deuda.monto_original - modalPago.deuda.monto_pagado).toLocaleString()}
                </div>
              </div>
              <div>
                <label style={lblStyle}>¿Cuánto paga ahora?</label>
                <input type="number" value={montoPagar} onChange={(e) => setMontoPagar(e.target.value)} placeholder="Monto a ingresar..." style={{ ...inputFormStyle, borderColor: '#00ff88', fontSize: '1.2rem', padding: '15px' }} />
              </div>
              
              {/* === NUEVO COMPONENTE: COBRAR CUOTA === */}
              <PaymentSelector onMethodSelect={(metodo) => setMetodoPago(metodo)} />
              {/* ====================================== */}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => {setModalPago({visible: false, deuda: null, jugador: null}); setMontoPagar('');}} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>CANCELAR</button>
              <button onClick={procesarPago} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#00ff88', border: 'none', color: '#000', fontWeight: '900', borderRadius: '6px', cursor: 'pointer' }}>
                {cargando ? 'PROCESANDO...' : '💸 CONFIRMAR COBRO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 3: ALTA / EDICIÓN DE EMPLEADO                  */}
      {/* ==================================================== */}
      {modalEmpleado && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '450px', border: '1px solid #f59e0b' }}>
            <h3 style={{ marginTop: 0, color: '#f59e0b' }}>{formEmpleado.id ? 'Modificar Empleado' : 'Alta de Personal / Viáticos'}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div style={{ background: '#111', padding: '10px', borderRadius: '6px', border: '1px solid #333' }}>
                <label style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold' }}>¿Es jugador del club?</label>
                <select 
                  value={formEmpleado.jugador_id} 
                  onChange={(e) => {
                    const jId = e.target.value;
                    const jSel = jugadoresInfo.find(j => String(j.id) === jId);
                    setFormEmpleado({ ...formEmpleado, jugador_id: jId, nombre_completo: jSel ? `${jSel.nombre} ${jSel.apellido}` : formEmpleado.nombre_completo });
                  }} 
                  style={{ ...inputFormStyle, border: 'none', background: 'transparent', padding: '5px 0' }}
                >
                  <option value="">No, es personal externo.</option>
                  {jugadoresInfo.map(j => <option key={j.id} value={j.id}>{j.apellido}, {j.nombre}</option>)}
                </select>
              </div>

              <div>
                <label style={lblStyle}>Nombre Completo</label>
                <input type="text" value={formEmpleado.nombre_completo} onChange={(e) => setFormEmpleado({...formEmpleado, nombre_completo: e.target.value})} style={inputFormStyle} disabled={formEmpleado.jugador_id !== ''} />
              </div>
              
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={lblStyle}>Rol / Cargo</label>
                  <input type="text" value={formEmpleado.rol} onChange={(e) => setFormEmpleado({...formEmpleado, rol: e.target.value})} style={inputFormStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lblStyle}>Sueldo / Viático ($)</label>
                  <input type="number" value={formEmpleado.sueldo_base} onChange={(e) => setFormEmpleado({...formEmpleado, sueldo_base: e.target.value})} style={inputFormStyle} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalEmpleado(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={guardarEmpleado} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#f59e0b', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>
                {cargando ? 'GUARDANDO...' : 'GUARDAR DATOS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 4: PAGO DE SUELDO                              */}
      {/* ==================================================== */}
      {modalSueldo.visible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '420px', border: '1px solid #ef4444' }}>
            <h3 style={{ marginTop: 0, color: '#ef4444' }}>Liquidar Sueldo de {nombreMesVencido}</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Registrando pago para <strong>{modalSueldo.empleado.nombre_completo}</strong>.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={lblStyle}>Monto a registrar ($)</label>
                <input type="number" value={formSueldo.monto} onChange={(e) => setFormSueldo({...formSueldo, monto: e.target.value})} style={{ ...inputFormStyle, borderColor: '#ef4444', fontSize: '1.2rem', padding: '15px' }} />
              </div>

              {/* === NUEVO COMPONENTE: PAGO DE SUELDO === */}
              <PaymentSelector 
                 onMethodSelect={(metodo) => setFormSueldo({...formSueldo, cajaOrigen: metodo})} 
              />
              {/* ======================================== */}

              <div>
                <label style={lblStyle}>Detalle / Concepto</label>
                <input type="text" value={formSueldo.descripcion} onChange={(e) => setFormSueldo({...formSueldo, descripcion: e.target.value})} style={inputFormStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalSueldo({visible: false, empleado: null})} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={registrarPagoSueldo} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>CONFIRMAR EGRESO</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 5: REGISTRAR GASTO GENERAL                     */}
      {/* ==================================================== */}
      {modalGasto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '400px', border: '1px solid #ef4444' }}>
            <h3 style={{ marginTop: 0, color: '#ef4444' }}>Registrar Gasto del Club</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div>
                <label style={lblStyle}>Categoría del Gasto</label>
                <select value={formGasto.categoria} onChange={(e) => setFormGasto({...formGasto, categoria: e.target.value})} style={inputFormStyle}>
                  <option value="Alquiler Cancha">🏟️ Alquiler de Cancha</option>
                  <option value="Arbitrajes">⚖️ Arbitrajes / Liga</option>
                  <option value="Materiales">⚽ Materiales Deportivos</option>
                  <option value="Mantenimiento">🛠️ Mantenimiento / Obras</option>
                  <option value="Comisiones / Terceros">🤝 Comisiones Agentes</option>
                  <option value="Varios">🛒 Varios / Otros</option>
                </select>
              </div>
              <div>
                <label style={lblStyle}>Monto a descontar ($)</label>
                <input type="number" value={formGasto.monto} onChange={(e) => setFormGasto({...formGasto, monto: e.target.value})} style={{ ...inputFormStyle, borderColor: '#ef4444', fontSize: '1.2rem', padding: '15px' }} />
              </div>

              {/* === NUEVO COMPONENTE: GASTO GENERAL === */}
              <PaymentSelector onMethodSelect={(metodo) => setFormGasto({...formGasto, cajaOrigen: metodo})} />
              {/* ======================================= */}

              <div>
                <label style={lblStyle}>Descripción (Opcional)</label>
                <input type="text" value={formGasto.descripcion} onChange={(e) => setFormGasto({...formGasto, descripcion: e.target.value})} placeholder="Ej: Pago referí domingo" style={inputFormStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalGasto(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={registrarGastoGeneral} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>
                REGISTRAR SALIDA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 6: INGRESO EXTRAORDINARIO                      */}
      {/* ==================================================== */}
      {modalIngresoExtra && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '400px', border: '1px solid #00ff88' }}>
            <h3 style={{ marginTop: 0, color: '#00ff88' }}>Ingreso Extraordinario</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div>
                <label style={lblStyle}>Origen de la plata</label>
                <select value={formIngresoExtra.categoria} onChange={(e) => setFormIngresoExtra({...formIngresoExtra, categoria: e.target.value})} style={inputFormStyle}>
                  <option value="Bufet / Cantina">🍔 Bufet / Cantina</option>
                  <option value="Rifas / Eventos">🎟️ Rifas / Eventos</option>
                  <option value="Venta Indumentaria">👕 Venta Indumentaria</option>
                  <option value="Donaciones">🎁 Donaciones</option>
                  <option value="Otros Ingresos">💰 Otros Ingresos</option>
                </select>
              </div>
              <div>
                <label style={lblStyle}>Monto a ingresar ($)</label>
                <input type="number" value={formIngresoExtra.monto} onChange={(e) => setFormIngresoExtra({...formIngresoExtra, monto: e.target.value})} style={{ ...inputFormStyle, borderColor: '#00ff88', fontSize: '1.2rem', padding: '15px' }} />
              </div>

              {/* === NUEVO COMPONENTE: INGRESO EXTRA === */}
              <PaymentSelector onMethodSelect={(metodo) => setFormIngresoExtra({...formIngresoExtra, metodo_pago: metodo})} />
              {/* ======================================= */}

              <div>
                <label style={lblStyle}>Descripción (Opcional)</label>
                <input type="text" value={formIngresoExtra.descripcion} onChange={(e) => setFormIngresoExtra({...formIngresoExtra, descripcion: e.target.value})} placeholder="Ej: Recaudación bingo familiar" style={inputFormStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalIngresoExtra(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={registrarIngresoExtraordinario} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#00ff88', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>
                SUMAR A CAJA
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const tabBtn = { padding: '10px 15px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '900', transition: '0.2s' };
const selectStyle = { padding: '8px 15px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '8px', fontWeight: 'bold', outline: 'none' };
const inputFormStyle = { width: '100%', padding: '10px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: '6px', marginTop: '5px', outline: 'none' };
const lblStyle = { fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' };

export default Tesoreria;