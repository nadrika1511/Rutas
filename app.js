// ARCHIVO: app.js - VERSIÓN CORREGIDA
// Este código asegura que se muestren TODOS los registros de préstamos,
// sin importar si un cliente se repite (visita domiciliar y laboral)

import { db } from './firebase-config.js';
import { collection, getDocs, query, where, doc, updateDoc, addDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Variables globales
let todosLosPrestamos = [];
let cobradores = new Map();
let rutas = [];

// ===== CARGAR COBRADORES =====
async function cargarCobradores() {
    try {
        const prestamosRef = collection(db, 'prestamos');
        const snapshot = await getDocs(prestamosRef);
        
        // CRÍTICO: No agrupamos por cliente, guardamos TODOS los documentos
        todosLosPrestamos = [];
        cobradores.clear();
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const prestamo = {
                id: doc.id,  // ID del documento
                ...data
            };
            
            // Agregar TODOS los préstamos sin filtrar
            todosLosPrestamos.push(prestamo);
            
            // Agrupar por cobrador
            const cobrador = data.cobrador || 'Sin cobrador';
            if (!cobradores.has(cobrador)) {
                cobradores.set(cobrador, []);
            }
            cobradores.get(cobrador).push(prestamo);
        });
        
        mostrarCobradores();
        console.log(`✅ Total préstamos cargados: ${todosLosPrestamos.length}`);
        console.log(`✅ Total cobradores: ${cobradores.size}`);
        
    } catch (error) {
        console.error('Error cargando cobradores:', error);
        alert('Error al cargar los datos: ' + error.message);
    }
}

// ===== MOSTRAR COBRADORES EN EL SELECTOR =====
function mostrarCobradores() {
    const cobradorSelect = document.getElementById('cobradorSelect');
    if (!cobradorSelect) return;
    
    cobradorSelect.innerHTML = '<option value="">-- Seleccionar Cobrador --</option>';
    
    // Ordenar cobradores alfabéticamente
    const cobradoresArray = Array.from(cobradores.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    cobradoresArray.forEach(([nombre, prestamos]) => {
        const option = document.createElement('option');
        option.value = nombre;
        
        // Contar préstamos por tipo
        const domiciliares = prestamos.filter(p => p.tipoVisita === 'domiciliar').length;
        const laborales = prestamos.filter(p => p.tipoVisita === 'laboral' || p.tipoVisita === 'laboral').length;
        
        option.textContent = `${nombre} (${prestamos.length} préstamos - D:${domiciliares} L:${laborales})`;
        cobradorSelect.appendChild(option);
    });
}

// ===== OBTENER PRÉSTAMOS POR COBRADOR =====
function obtenerPrestamosPorCobrador(nombreCobrador) {
    if (!nombreCobrador) {
        console.warn('No se proporcionó nombre de cobrador');
        return [];
    }
    
    // CRÍTICO: Retornar TODOS los préstamos del cobrador, sin agrupar por cliente
    const prestamos = cobradores.get(nombreCobrador) || [];
    
    console.log(`📊 Cobrador: ${nombreCobrador}`);
    console.log(`   Total registros: ${prestamos.length}`);
    console.log(`   Domiciliares: ${prestamos.filter(p => p.tipoVisita === 'domiciliar').length}`);
    console.log(`   Laborales: ${prestamos.filter(p => p.tipoVisita === 'laboral').length}`);
    
    return prestamos;
}

// ===== GENERAR RUTA OPTIMIZADA =====
function generarRutaOptimizada() {
    const cobradorSelect = document.getElementById('cobradorSelect');
    const puntoInicio = document.getElementById('puntoInicio').value.trim();
    const minimoVisitas = parseInt(document.getElementById('minimoVisitas').value) || 10;
    
    if (!cobradorSelect || !cobradorSelect.value) {
        alert('Por favor selecciona un cobrador');
        return;
    }
    
    if (!puntoInicio) {
        alert('Por favor ingresa el punto de inicio (lat,lng)');
        return;
    }
    
    const [lat, lng] = puntoInicio.split(',').map(coord => parseFloat(coord.trim()));
    
    if (isNaN(lat) || isNaN(lng)) {
        alert('Formato de coordenadas inválido. Usa: lat,lng (ejemplo: 14.6349,-90.5069)');
        return;
    }
    
    // Obtener TODOS los préstamos del cobrador
    const todosPrestamos = obtenerPrestamosPorCobrador(cobradorSelect.value);
    
    // Filtrar solo los que NO han sido visitados y tienen ubicación
    const prestamosDisponibles = todosPrestamos.filter(prestamo => {
        return !prestamo.visitado && 
               prestamo.ubicacion && 
               prestamo.ubicacion.lat && 
               prestamo.ubicacion.lng &&
               prestamo.ubicacion.tipo === 'coordenadas';
    });
    
    console.log(`🔍 Préstamos disponibles para ruta: ${prestamosDisponibles.length}`);
    
    if (prestamosDisponibles.length === 0) {
        alert('No hay préstamos disponibles con ubicación GPS para este cobrador');
        return;
    }
    
    if (prestamosDisponibles.length < minimoVisitas) {
        const continuar = confirm(
            `Solo hay ${prestamosDisponibles.length} préstamos disponibles, ` +
            `menos del mínimo solicitado (${minimoVisitas}). ¿Continuar con todos los disponibles?`
        );
        if (!continuar) return;
    }
    
    // Algoritmo Nearest Neighbor
    const rutaOptimizada = nearestNeighbor({ lat, lng }, prestamosDisponibles, minimoVisitas);
    
    // Mostrar en mapa y tabla
    mostrarMapaRuta(rutaOptimizada, { lat, lng });
    mostrarTablaRuta(rutaOptimizada);
    
    // Habilitar botones de guardar y descargar
    document.getElementById('btnGuardarRuta').disabled = false;
    document.getElementById('btnDescargarPDF').disabled = false;
    
    // Guardar en variable global
    window.rutaActual = {
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
    
    while (rutaOptimizada.length < minimoVisitas && prestamosRestantes.length > 0) {
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
    if (!mapaContainer) return;
    
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
    }).addTo(mapa).bindPopup('Punto de Inicio');
    
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
            <strong>${index + 1}. ${prestamo.Nombre || 'Sin nombre'}</strong><br>
            Préstamo: ${prestamo.numeroPrestamo}<br>
            Municipio: ${prestamo.municipio}<br>
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
    
    // Ajustar vista
    mapa.fitBounds(coordenadas);
}

// ===== MOSTRAR TABLA DE RUTA =====
function mostrarTablaRuta(ruta) {
    const tablaBody = document.getElementById('tablaRutaBody');
    if (!tablaBody) return;
    
    tablaBody.innerHTML = '';
    
    ruta.forEach((prestamo, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${prestamo.numeroPrestamo}</strong></td>
            <td>${prestamo.Nombre || 'Sin nombre'}</td>
            <td>${prestamo.municipio || 'N/A'}</td>
            <td>${prestamo.direccion || 'N/A'}</td>
            <td><span class="badge tipo-${prestamo.tipoVisita}">${prestamo.tipoVisita || 'domiciliar'}</span></td>
            <td>${prestamo.distancia.toFixed(2)} km</td>
            <td>${prestamo.tiempo} min</td>
        `;
        tablaBody.appendChild(row);
    });
    
    // Mostrar totales
    const distanciaTotal = ruta.reduce((sum, p) => sum + p.distancia, 0);
    const tiempoTotal = ruta.reduce((sum, p) => sum + p.tiempo, 0);
    
    document.getElementById('totalVisitas').textContent = ruta.length;
    document.getElementById('distanciaTotal').textContent = distanciaTotal.toFixed(2);
    document.getElementById('tiempoTotal').textContent = `${Math.floor(tiempoTotal / 60)}h ${tiempoTotal % 60}m`;
}

// ===== GUARDAR RUTA EN FIREBASE =====
async function guardarRuta() {
    if (!window.rutaActual) {
        alert('No hay ruta generada para guardar');
        return;
    }
    
    try {
        const rutasRef = collection(db, 'rutas');
        await addDoc(rutasRef, {
            ...window.rutaActual,
            fechaCreacion: new Date().toISOString(),
            completada: false
        });
        
        alert('✅ Ruta guardada exitosamente');
    } catch (error) {
        console.error('Error guardando ruta:', error);
        alert('Error al guardar la ruta: ' + error.message);
    }
}

// ===== INICIALIZAR =====
document.addEventListener('DOMContentLoaded', () => {
    cargarCobradores();
    
    // Event listeners
    const btnGenerar = document.getElementById('btnGenerarRuta');
    if (btnGenerar) {
        btnGenerar.addEventListener('click', generarRutaOptimizada);
    }
    
    const btnGuardar = document.getElementById('btnGuardarRuta');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarRuta);
    }
});

// Exportar funciones
export { 
    cargarCobradores, 
    obtenerPrestamosPorCobrador, 
    generarRutaOptimizada,
    guardarRuta
};
```

## 🔑 Cambios Críticos Realizados:

### 1. **En `cargarCobradores()`** (línea 14-44):
- **ANTES**: Probablemente agrupaba por cliente
- **AHORA**: Guarda **TODOS** los documentos sin agrupar
- Cada documento de Firebase es un registro independiente

### 2. **En `obtenerPrestamosPorCobrador()`** (línea 62-75):
- **ANTES**: Podría filtrar duplicados
- **AHORA**: Retorna **TODOS** los préstamos del cobrador
- Muestra estadísticas de domiciliares y laborales

### 3. **Logs detallados**:
- Ahora verás en consola exactamente cuántos registros se cargaron
- Cuántos son domiciliares y cuántos laborales

## 📝 Para verificar que funciona:

1. Abre la consola del navegador (F12)
2. Recarga la página
3. Deberías ver:
```
   ✅ Total préstamos cargados: 107  (para Yony Rodas, por ejemplo)
   ✅ Total cobradores: X
```

4. Selecciona "Yony Rodas" en el selector
5. Verás en consola:
```
   📊 Cobrador: Yony Rodas
      Total registros: 107
      Domiciliares: XX
      Laborales: XX
