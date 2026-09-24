/* Un celular argentino, como lo escribe cualquiera, al formato que pide
   WhatsApp: sólo dígitos, con 54 9 adelante.

     "11 5555-5555"        → 5491155555555
     "011 15 5555-5555"    → 5491155555555
     "0351 15 555-5555"    → 5493515555555
     "+54 11 5555-5555"    → 5491155555555   (le falta el 9 de celular)
     "5491155555555"       → igual            (como lo guarda el bot)

   Sin el 549, wa.me abre un chat con un número que no existe y WhatsApp
   dice "el número no está en WhatsApp". null si no alcanza para un número.

   Mismo criterio que telefonoWhatsApp() del smart-service. */
export function telefonoWhatsApp(contacto) {
  let d = String(contacto ?? '').replace(/\D/g, '');
  if (!d) return null;

  if (d.startsWith('549') && d.length === 13) return d;
  if (d.startsWith('54') && d.length === 12) return `549${d.slice(2)}`;
  if (d.startsWith('00')) d = d.slice(2);        // 0054...
  if (d.startsWith('54') && d.length >= 12) return d.startsWith('549') ? d : `549${d.slice(2)}`;

  if (d.startsWith('0')) d = d.slice(1);          // 011..., 0351...
  if (d.length === 12) {
    // Característica de 2, 3 o 4 dígitos seguida del 15 de celular.
    for (const pos of [2, 3, 4]) {
      if (d.slice(pos, pos + 2) === '15') { d = d.slice(0, pos) + d.slice(pos + 2); break; }
    }
  }
  if (d.length === 10) return `549${d}`;

  // Otro país u otro formato: se manda como está si parece internacional.
  return d.length >= 11 ? d : null;
}

/* Link de WhatsApp con el mensaje escrito. Sin número válido, abre WhatsApp
   para elegir el contacto a mano. */
export function linkWhatsApp(contacto, texto = '') {
  const tel = telefonoWhatsApp(contacto);
  const msg = encodeURIComponent(texto);
  return tel
    ? `https://api.whatsapp.com/send?phone=${tel}&text=${msg}`
    : `https://api.whatsapp.com/send?text=${msg}`;
}
