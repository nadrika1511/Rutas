// ===== IMPORTACIONES DE FIREBASE =====
import { db } from './firebase-config.js';
import { 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    doc, 
    query, 
    where 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Variables globales
let todosLosPrestamos = [];
let cobradores = new Map();
let rutaActual = null;

// ===== CARGAR COBRADORES =====
async function cargarCobradores() {
    try {
        console.log('🔄 Cargando préstamos desde Firebase...');
        
        const prestamosRef = collection(db, 'prestamos');
        const snapshot = await getDocs(prestamosRef);
        
        // CRÍTICO: No agrupamos por cliente, guardamos TODOS los documentos
        todosLosPrestamos = [];
        cobradores.clear();
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const prestamo = {
                id: docSnap.id,  // ID del documento
                numeroPrestamo: data.numeroPrestamo || 'N/A',
                Nombre: data.Nombre || 'Sin nombre',
                cobrador: data.cobrador || 'Sin cobrador',
                municipio: data.municipio || 'N/A',
                departamento: data.departamento || 'N/A',
                direccion: data.direccion || 'N/A',
                dpi: data.dpi || '',
                tipoVisita: data.tipoVisita || 'domiciliar',
                visitado: data.visitado || false,
                ubicacion: data.ubicacion || {},
                fechaImportacion: data.fechaImportacion || null,
                fechaVisita: data.fechaVisita || null,
                ubicacionReal: data.ubicacionReal || null
            };
            
            // Agregar TODOS los préstamos sin filtrar
            todosLosPrestamos.push(prestamo);
            
            // Agrupar por cobrador
            const nombreCobrador = prestamo.cobrador;
            if (!cobradores.has(nombreCobrador)) {
                cobradores.set(nombreCobrador, []);
            }
            cobradores.get(nombreCobrador).push(prestamo);
        });
        
        mostrarCobradores();
        
        console.log(`✅ Total préstamos cargados: ${todosLosPrestamos.length}`);
        console.log(`✅ Total cobradores: ${cobradores.size}`);
        
        // Mostrar desglose por cobrador
        cobradores.forEach((prestamos, nombre) => {
            const domiciliares = prestamos.filter(p => p.tipoVisita === 'domiciliar').length;
            const laborales = prestamos.filter(p => p.tipoVisita === 'laboral').length;
            console.log(`   ${nombre}: ${prestamos.length} préstamos (D:${domiciliares} L:${laborales})`);
        });
        
    } catch (error) {
        console.error('❌ Error cargando cobradores:', error);
        alert('Error al cargar los datos: ' + error.message);
    }
}

// ===== MOSTRAR COBRADORES EN EL SELECTOR =====
function mostrarCobradores() {
    const cobradorSelect = document.getElementById('cobradorSelect');
    if (!cobradorSelect) {
        console.warn('⚠️ No se encontró el elemento cobradorSelect');
        return;
    }
    
    cobradorSelect.innerHTML = '<option value="">-- Seleccionar Cobrador --</option>';
    
    // Ordenar cobradores alfabéticamente
    const cobradoresArray = Array.from(cobradores.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    cobradoresArray.forEach(([nombre, prestamos]) => {
        const option = document.createElement('option');
        option.value = nombre;
        
        // Contar préstamos por tipo
        const domiciliares = prestamos.filter(p => p.tipoVisita === 'domiciliar').length;
        const laborales = prestamos.filter(p => p.tipoVisita === 'laboral').length;
        
        option.textContent = `${nombre} (${prestamos.length} - D:${domiciliares} L:${laborales})`;
        cobradorSelect.appendChild(option);
    });
    
    console.log(`✅ ${cobradoresArray.length} cobradores cargados en el selector`);
}

// ===== OBTENER PRÉSTAMOS POR COBRADOR =====
function obtenerPrestamosPorCobrador(nombreCobrador) {
    if (!nombreCobrador) {
        console.warn('⚠️ No se proporcionó nombre de cobrador');
        return [];
    }
    
    // CRÍTICO: Retornar TODOS los préstamos del cobrador, sin agrupar por cliente
    const prestamos = cobradores.get(nombreCobrador) || [];
    
    console.log(`\n📊 Estadísticas para: ${nombreCobrador}`);
    console.log(`   Total registros: ${prestamos.length}`);
    console.log(`   Domiciliares: ${prestamos.filter(p => p.tipoVisita === 'domiciliar').length}`);
    console.log(`   Laborales: ${prestamos.filter(p => p.tipoVisita === 'laboral').length}`);
    console.log(`   Visitados: ${prestamos.filter(p => p.visitado === true).length}`);
    console.log(`   Pendientes: ${prestamos.filter(p => p.visitado === false).length}`);
    
    return prestamos;
}

// ===== GENERAR RUTA OPTIMIZADA =====
function generarRutaOptimizada() {
    const cobradorSelect = document.getElementById('cobradorSelect');
    const puntoInicioInput = document.getElementById('puntoInicio');
    const minimoVisitasInput = document.getElementById('minimoVisitas');
    
    if (!cobradorSelect || !cobradorSelect.value) {
        alert('❌ Por favor selecciona un cobrador');
        return;
    }
    
    if (!puntoInicioInput || !puntoInicioInput.value.trim()) {
        alert('❌ Por favor ingresa el punto de inicio (lat,lng)');
        return;
    }
    
    const puntoInicio = puntoInicioInput.value.trim();
    const minimoVisitas = parseInt(minimoVisitasInput?.value) || 10;
    
    const coords = puntoInicio.split(',').map(coord => parseFloat(coord.trim()));
    
    if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) {
        alert('❌ Formato de coordenadas inválido. Usa: lat,lng\nEjemplo: 14.6349,-90.5069');
        return;
    }
    
    const [lat, lng] = coords;
    
    console.log(`\n🚀 Generando ruta para ${cobradorSelect.value}`);
    console.log(`   Punto inicio: ${lat}, ${lng}`);
    console.log(`   Mínimo visitas: ${minimoVisitas}`);
    
    // Obtener TODOS los préstamos del cobrador
    const todosPrestamos = obtenerPrestamosPorCobrador(cobradorSelect.value);
    
    // Filtrar solo los que NO han sido visitados y tienen ubicación válida
    const prestamosDisponibles = todosPrestamos.filter(prestamo => {
        const tieneUbicacion = prestamo.ubicacion && 
                              prestamo.ubicacion.lat && 
                              prestamo.ubicacion.lng &&
                              prestamo.ubicacion.tipo === 'coordenadas';
        const noVisitado = !prestamo.visitado;
        
        return noVisitado && tieneUbicacion;
    });
    
    console.log(`   Préstamos disponibles: ${prestamosDisponibles.length}`);
    
    if (prestamosDisponibles.length === 0) {
        alert('❌ No hay préstamos disponibles con ubicación GPS para este cobrador');
        return;
    }
    
    if (prestamosDisponibles.length < minimoVisitas) {
        const continuar = confirm(
            `⚠️ Solo hay ${prestamosDisponibles.length} préstamos disponibles, ` +
            `menos del mínimo solicitado (${minimoVisitas}).\n\n¿Continuar con todos los disponibles?`
        );
        if (!continuar) return;
    }
    
    // Algoritmo Nearest Neighbor
    const rutaOptimizada = nearestNeighbor({ lat, lng }, prestamosDisponibles, minimoVisitas);
    
    console.log(`✅ Ruta generada con ${rutaOptimizada.length} visitas`);
    
    // Mostrar en mapa y tabla
    mostrarMapaRuta(rutaOptimizada, { lat, lng });
    mostrarTablaRuta(rutaOptimizada);
    
    // Habilitar botones
    const btnGuardar = document.getElementById('btnGuardarRuta');
    const btnDescargar = document.getElementById('btnDescargarPDF');
    if (btnGuardar) btnGuardar.disabled = false;
    if (btnDescargar) btnDescargar.disabled = false;
    
    // Guardar en variable global
    rutaActual = {
        cobrador: cobradorSelect.value,
        puntoInicio: { lat, lng },
        prestamos: rutaOptimizada,
        fecha: new Date().toISOString()
    };
}

// ===== ALGORITMO NEAREST NEIGHBOR =====
function nearestNeighbor(puntoInicio, prestamos, minimoVisitas) {
    const rutaOptimizada = [];
    const prestamosRestantes = [...prestamos];
    let puntoActual = puntoInicio;
    
    const maxVisitas = Math.min(minimoVisitas, prestamosRestantes.length);
    
    while (rutaOptimizada.length < maxVisitas && prestamosRestantes.length > 0) {
        let indexMasCercano = -1;
        let distanciaMinima = Infinity;
        
        // Buscar el préstamo más cercano
        prestamosRestantes.forEach((prestamo, index) => {
            const distancia = calcularDistancia(
                puntoActual.lat,
                puntoActual.lng,
                prestamo.ubicacion.lat,
                prestamo.ubicacion.lng
            );
            
            if (distancia < distanciaMinima) {
                distanciaMinima = distancia;
                indexMasCercano = index;
            }
        });
        
        if (indexMasCercano !== -1) {
            const prestamoMasCercano = prestamosRestantes.splice(indexMasCercano, 1)[0];
            rutaOptimizada.push({
                ...prestamoMasCercano,
                distancia: distanciaMinima,
                tiempo: calcularTiempo(distanciaMinima)
            });
            puntoActual = prestamoMasCercano.ubicacion;
        }
    }
    
    return rutaOptimizada;
}

// ===== CALCULAR DISTANCIA (Haversine) =====
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distancia = R * c;
    
    return distancia;
}

// ===== CALCULAR TIEMPO =====
function calcularTiempo(distanciaKm) {
    const velocidadPromedio = 30; // km/h
    const tiempoHoras = distanciaKm / velocidadPromedio;
    const tiempoMinutos = tiempoHoras * 60;
    return Math.round(tiempoMinutos);
}

// ===== MOSTRAR MAPA DE RUTA =====
function mostrarMapaRuta(ruta, puntoInicio) {
    const mapaContainer = document.getElementById('mapaRuta');
    if (!mapaContainer) {
        console.warn('⚠️ No se encontró el elemento mapaRuta');
        return;
    }
    
    // Limpiar mapa anterior
    mapaContainer.innerHTML = '';
    
    // Crear mapa con Leaflet
    const mapa = L.map('mapaRuta').setView([puntoInicio.lat, puntoInicio.lng], 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapa);
    
    // Marcador de inicio
    L.marker([puntoInicio.lat, puntoInicio.lng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color:#4CAF50;color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:bold;'>🏁</div>",
            iconSize: [30, 30]
        })
    }).addTo(mapa).bindPopup('<strong>Punto de Inicio</strong>');
    
    // Marcadores de cada préstamo
    const coordenadas = [[puntoInicio.lat, puntoInicio.lng]];
    
    ruta.forEach((prestamo, index) => {
        const lat = prestamo.ubicacion.lat;
        const lng = prestamo.ubicacion.lng;
        
        coordenadas.push([lat, lng]);
        
        L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div style='background-color:#667eea;color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:bold;'>${index + 1}</div>`,
                iconSize: [30, 30]
            })
        }).addTo(mapa).bindPopup(`
            <strong>${index + 1}. ${prestamo.Nombre}</strong><br>
            Préstamo: ${prestamo.numeroPrestamo}<br>
            Municipio: ${prestamo.municipio}<br>
            Tipo: ${prestamo.tipoVisita}<br>
            Distancia: ${prestamo.distancia.toFixed(2)} km<br>
            Tiempo: ${prestamo.tiempo} min
        `);
    });
    
    // Dibujar línea de ruta
    L.polyline(coordenadas, { 
        color: '#667eea', 
        weight: 3,
        opacity: 0.7
    }).addTo(mapa);
    
    // Ajustar vista para mostrar toda la ruta
    mapa.fitBounds(coordenadas);
}

// ===== MOSTRAR TABLA DE RUTA =====
function mostrarTablaRuta(ruta) {
    const tablaBody = document.getElementById('tablaRutaBody');
    if (!tablaBody) {
        console.warn('⚠️ No se encontró el elemento tablaRutaBody');
        return;
    }
    
    tablaBody.innerHTML = '';
    
    ruta.forEach((prestamo, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${prestamo.numeroPrestamo}</strong></td>
            <td>${prestamo.Nombre}</td>
            <td>${prestamo.municipio}</td>
            <td>${prestamo.direccion}</td>
            <td><span class="badge badge-${prestamo.tipoVisita}">${prestamo.tipoVisita}</span></td>
            <td>${prestamo.distancia.toFixed(2)} km</td>
            <td>${prestamo.tiempo} min</td>
        `;
        tablaBody.appendChild(row);
    });
    
    // Calcular y mostrar totales
    const distanciaTotal = ruta.reduce((sum, p) => sum + p.distancia, 0);
    const tiempoTotal = ruta.reduce((sum, p) => sum + p.tiempo, 0);
    
    const totalVisitas = document.getElementById('totalVisitas');
    const totalDistancia = document.getElementById('distanciaTotal');
    const totalTiempo = document.getElementById('tiempoTotal');
    
    if (totalVisitas) totalVisitas.textContent = ruta.length;
    if (totalDistancia) totalDistancia.textContent = distanciaTotal.toFixed(2) + ' km';
    if (totalTiempo) totalTiempo.textContent = `${Math.floor(tiempoTotal / 60)}h ${tiempoTotal % 60}m`;
}

// ===== GUARDAR RUTA EN FIREBASE =====
async function guardarRuta() {
    if (!rutaActual) {
        alert('❌ No hay ruta generada para guardar');
        return;
    }
    
    try {
        console.log('💾 Guardando ruta en Firebase...');
        
        const rutasRef = collection(db, 'rutas');
        await addDoc(rutasRef, {
            cobrador: rutaActual.cobrador,
            fecha: rutaActual.fecha,
            puntoInicio: rutaActual.puntoInicio,
            prestamos: rutaActual.prestamos.map(p => ({
                prestamoId: p.id,
                numeroPrestamo: p.numeroPrestamo,
                nombre: p.Nombre,
                municipio: p.municipio,
                tipoVisita: p.tipoVisita,
                distancia: p.distancia,
                tiempo: p.tiempo
            })),
            fechaCreacion: new Date().toISOString(),
            completada: false
        });
        
        console.log('✅ Ruta guardada exitosamente');
        alert('✅ Ruta guardada exitosamente en Firebase');
        
    } catch (error) {
        console.error('❌ Error guardando ruta:', error);
        alert('❌ Error al guardar la ruta: ' + error.message);
    }
}

// ===== INICIALIZAR AL CARGAR LA PÁGINA =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando aplicación...');
    
    // Cargar cobradores al inicio
    cargarCobradores();
    
    // Event listeners
    const btnGenerar = document.getElementById('btnGenerarRuta');
    if (btnGenerar) {
        btnGenerar.addEventListener('click', generarRutaOptimizada);
        console.log('✅ Botón Generar Ruta configurado');
    }
    
    const btnGuardar = document.getElementById('btnGuardarRuta');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarRuta);
        console.log('✅ Botón Guardar Ruta configurado');
    }
    
    const btnDescargar = document.getElementById('btnDescargarPDF');
    if (btnDescargar) {
        btnDescargar.addEventListener('click', function() {
            alert('Función de descarga PDF en desarrollo');
        });
        console.log('✅ Botón Descargar PDF configurado');
    }
});
```

## 📝 Resumen de cambios:

1. ✅ **index.html** - HTML completo con toda la estructura
2. ✅ **app.js** - Con las importaciones de Firebase correctas
3. ✅ Ambos usan `type="module"` 
4. ✅ El código carga TODOS los préstamos sin agrupar por cliente

Ahora deberías ver en consola:
```
🚀 Inicializando aplicación...
🔄 Cargando préstamos desde Firebase...
✅ Total préstamos cargados: XXX
✅ Total cobradores: XX
   Yony Rodas: 107 préstamos (D:XX L:XX)
