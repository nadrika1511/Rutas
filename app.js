// app.js
import { db, collection, addDoc, getDocs, updateDoc, doc, query, where, orderBy } from './firebase-config.js';

// Estado global de la aplicación
const appState = {
    prestamos: [],
    cobradores: [],
    rutasGuardadas: [],
    rutaActual: null,
    mapaRuta: null
};

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();
    cargarDatosFirebase();
    cargarRutasGuardadas();
    setFechaActual();
});

// Sistema de pestañas
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });
}

// Event Listeners
function initEventListeners() {
    document.getElementById('btnImportar').addEventListener('click', importarExcel);
    document.getElementById('btnGenerarRuta').addEventListener('click', generarRuta);
    document.getElementById('btnGuardarRuta').addEventListener('click', guardarRuta);
    document.getElementById('btnDescargarPDF').addEventListener('click', descargarPDF);
    document.getElementById('btnRegistrarGPS').addEventListener('click', registrarGPSManual);
    document.getElementById('rutaSelectVisita').addEventListener('change', cargarVisitasRuta);
}

// Establecer fecha actual
function setFechaActual() {
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaRuta').value = hoy;
}

// ============== IMPORTAR EXCEL ==============
async function importarExcel() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    
    if (!file) {
        mostrarMensaje('importStatus', 'Por favor selecciona un archivo', 'error');
        return;
    }

    mostrarMensaje('importStatus', 'Procesando archivo...', 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            // Procesar y guardar en Firebase
            await procesarDatos(jsonData);
            
            mostrarMensaje('importStatus', `✅ ${jsonData.length} préstamos importados correctamente`, 'success');
            await cargarDatosFirebase();
            
        } catch (error) {
            console.error('Error:', error);
            mostrarMensaje('importStatus', 'Error al procesar el archivo: ' + error.message, 'error');
        }
    };
    
    reader.readAsArrayBuffer(file);
}

async function procesarDatos(datos) {
    const prestamosRef = collection(db, 'prestamos');
    
    for (const row of datos) {
        const ubicacion = extraerCoordenadas(row['Ubicación'] || row['UBICACION'] || '');
        
        const prestamo = {
            numeroPrestamo: row['PRESTAMO'] || row['Prestamo'] || '',
            cobrador: row['Cobrador'] || row['COBRADOR'] || row['Si fuera'] || '',
            direccion: row['Dirección Domiciliar'] || '',
            municipio: row['Municipio'] || row['MUNICIPIO'] || '',
            departamento: row['Departamento'] || row['DEPARTAMENTO'] || '',
            enCarteraPasada: row['En Cartera pasada'] || '',
            ubicacion: ubicacion,
            visitado: false,
            fechaVisita: null,
            ubicacionReal: null,
            fechaImportacion: new Date().toISOString()
        };

        await addDoc(prestamosRef, prestamo);
    }
}

function extraerCoordenadas(ubicacionStr) {
    if (!ubicacionStr || ubicacionStr.toLowerCase().includes('sin visita')) {
        return { lat: null, lng: null, tipo: 'sin_visita' };
    }

    // Extraer de URL de Google Maps
    const match = ubicacionStr.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (match) {
        return {
            lat: parseFloat(match[1]),
            lng: parseFloat(match[2]),
            tipo: 'coordenadas'
        };
    }

    return { lat: null, lng: null, tipo: 'sin_coordenadas' };
}

// ============== CARGAR DATOS DE FIREBASE ==============
async function cargarDatosFirebase() {
    try {
        const prestamosSnapshot = await getDocs(collection(db, 'prestamos'));
        appState.prestamos = [];
        
        prestamosSnapshot.forEach((doc) => {
            appState.prestamos.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Obtener cobradores únicos (excluyendo "Sin cobrador")
        appState.cobradores = [...new Set(appState.prestamos.map(p => p.cobrador))]
            .filter(c => c && c.toLowerCase() !== 'sin cobrador');
        
        actualizarUICobradores();
        cargarSelectCobradores();
        
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

function actualizarUICobradores() {
    const container = document.getElementById('cobradoresList');
    container.innerHTML = '';

    appState.cobradores.forEach(cobrador => {
        const prestamos = appState.prestamos.filter(p => p.cobrador === cobrador);
        const conUbicacion = prestamos.filter(p => p.ubicacion.tipo === 'coordenadas').length;
        const sinUbicacion = prestamos.filter(p => p.ubicacion.tipo === 'sin_visita').length;
        const visitados = prestamos.filter(p => p.visitado).length;

        const card = document.createElement('div');
        card.className = 'cobrador-card';
        card.innerHTML = `
            <h3>${cobrador}</h3>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="number">${prestamos.length}</div>
                    <div class="label">Total Préstamos</div>
                </div>
                <div class="stat-item">
                    <div class="number">${conUbicacion}</div>
                    <div class="label">Con Ubicación</div>
                </div>
                <div class="stat-item">
                    <div class="number">${sinUbicacion}</div>
                    <div class="label">Sin Ubicación</div>
                </div>
                <div class="stat-item">
                    <div class="number">${visitados}</div>
                    <div class="label">Visitados</div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function cargarSelectCobradores() {
    const select = document.getElementById('cobradorSelect');
    select.innerHTML = '<option value="">Seleccione...</option>';
    
    appState.cobradores.forEach(cobrador => {
        const option = document.createElement('option');
        option.value = cobrador;
        option.textContent = cobrador;
        select.appendChild(option);
    });
}

// ============== GENERAR RUTA ==============
async function generarRuta() {
    const cobrador = document.getElementById('cobradorSelect').value;
    const puntoInicioStr = document.getElementById('puntoInicio').value;
    const minimoVisitas = parseInt(document.getElementById('minimoVisitas').value);

    if (!cobrador) {
        alert('Selecciona un cobrador');
        return;
    }

    if (!puntoInicioStr) {
        alert('Ingresa el punto de inicio');
        return;
    }

    const [lat, lng] = puntoInicioStr.split(',').map(s => parseFloat(s.trim()));
    if (isNaN(lat) || isNaN(lng)) {
        alert('Formato de GPS inválido. Usa: latitud,longitud');
        return;
    }

    const puntoInicio = { lat, lng };

    // Obtener préstamos del cobrador que NO han sido visitados
    let prestamosCobrador = appState.prestamos.filter(p => 
        p.cobrador === cobrador && !p.visitado
    );

    // Separar con y sin ubicación
    const conUbicacion = prestamosCobrador.filter(p => p.ubicacion.tipo === 'coordenadas');
    const sinUbicacion = prestamosCobrador.filter(p => p.ubicacion.tipo === 'sin_visita');

    if (conUbicacion.length === 0) {
        alert('No hay préstamos con ubicación GPS para este cobrador');
        return;
    }

    // Algoritmo de optimización de ruta (Nearest Neighbor)
    const rutaOptimizada = optimizarRuta(conUbicacion, puntoInicio, minimoVisitas);

    // Agregar préstamos sin ubicación por municipio
    rutaOptimizada.forEach(item => {
        const sinUbicacionMunicipio = sinUbicacion.filter(p => 
            p.municipio === item.prestamo.municipio
        );
        item.sinUbicacionMunicipio = sinUbicacionMunicipio;
    });

    appState.rutaActual = {
        cobrador,
        fecha: document.getElementById('fechaRuta').value,
        puntoInicio,
        ruta: rutaOptimizada,
        minimoVisitas
    };

    mostrarRutaGenerada();
}

function optimizarRuta(prestamos, puntoInicio, minimoVisitas) {
    const ruta = [];
    const disponibles = [...prestamos];
    let actual = puntoInicio;

    // Tomar hasta el mínimo de visitas usando algoritmo nearest neighbor
    while (disponibles.length > 0 && ruta.length < minimoVisitas) {
        let menorDistancia = Infinity;
        let indiceMasCercano = -1;

        disponibles.forEach((prestamo, index) => {
            const distancia = calcularDistancia(
                actual.lat, actual.lng,
                prestamo.ubicacion.lat, prestamo.ubicacion.lng
            );

            if (distancia < menorDistancia) {
                menorDistancia = distancia;
                indiceMasCercano = index;
            }
        });

        if (indiceMasCercano !== -1) {
            const prestamo = disponibles.splice(indiceMasCercano, 1)[0];
            ruta.push({
                prestamo,
                distanciaDesdeAnterior: menorDistancia,
                tiempoEstimado: calcularTiempoViaje(menorDistancia)
            });
            actual = { lat: prestamo.ubicacion.lat, lng: prestamo.ubicacion.lng };
        }
    }

    return ruta;
}

function calcularDistancia(lat1, lng1, lat2, lng2) {
    // Fórmula de Haversine
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distancia = R * c;
    
    return distancia;
}

function calcularTiempoViaje(distanciaKm) {
    // Asumiendo velocidad promedio de 30 km/h en ciudad
    const velocidadPromedio = 30;
    const horas = distanciaKm / velocidadPromedio;
    const minutos = Math.round(horas * 60);
    return minutos;
}

function mostrarRutaGenerada() {
    const container = document.getElementById('rutaGenerada');
    const statsDiv = document.getElementById('rutaStats');
    const detalleDiv = document.getElementById('rutaDetalle');
    
    container.style.display = 'block';

    const ruta = appState.rutaActual.ruta;
    const distanciaTotal = ruta.reduce((sum, item) => sum + item.distanciaDesdeAnterior, 0);
    const tiempoTotal = ruta.reduce((sum, item) => sum + item.tiempoEstimado, 0);
    const totalConSinUbicacion = ruta.reduce((sum, item) => 
        sum + 1 + (item.sinUbicacionMunicipio?.length || 0), 0
    );

    statsDiv.innerHTML = `
        <div class="stats-grid">
            <div class="stat-item">
                <div class="number">${ruta.length}</div>
                <div class="label">Visitas con GPS</div>
            </div>
            <div class="stat-item">
                <div class="number">${totalConSinUbicacion}</div>
                <div class="label">Total Visitas</div>
            </div>
            <div class="stat-item">
                <div class="number">${distanciaTotal.toFixed(1)} km</div>
                <div class="label">Distancia Total</div>
            </div>
            <div class="stat-item">
                <div class="number">${Math.round(tiempoTotal)} min</div>
                <div class="label">Tiempo Viaje</div>
            </div>
        </div>
    `;

    // Detalle de la ruta
    let detalleHTML = '<h3>Secuencia de Visitas</h3>';
    ruta.forEach((item, index) => {
        const sinUbicacion = item.sinUbicacionMunicipio || [];
        detalleHTML += `
            <div class="ruta-item">
                <h4>📍 Visita ${index + 1}: Préstamo ${item.prestamo.numeroPrestamo}</h4>
                <p><strong>Municipio:</strong> ${item.prestamo.municipio}</p>
                <p><strong>Distancia desde anterior:</strong> ${item.distanciaDesdeAnterior.toFixed(2)} km</p>
                <p><strong>Tiempo estimado:</strong> ${item.tiempoEstimado} minutos</p>
                ${sinUbicacion.length > 0 ? `
                    <p><strong>⚠️ Sin ubicación en mismo municipio:</strong></p>
                    <ul>
                        ${sinUbicacion.map(p => `<li>Préstamo ${p.numeroPrestamo}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>
        `;
    });
    detalleDiv.innerHTML = detalleHTML;

    // Mostrar mapa
    mostrarMapaRuta();
}

function mostrarMapaRuta() {
    const mapDiv = document.getElementById('mapaRuta');
    
    if (appState.mapaRuta) {
        appState.mapaRuta.remove();
    }

    const ruta = appState.rutaActual.ruta;
    const puntoInicio = appState.rutaActual.puntoInicio;

    // Centrar en el punto de inicio
    appState.mapaRuta = L.map('mapaRuta').setView([puntoInicio.lat, puntoInicio.lng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(appState.mapaRuta);

    // Marcador de inicio
    L.marker([puntoInicio.lat, puntoInicio.lng], {
        icon: L.divIcon({
            className: 'custom-icon',
            html: '<div style="background: green; color: white; padding: 10px; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold;">🏠</div>'
        })
    }).addTo(appState.mapaRuta).bindPopup('Punto de Inicio');

    // Marcadores de la ruta
    const coordenadas = [[puntoInicio.lat, puntoInicio.lng]];
    
    ruta.forEach((item, index) => {
        const lat = item.prestamo.ubicacion.lat;
        const lng = item.prestamo.ubicacion.lng;
        coordenadas.push([lat, lng]);

        L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-icon',
                html: `<div style="background: #667eea; color: white; padding: 5px; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold;">${index + 1}</div>`
            })
        }).addTo(appState.mapaRuta).bindPopup(`
            <strong>Visita ${index + 1}</strong><br>
            Préstamo: ${item.prestamo.numeroPrestamo}<br>
            Municipio: ${item.prestamo.municipio}
        `);
    });

    // Dibujar línea de ruta
    L.polyline(coordenadas, { color: '#667eea', weight: 3 }).addTo(appState.mapaRuta);

    // Ajustar vista para mostrar todos los puntos
    appState.mapaRuta.fitBounds(coordenadas);
}

// ============== GUARDAR RUTA ==============
async function guardarRuta() {
    if (!appState.rutaActual) {
        alert('No hay ruta generada');
        return;
    }

    try {
        const rutaData = {
            cobrador: appState.rutaActual.cobrador,
            fecha: appState.rutaActual.fecha,
            puntoInicio: appState.rutaActual.puntoInicio,
            prestamos: appState.rutaActual.ruta.map(item => ({
                prestamoId: item.prestamo.id,
                numeroPrestamo: item.prestamo.numeroPrestamo,
                municipio: item.prestamo.municipio,
                ubicacion: item.prestamo.ubicacion,
                distancia: item.distanciaDesdeAnterior,
                tiempo: item.tiempoEstimado,
                sinUbicacionMunicipio: item.sinUbicacionMunicipio?.map(p => p.id) || []
            })),
            fechaCreacion: new Date().toISOString(),
            completada: false
        };

        await addDoc(collection(db, 'rutas'), rutaData);
        alert('✅ Ruta guardada exitosamente');
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error al guardar la ruta');
    }
}

// ============== DESCARGAR PDF ==============
async function descargarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const ruta = appState.rutaActual;
    let y = 20;

    // Título
    doc.setFontSize(18);
    doc.text('Ruta de Cobranza', 105, y, { align: 'center' });
    y += 10;

    // Información general
    doc.setFontSize(12);
    doc.text(`Cobrador: ${ruta.cobrador}`, 20, y);
    y += 7;
    doc.text(`Fecha: ${ruta.fecha}`, 20, y);
    y += 7;
    doc.text(`Punto de Inicio: ${ruta.puntoInicio.lat}, ${ruta.puntoInicio.lng}`, 20, y);
    y += 10;

    // Estadísticas
    const distanciaTotal = ruta.ruta.reduce((sum, item) => sum + item.distanciaDesdeAnterior, 0);
    const tiempoTotal = ruta.ruta.reduce((sum, item) => sum + item.tiempoEstimado, 0);
    
    doc.text(`Visitas: ${ruta.ruta.length}`, 20, y);
    y += 7;
    doc.text(`Distancia Total: ${distanciaTotal.toFixed(2)} km`, 20, y);
    y += 7;
    doc.text(`Tiempo Estimado: ${Math.round(tiempoTotal)} minutos`, 20, y);
    y += 10;

    // Lista de visitas
    doc.setFontSize(14);
    doc.text('Secuencia de Visitas:', 20, y);
    y += 7;

    doc.setFontSize(10);
    ruta.ruta.forEach((item, index) => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }

        doc.text(`${index + 1}. Préstamo: ${item.prestamo.numeroPrestamo}`, 20, y);
        y += 5;
        doc.text(`   Municipio: ${item.prestamo.municipio}`, 20, y);
        y += 5;
        doc.text(`   Distancia: ${item.distanciaDesdeAnterior.toFixed(2)} km | Tiempo: ${item.tiempoEstimado} min`, 20, y);
        y += 7;

        if (item.sinUbicacionMunicipio && item.sinUbicacionMunicipio.length > 0) {
            doc.text(`   Sin ubicación en mismo municipio:`, 20, y);
            y += 5;
            item.sinUbicacionMunicipio.forEach(p => {
                doc.text(`     - Préstamo ${p.numeroPrestamo}`, 20, y);
                y += 5;
            });
            y += 2;
        }
    });

    // Capturar mapa
    doc.addPage();
    doc.text('Mapa de Ruta', 105, 20, { align: 'center' });
    
    const mapCanvas = await html2canvas(document.getElementById('mapaRuta'));
    const imgData = mapCanvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 10, 30, 190, 150);

    doc.save(`Ruta_${ruta.cobrador}_${ruta.fecha}.pdf`);
}

// ============== REGISTRAR GPS MANUAL ==============
async function registrarGPSManual() {
    const prestamoId = document.getElementById('prestamoManual').value;
    const gpsStr = document.getElementById('gpsManual').value;

    if (!prestamoId || !gpsStr) {
        alert('Completa todos los campos');
        return;
    }

    const [lat, lng] = gpsStr.split(',').map(s => parseFloat(s.trim()));
    if (isNaN(lat) || isNaN(lng)) {
        alert('Formato de GPS inválido');
        return;
    }

    const prestamo = appState.prestamos.find(p => p.id === prestamoId);
    if (!prestamo) return;

    // Calcular distancia con la ubicación original de la ruta
    let distanciaDesviacion = 0;
    if (prestamo.ubicacion.lat && prestamo.ubicacion.lng) {
        distanciaDesviacion = calcularDistancia(
            prestamo.ubicacion.lat, prestamo.ubicacion.lng,
            lat, lng
        );
    }

    // Actualizar en Firebase
    try {
        await updateDoc(doc(db, 'prestamos', prestamoId), {
            ubicacionReal: { lat, lng },
            visitado: true,
            fechaVisita: new Date().toISOString(),
            distanciaDesviacion: distanciaDesviacion
        });

        const mensaje = distanciaDesviacion > 0 
            ? `✅ Ubicación registrada. Desviación: ${distanciaDesviacion.toFixed(2)} km (${(distanciaDesviacion * 1000).toFixed(0)} metros)`
            : '✅ Ubicación registrada (primera visita)';

        mostrarMensaje('distanciaInfo', mensaje, 'success');
        await cargarDatosFirebase();
        cargarVisitasRuta(); // Recargar lista de visitas

    } catch (error) {
        console.error('Error:', error);
        alert('Error al registrar ubicación');
    }
}

// ============== GESTIÓN DE VISITAS ==============
async function cargarRutasGuardadas() {
    try {
        const rutasSnapshot = await getDocs(collection(db, 'rutas'));
        appState.rutasGuardadas = [];
        
        rutasSnapshot.forEach((doc) => {
            appState.rutasGuardadas.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Actualizar select de rutas
        const select = document.getElementById('rutaSelectVisita');
        select.innerHTML = '<option value="">Seleccione una ruta...</option>';
        
        appState.rutasGuardadas.forEach(ruta => {
            const option = document.createElement('option');
            option.value = ruta.id;
            option.textContent = `${ruta.cobrador} - ${ruta.fecha} (${ruta.prestamos.length} visitas)`;
            select.appendChild(option);
        });

        // Actualizar select de préstamos para GPS manual
        const selectPrestamo = document.getElementById('prestamoManual');
        selectPrestamo.innerHTML = '<option value="">Seleccione...</option>';
        
        appState.prestamos.filter(p => !p.visitado).forEach(prestamo => {
            const option = document.createElement('option');
            option.value = prestamo.id;
            option.textContent = `${prestamo.numeroPrestamo} - ${prestamo.cobrador} - ${prestamo.municipio}`;
            selectPrestamo.appendChild(option);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

async function cargarVisitasRuta() {
    const rutaId = document.getElementById('rutaSelectVisita').value;
    const container = document.getElementById('visitasList');
    
    if (!rutaId) {
        container.innerHTML = '';
        return;
    }

    const ruta = appState.rutasGuardadas.find(r => r.id === rutaId);
    if (!ruta) return;

    container.innerHTML = '<h3>Visitas en esta Ruta</h3>';

    for (const item of ruta.prestamos) {
        const prestamo = appState.prestamos.find(p => p.id === item.prestamoId);
        if (!prestamo) continue;

        const div = document.createElement('div');
        div.className = `ruta-item ${prestamo.visitado ? 'visitado' : ''}`;
        div.innerHTML = `
            <h4>📍 Préstamo ${prestamo.numeroPrestamo}</h4>
            <p><strong>Municipio:</strong> ${prestamo.municipio}</p>
            <p><strong>Estado:</strong> ${prestamo.visitado ? '✅ Visitado' : '⏳ Pendiente'}</p>
            ${prestamo.visitado && prestamo.fechaVisita ? `
                <p><strong>Fecha visita:</strong> ${new Date(prestamo.fechaVisita).toLocaleString('es-GT')}</p>
                ${prestamo.distanciaDesviacion > 0 ? `
                    <p><strong>Desviación:</strong> ${prestamo.distanciaDesviacion.toFixed(2)} km</p>
                ` : ''}
            ` : ''}
            ${!prestamo.visitado ? `
                <div class="visita-actions">
                    <button class="btn btn-success btn-marcar-visitado" data-id="${prestamo.id}">
                        ✅ Marcar como Visitado
                    </button>
                </div>
            ` : ''}
        `;
        container.appendChild(div);
    }

    // Agregar event listeners a botones de marcar visitado
    document.querySelectorAll('.btn-marcar-visitado').forEach(btn => {
        btn.addEventListener('click', () => marcarComoVisitado(btn.dataset.id));
    });
}

async function marcarComoVisitado(prestamoId) {
    try {
        await updateDoc(doc(db, 'prestamos', prestamoId), {
            visitado: true,
            fechaVisita: new Date().toISOString()
        });

        alert('✅ Préstamo marcado como visitado');
        await cargarDatosFirebase();
        cargarVisitasRuta();

    } catch (error) {
        console.error('Error:', error);
        alert('Error al marcar como visitado');
    }
}

// ============== UTILIDADES ==============
function mostrarMensaje(elementId, mensaje, tipo) {
    const element = document.getElementById(elementId);
    element.textContent = mensaje;
    element.className = tipo;
    element.style.display = 'block';
}

// Exportar funciones globales si es necesario
window.appState = appState;
