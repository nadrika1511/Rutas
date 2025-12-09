// app.js - Sistema de Rutas v2.1 - Distancias Mejoradas
// Última actualización: 2025-12-03
import { db, collection, addDoc, getDocs, updateDoc, doc, query, where, orderBy } from './firebase-config.js';

// Estado global de la aplicación
const appState = {
    prestamos: [],
    cobradores: [],
    rutasGuardadas: [],
    rutaActual: null,
    mapaRuta: null,
    huboEditosRuta: false
};

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Iniciando aplicación...');
    initTabs();
    initEventListeners();
    console.log('📡 Conectando a Firebase...');
    cargarDatosFirebase();
    cargarRutasGuardadas();
    setFechaActual();
    console.log('✅ Aplicación lista');
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
    
    // Buscador de clientes
    document.getElementById('inputBuscarCliente').addEventListener('input', buscarCliente);
    
    // Usar delegación de eventos para botones que pueden no existir inicialmente
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btnGenerarPDFRuta') {
            generarPDFRutaDia();
        }
    });
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

    // Mostrar barra de progreso
    document.getElementById('progressContainer').style.display = 'block';
    actualizarProgreso(0, 'Leyendo archivo...');

    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            actualizarProgreso(20, 'Procesando Excel...');
            
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            actualizarProgreso(40, `${jsonData.length} registros encontrados`);
            
            if (jsonData.length === 0) {
                throw new Error('El archivo está vacío');
            }

            // Verificar columnas necesarias
            const primeraFila = jsonData[0];
            const columnasNecesarias = ['PRESTAMO', 'Cobrador', 'Municipio', 'Departamento', 'Ubicación'];
            const columnasFaltantes = columnasNecesarias.filter(col => !(col in primeraFila));
            
            if (columnasFaltantes.length > 0) {
                throw new Error(`Faltan columnas: ${columnasFaltantes.join(', ')}`);
            }

            actualizarProgreso(60, 'Guardando en Firebase...');

            // Procesar y guardar en Firebase
            await procesarDatos(jsonData);
            
            actualizarProgreso(90, 'Actualizando interfaz...');
            await cargarDatosFirebase();
            await cargarRutasGuardadas();
            
            actualizarProgreso(100, '¡Completado!');
            
            setTimeout(() => {
                document.getElementById('progressContainer').style.display = 'none';
                mostrarMensaje('importStatus', `✅ ${jsonData.length} préstamos importados correctamente`, 'success');
            }, 1000);
            
        } catch (error) {
            console.error('Error completo:', error);
            document.getElementById('progressContainer').style.display = 'none';
            mostrarMensaje('importStatus', '❌ Error al procesar el archivo: ' + error.message, 'error');
        }
    };
    
    reader.onerror = () => {
        document.getElementById('progressContainer').style.display = 'none';
        mostrarMensaje('importStatus', '❌ Error al leer el archivo', 'error');
    };
    
    reader.readAsArrayBuffer(file);
}

function actualizarProgreso(porcentaje, texto) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    progressBar.style.width = porcentaje + '%';
    progressBar.textContent = porcentaje + '%';
    progressText.textContent = texto;
}

async function procesarDatos(datos) {
    const prestamosRef = collection(db, 'prestamos');
    const totalRegistros = datos.length;
    
    for (let i = 0; i < datos.length; i++) {
        const row = datos[i];
        
        // Actualizar progreso cada 10 registros
        if (i % 10 === 0) {
            const progreso = 60 + Math.floor((i / totalRegistros) * 25);
            actualizarProgreso(progreso, `Guardando ${i + 1} de ${totalRegistros}...`);
        }
        
        const ubicacion = extraerCoordenadas(row['Ubicación'] || row['UBICACION'] || '');
        
        // Detectar tipo de visita
        const tipoVisitaRaw = row['Tipo Visita'] || row['TIPO VISITA'] || row['Tipo'] || '';
        let tipoVisita = 'domiciliar'; // Por defecto
        
        if (tipoVisitaRaw.toLowerCase().includes('laboral') || tipoVisitaRaw.toLowerCase().includes('trabajo')) {
            tipoVisita = 'laboral';
        }
        
        // Detectar dirección con múltiples variantes posibles
        const direccion = row['Dirección Domiciliar'] || 
                         row['Direccion Domiciliar'] || 
                         row['DIRECCIÓN DOMICILIAR'] || 
                         row['DIRECCION DOMICILIAR'] ||
                         row['Direccion'] || 
                         row['DIRECCION'] ||
                         row['Dirección'] ||
                         row['DIRECCIÓN'] ||
                         row['Direccion Laboral'] ||
                         row['DIRECCION LABORAL'] ||
                         row['Dirección Laboral'] ||
                         row['DIRECCIÓN LABORAL'] ||
                         '';
        
        // Log para depuración (solo en las primeras filas)
        if (i < 3) {
            console.log(`Fila ${i + 1}:`, {
                prestamo: row['PRESTAMO'],
                tipo: tipoVisita,
                direccion: direccion || '⚠️ VACÍO',
                columnasDisponibles: Object.keys(row)
            });
        }
        
        const prestamo = {
            numeroPrestamo: row['PRESTAMO'] || row['Prestamo'] || '',
            nombreCliente: row['Nombre'] || row['NOMBRE'] || row['Nombre Cliente'] || row['Cliente'] || row['CLIENTE'] || '',
            nombreEmpresa: row['Nombre de Empresa'] || row['NOMBRE DE EMPRESA'] || row['Empresa'] || row['EMPRESA'] || '',
            dpi: row['DPI'] || row['Dpi'] || row['dpi'] || '',
            cobrador: row['Cobrador'] || row['COBRADOR'] || row['Si fuera'] || '',
            direccion: direccion,
            municipio: row['Municipio'] || row['MUNICIPIO'] || '',
            departamento: row['Departamento'] || row['DEPARTAMENTO'] || '',
            enCarteraPasada: row['En Cartera pasada'] || '',
            tipoVisita: tipoVisita, // NUEVO: domiciliar o laboral
            ubicacion: ubicacion,
            visitado: false,
            fechaVisita: null,
            ubicacionReal: null,
            historialVisitas: [], // NUEVO: Array de visitas históricas
            fechaImportacion: new Date().toISOString()
        };

        try {
            await addDoc(prestamosRef, prestamo);
        } catch (error) {
            console.error(`Error guardando préstamo ${prestamo.numeroPrestamo}:`, error);
            // Continuar con el siguiente
        }
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
        console.log('📥 Cargando préstamos desde Firebase...');
        const prestamosSnapshot = await getDocs(collection(db, 'prestamos'));
        appState.prestamos = [];
        
        prestamosSnapshot.forEach((doc) => {
            appState.prestamos.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`✅ ${appState.prestamos.length} préstamos cargados`);

        // Obtener cobradores únicos (excluyendo "Sin cobrador")
        appState.cobradores = [...new Set(appState.prestamos.map(p => p.cobrador))]
            .filter(c => c && c.toLowerCase() !== 'sin cobrador');
        
        console.log(`👥 ${appState.cobradores.length} cobradores activos:`, appState.cobradores);
        
        actualizarUICobradores();
        cargarSelectCobradores();
        actualizarReportes();
        
    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        console.error('Detalles del error:', error.message);
    }
}

function actualizarUICobradores() {
    const container = document.getElementById('cobradoresList');
    container.innerHTML = '';

    // Obtener préstamos en rutas guardadas
    const prestamosEnRutas = new Set();
    appState.rutasGuardadas.forEach(ruta => {
        ruta.prestamos.forEach(item => {
            prestamosEnRutas.add(item.prestamoId);
        });
    });

    appState.cobradores.forEach(cobrador => {
        const prestamos = appState.prestamos.filter(p => p.cobrador === cobrador);
        const conUbicacion = prestamos.filter(p => p.ubicacion.tipo === 'coordenadas').length;
        const sinUbicacion = prestamos.filter(p => p.ubicacion.tipo === 'sin_visita').length;
        const visitados = prestamos.filter(p => p.visitado).length;
        const enRutas = prestamos.filter(p => prestamosEnRutas.has(p.id)).length;
        const disponibles = prestamos.length - visitados - enRutas;

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
                    <div class="number" style="color: #28a745;">${disponibles}</div>
                    <div class="label">Disponibles</div>
                </div>
                <div class="stat-item">
                    <div class="number" style="color: #667eea;">${enRutas}</div>
                    <div class="label">En Rutas</div>
                </div>
                <div class="stat-item">
                    <div class="number">${visitados}</div>
                    <div class="label">Visitados</div>
                </div>
                <div class="stat-item">
                    <div class="number">${conUbicacion}</div>
                    <div class="label">Con GPS</div>
                </div>
                <div class="stat-item">
                    <div class="number">${sinUbicacion}</div>
                    <div class="label">Sin GPS</div>
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

    // Obtener IDs de préstamos que ya están en rutas guardadas
    const prestamosEnRutas = new Set();
    appState.rutasGuardadas.forEach(ruta => {
        ruta.prestamos.forEach(item => {
            prestamosEnRutas.add(item.prestamoId);
        });
    });

    // Obtener préstamos del cobrador que NO han sido visitados Y NO están en rutas guardadas
    let prestamosCobrador = appState.prestamos.filter(p => 
        p.cobrador === cobrador && 
        !p.visitado && 
        !prestamosEnRutas.has(p.id) // Excluir los que ya están en rutas guardadas
    );

    // Separar con y sin ubicación
    const conUbicacion = prestamosCobrador.filter(p => p.ubicacion.tipo === 'coordenadas');
    const sinUbicacion = prestamosCobrador.filter(p => p.ubicacion.tipo === 'sin_visita');

    if (conUbicacion.length === 0 && sinUbicacion.length === 0) {
        alert('No hay préstamos disponibles para este cobrador. Todos los préstamos ya están en rutas guardadas o han sido visitados.');
        return;
    }

    if (conUbicacion.length === 0) {
        alert('No hay préstamos con ubicación GPS disponibles para este cobrador');
        return;
    }

    // Algoritmo de optimización de ruta (Nearest Neighbor)
    const rutaOptimizada = optimizarRuta(conUbicacion, puntoInicio, minimoVisitas);

    // Intercalar préstamos sin ubicación por municipio
    const rutaFinal = [];
    let totalVisitas = 0;
    const sinUbicacionAgregados = new Set(); // Rastrear préstamos sin ubicación ya agregados
    
    for (const item of rutaOptimizada) {
        // Verificar si aún podemos agregar visitas
        if (totalVisitas >= minimoVisitas) break;
        
        // Agregar la visita con ubicación
        rutaFinal.push({
            ...item,
            tieneUbicacion: true
        });
        totalVisitas++;
        
        // Agregar visitas sin ubicación del mismo municipio (solo las que NO se han agregado)
        const sinUbicacionMunicipio = sinUbicacion.filter(p => 
            p.municipio === item.prestamo.municipio && 
            !sinUbicacionAgregados.has(p.id) // No agregar si ya fue agregado
        );
        
        for (const prestamo of sinUbicacionMunicipio) {
            if (totalVisitas >= minimoVisitas) break;
            
            rutaFinal.push({
                prestamo: prestamo,
                distanciaDesdeAnterior: 0,
                tiempoEstimado: 0,
                tieneUbicacion: false,
                municipioReferencia: item.prestamo.municipio
            });
            totalVisitas++;
            sinUbicacionAgregados.add(prestamo.id); // Marcar como agregado
        }
    }

    appState.rutaActual = {
        cobrador,
        fecha: document.getElementById('fechaRuta').value,
        puntoInicio,
        ruta: rutaFinal,
        minimoVisitas,
        totalConUbicacion: rutaFinal.filter(item => item.tieneUbicacion).length,
        totalSinUbicacion: rutaFinal.filter(item => !item.tieneUbicacion).length
    };

    mostrarRutaGenerada();
}

function optimizarRuta(prestamos, puntoInicio, minimoVisitas) {
    const ruta = [];
    const disponibles = [...prestamos];
    let actual = puntoInicio;
    let municipioActual = null;
    let departamentoActual = null;

    // Tomar hasta el mínimo de visitas usando algoritmo nearest neighbor
    while (disponibles.length > 0 && ruta.length < minimoVisitas) {
        let menorDistancia = Infinity;
        let indiceMasCercano = -1;

        disponibles.forEach((prestamo, index) => {
            const distancia = calcularDistanciaReal(
                actual.lat, actual.lng,
                prestamo.ubicacion.lat, prestamo.ubicacion.lng,
                prestamo.municipio,
                prestamo.departamento
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
                tiempoEstimado: calcularTiempoViaje(menorDistancia, prestamo.municipio)
            });
            actual = { lat: prestamo.ubicacion.lat, lng: prestamo.ubicacion.lng };
            municipioActual = prestamo.municipio;
            departamentoActual = prestamo.departamento;
        }
    }

    return ruta;
}

function calcularDistancia(lat1, lng1, lat2, lng2) {
    // Fórmula de Haversine (distancia lineal)
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distanciaLineal = R * c;
    
    return distanciaLineal;
}

function calcularDistanciaReal(lat1, lng1, lat2, lng2, municipio, departamento) {
    // Primero calculamos la distancia lineal
    const distanciaLineal = calcularDistancia(lat1, lng1, lat2, lng2);
    
    // Factores de corrección por municipio (basados en estructura urbana y vialidad)
    const factoresMunicipio = {
        // Zona Metropolitana - Alto tráfico, muchas vueltas
        'GUATEMALA': 1.40,
        'MIXCO': 1.38,
        'VILLA NUEVA': 1.35,
        'VILLA CANALES': 1.32,
        'SAN MIGUEL PETAPA': 1.35,
        'AMATITLAN': 1.30,
        'SAN JUAN SACATEPEQUEZ': 1.28,
        'SANTA CATARINA PINULA': 1.30,
        'SAN JOSE PINULA': 1.28,
        'FRAIJANES': 1.25,
        'PALENCIA': 1.25,
        'CHINAUTLA': 1.32,
        'SAN PEDRO AYAMPUC': 1.28,
        'SAN PEDRO SACATEPEQUEZ': 1.30,
        'SAN RAYMUNDO': 1.22,
        
        // Escuintla - Urbano medio
        'ESCUINTLA': 1.30,
        'PUERTO DE SAN JOSE': 1.25,
        'IZTAPA': 1.22,
        'PALIN': 1.28,
        'SAN VICENTE PACAYA': 1.23,
        'SIPACATE': 1.20,
        'LA GOMERA': 1.22,
        'MASAGUA': 1.23,
        'SANTA LUCIA COTZUMALGUAPA': 1.28,
        'LA DEMOCRACIA': 1.22,
        'SIQUINALA': 1.20,
        
        // Suchitepéquez - Zonas agrícolas
        'MAZATENANGO': 1.28,
        'COATEPEQUE': 1.25,
        'RETALHULEU': 1.26,
        'PATULUL': 1.22,
        'SAN ANTONIO SUCHITEPEQUEZ': 1.20,
        'SANTO DOMINGO SUCHITEPEQUEZ': 1.20,
        'SAN PABLO JOCOPILAS': 1.18,
        'CUYOTENANGO': 1.22,
        'CHICACAO': 1.20,
        'SAN JOSE EL IDOLO': 1.19,
        'PUEBLO NUEVO': 1.20,
        'RIO BRAVO': 1.18,
        'SAMAYAC': 1.20,
        'SAN BERNARDINO': 1.18,
        'SAN GABRIEL': 1.18,
        'SAN LORENZO': 1.20,
        'SAN MIGUEL PANAM': 1.18,
        
        // San Marcos - Montañoso
        'SAN MARCOS': 1.32,
        'MALACATAN': 1.25,
        'PAJAPITA': 1.22,
        'EL TUMBADOR': 1.23,
        'AYUTLA': 1.20,
        'OCOS': 1.20,
        'TECUN UMAN': 1.24,
        'COATEPEQUE': 1.25,
        'CATARINA': 1.18,
        'ESQUIPULAS PALO GORDO': 1.20,
        'LA REFORMA': 1.20,
        'NUEVO PROGRESO': 1.19,
        'SIBINAL': 1.18,
        'TACANA': 1.20,
        'TAJUMULCO': 1.20,
        
        // Alta Verapaz - Rural/montañoso
        'COBAN': 1.30,
        'SAN PEDRO CARCHA': 1.25,
        'SAN JUAN CHAMELCO': 1.22,
        'TACTIC': 1.20,
        'SANTA MARIA CAHABON': 1.20,
        'LANQUIN': 1.18,
        'SENAHU': 1.18,
        'CHISEC': 1.18,
        'CHAHAL': 1.18,
        'FRAY BARTOLOME DE LAS CASAS': 1.18,
        'RAXRUHA': 1.18,
        'SANTA CRUZ VERAPAZ': 1.20,
        'SANTA CATARINA LA TINTA': 1.18,
        'PANZOS': 1.20,
        
        // Quetzaltenango - Urbano/montañoso
        'QUETZALTENANGO': 1.32,
        'SALCAJA': 1.25,
        'SAN MATEO': 1.22,
        'OLINTEPEQUE': 1.24,
        'SAN CARLOS SIJA': 1.20,
        'SIBILIA': 1.18,
        'CABRICAN': 1.20,
        'CAJOLA': 1.18,
        'SAN MIGUEL SIGUILA': 1.20,
        'OSTUNCALCO': 1.22,
        'SAN JUAN OSTUNCALCO': 1.20,
        'SAN MARTIN SACATEPEQUEZ': 1.20,
        'ALMOLONGA': 1.22,
        'CANTEL': 1.24,
        'ZUNIL': 1.20,
        'COLOMBA': 1.20,
        'COATEPEQUE': 1.25,
        'FLORES COSTA CUCA': 1.18,
        'GENOVA': 1.18,
        'PALESTINA DE LOS ALTOS': 1.18,
        
        // Retalhuleu - Costa
        'RETALHULEU': 1.26,
        'SAN SEBASTIAN': 1.20,
        'SANTA CRUZ MULUA': 1.18,
        'SAN MARTIN ZAPOTITLAN': 1.20,
        'SAN FELIPE': 1.20,
        'SAN ANDRES VILLA SECA': 1.22,
        'CHAMPERICO': 1.22,
        'NUEVO SAN CARLOS': 1.18,
        'EL ASINTAL': 1.20,
        
        // Petén - Rural extenso
        'FLORES': 1.35,
        'SANTA ELENA': 1.32,
        'SAN BENITO': 1.30,
        'SAN ANDRES': 1.20,
        'LA LIBERTAD': 1.22,
        'SAN FRANCISCO': 1.18,
        'SAYAXCHE': 1.20,
        'MELCHOR DE MENCOS': 1.20,
        'POPTUN': 1.20,
        'DOLORES': 1.18,
        
        // Izabal - Costa/puerto
        'PUERTO BARRIOS': 1.28,
        'LIVINGSTON': 1.25,
        'EL ESTOR': 1.22,
        'MORALES': 1.24,
        'LOS AMATES': 1.20,
        
        // Sacatepéquez - Turístico
        'ANTIGUA GUATEMALA': 1.32,
        'JOCOTENANGO': 1.28,
        'CIUDAD VIEJA': 1.28,
        'SAN MIGUEL DUENAS': 1.25,
        'ALOTENANGO': 1.22,
        'SAN ANTONIO AGUAS CALIENTES': 1.24,
        'SANTA MARIA DE JESUS': 1.23,
        
        // Santa Rosa - Mixto
        'CUILAPA': 1.26,
        'BARBERENA': 1.24,
        'SANTA ROSA DE LIMA': 1.22,
        'CASILLAS': 1.20,
        'SAN RAFAEL LAS FLORES': 1.20,
        'ORATORIO': 1.20,
        'SAN JUAN TECUACO': 1.18,
        'CHIQUIMULILLA': 1.22,
        'TAXISCO': 1.20,
        'SANTA MARIA IXHUATAN': 1.18,
        'GUAZACAPAN': 1.20,
        'SANTA CRUZ NARANJO': 1.18,
        'PUEBLO NUEVO VINAS': 1.18,
        'NUEVA SANTA ROSA': 1.20,
        
        // Totonicapán - Montañoso
        'TOTONICAPAN': 1.28,
        'SAN CRISTOBAL TOTONICAPAN': 1.24,
        'SAN FRANCISCO EL ALTO': 1.24,
        'SAN ANDRES XECUL': 1.22,
        'MOMOSTENANGO': 1.22,
        'SANTA MARIA CHIQUIMULA': 1.20,
        'SANTA LUCIA LA REFORMA': 1.20,
        'SAN BARTOLO': 1.18
    };
    
    // Factores por departamento (backup si no encuentra municipio)
    const factoresDepartamento = {
        'GUATEMALA': 1.35,
        'ESCUINTLA': 1.26,
        'SUCHITEPEQUEZ': 1.22,
        'SAN MARCOS': 1.24,
        'ALTA VERAPAZ': 1.22,
        'QUETZALTENANGO': 1.26,
        'RETALHULEU': 1.22,
        'PETEN': 1.25,
        'IZABAL': 1.24,
        'SACATEPEQUEZ': 1.28,
        'SANTA ROSA': 1.22,
        'TOTONICAPAN': 1.24,
        'CHIMALTENANGO': 1.26,
        'SOLOLA': 1.24,
        'QUICHE': 1.22,
        'BAJA VERAPAZ': 1.22,
        'ZACAPA': 1.20,
        'CHIQUIMULA': 1.20,
        'JALAPA': 1.20,
        'JUTIAPA': 1.20,
        'EL PROGRESO': 1.20,
        'HUEHUETENANGO': 1.24
    };
    
    // Obtener factor de corrección
    let factor = factoresMunicipio[municipio?.toUpperCase()] || 
                 factoresDepartamento[departamento?.toUpperCase()] || 
                 1.25; // Factor por defecto
    
    // Ajuste adicional por distancia (rutas largas son más directas)
    if (distanciaLineal > 50) {
        factor *= 0.95; // Reducir 5% en rutas largas
    } else if (distanciaLineal < 5) {
        factor *= 1.05; // Aumentar 5% en rutas muy cortas (más vueltas)
    }
    
    const distanciaReal = distanciaLineal * factor;
    
    return distanciaReal;
}

function calcularTiempoViaje(distanciaKm, municipio) {
    // Velocidades promedio por tipo de zona (km/h)
    const velocidades = {
        // Zona metropolitana - Tráfico pesado
        'GUATEMALA': 25,
        'MIXCO': 25,
        'VILLA NUEVA': 28,
        'VILLA CANALES': 30,
        
        // Ciudades intermedias
        'ESCUINTLA': 35,
        'COATEPEQUE': 35,
        'MAZATENANGO': 35,
        'RETALHULEU': 35,
        'QUETZALTENANGO': 30,
        'COBAN': 30,
        
        // Zonas costeras/rurales
        'default': 40
    };
    
    const velocidadPromedio = velocidades[municipio?.toUpperCase()] || velocidades['default'];
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
    const conUbicacion = ruta.filter(item => item.tieneUbicacion);
    const sinUbicacion = ruta.filter(item => !item.tieneUbicacion);
    
    const distanciaTotal = conUbicacion.reduce((sum, item) => sum + item.distanciaDesdeAnterior, 0);
    const tiempoTotal = conUbicacion.reduce((sum, item) => sum + item.tiempoEstimado, 0);

    statsDiv.innerHTML = `
        <div class="stats-grid">
            <div class="stat-item">
                <div class="number">${conUbicacion.length}</div>
                <div class="label">Visitas con GPS</div>
            </div>
            <div class="stat-item">
                <div class="number">${sinUbicacion.length}</div>
                <div class="label">Visitas sin GPS</div>
            </div>
            <div class="stat-item">
                <div class="number">${ruta.length}</div>
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
        <div style="margin-top: 15px; padding: 15px; background: #d1ecf1; border-radius: 8px; color: #0c5460;">
            <strong>ℹ️ Nota:</strong> Esta ruta solo incluye préstamos que NO están en otras rutas guardadas y que NO han sido visitados.
        </div>
    `;

    // Detalle de la ruta con opción de editar
    let detalleHTML = '<h3>Secuencia de Visitas</h3>';
    ruta.forEach((item, index) => {
        const iconoTipo = item.prestamo.tipoVisita === 'laboral' ? '💼' : '🏠';
        const labelTipo = item.prestamo.tipoVisita === 'laboral' ? 'Laboral' : 'Domiciliar';
        
        if (item.tieneUbicacion) {
            // Visita con ubicación GPS
            detalleHTML += `
                <div class="ruta-item">
                    <h4>📍 Visita ${index + 1}: Préstamo ${item.prestamo.numeroPrestamo} ${iconoTipo}</h4>
                    <p><span style="background: ${item.prestamo.tipoVisita === 'laboral' ? '#e3f2fd' : '#fff3e0'}; padding: 3px 8px; border-radius: 5px; font-size: 12px;">${iconoTipo} ${labelTipo}</span></p>
                    ${item.prestamo.nombreCliente ? `<p><strong>Cliente:</strong> ${item.prestamo.nombreCliente}</p>` : ''}
                    ${item.prestamo.nombreEmpresa ? `<p><strong>Empresa:</strong> ${item.prestamo.nombreEmpresa}</p>` : ''}
                    <p><strong>Dirección:</strong> ${item.prestamo.direccion || 'No disponible'}</p>
                    <p><strong>Municipio:</strong> ${item.prestamo.municipio}</p>
                    <p><strong>Coordenadas:</strong> 
                        <input type="text" 
                               class="gps-edit-input" 
                               id="gps-${item.prestamo.id}" 
                               value="${item.prestamo.ubicacion.lat},${item.prestamo.ubicacion.lng}"
                               style="width: 200px; padding: 5px; border: 2px solid #e9ecef; border-radius: 5px; font-size: 14px;">
                        <button class="btn-mini btn-cambiar-sin-gps" data-id="${item.prestamo.id}">
                            ❌ Marcar sin GPS
                        </button>
                    </p>
                    <p><strong>Distancia desde anterior:</strong> ${item.distanciaDesdeAnterior.toFixed(2)} km</p>
                    <p><strong>Tiempo estimado:</strong> ${item.tiempoEstimado} minutos</p>
                </div>
            `;
        } else {
            // Visita sin ubicación GPS
            detalleHTML += `
                <div class="ruta-item" style="border-left-color: #ffc107; background: #fff9e6;">
                    <h4>⚠️ Visita ${index + 1}: Préstamo ${item.prestamo.numeroPrestamo} ${iconoTipo}</h4>
                    <p><span style="background: ${item.prestamo.tipoVisita === 'laboral' ? '#e3f2fd' : '#fff3e0'}; padding: 3px 8px; border-radius: 5px; font-size: 12px;">${iconoTipo} ${labelTipo}</span></p>
                    ${item.prestamo.nombreCliente ? `<p><strong>Cliente:</strong> ${item.prestamo.nombreCliente}</p>` : ''}
                    ${item.prestamo.nombreEmpresa ? `<p><strong>Empresa:</strong> ${item.prestamo.nombreEmpresa}</p>` : ''}
                    <p><strong>Dirección:</strong> ${item.prestamo.direccion || 'No disponible'}</p>
                    <p><strong>Municipio:</strong> ${item.prestamo.municipio}</p>
                    <p><strong>Estado:</strong> Sin ubicación GPS previa</p>
                    <p>
                        <input type="text" 
                               class="gps-edit-input" 
                               id="gps-${item.prestamo.id}" 
                               placeholder="14.6349,-90.5069"
                               style="width: 200px; padding: 5px; border: 2px solid #ffc107; border-radius: 5px; font-size: 14px;">
                        <small style="color: #856404;">Puedes agregar coordenadas GPS aquí</small>
                    </p>
                    <p style="color: #856404;"><em>Visitar en el municipio de ${item.municipioReferencia}</em></p>
                </div>
            `;
        }
    });
    
    detalleHTML += `
        <div style="margin-top: 20px; padding: 20px; background: #e3f2fd; border-radius: 10px; text-align: center;">
            <p style="margin-bottom: 15px; color: #1976d2; font-weight: 600;">
                ⚡ ¿Editaste alguna ubicación? Regenera la ruta para aplicar los cambios
            </p>
            <button id="btnRegenerarRuta" class="btn btn-primary" style="font-size: 18px;">
                🔄 Regenerar Ruta con Cambios
            </button>
        </div>
    `;
    
    detalleDiv.innerHTML = detalleHTML;

    // Event listeners para cambiar a sin GPS
    document.querySelectorAll('.btn-cambiar-sin-gps').forEach(btn => {
        btn.addEventListener('click', () => cambiarASinGPS(btn.dataset.id));
    });

    // Event listener para regenerar ruta
    document.getElementById('btnRegenerarRuta').addEventListener('click', regenerarRutaConCambios);

    // Mostrar mapa
    mostrarMapaRuta();
}

async function cambiarASinGPS(prestamoId) {
    if (!confirm('¿Seguro que quieres marcar este préstamo como "Sin GPS"?')) {
        return;
    }

    try {
        await updateDoc(doc(db, 'prestamos', prestamoId), {
            ubicacion: {
                lat: null,
                lng: null,
                tipo: 'sin_visita'
            }
        });

        alert('✅ Préstamo marcado como "Sin GPS".');
        
        // Marcar que hubo cambios
        appState.huboEditosRuta = true;

    } catch (error) {
        console.error('Error:', error);
        alert('Error al actualizar el préstamo');
    }
}

async function regenerarRutaConCambios() {
    if (!appState.rutaActual) {
        alert('No hay ruta activa para regenerar');
        return;
    }

    const cambios = [];
    
    // Recopilar cambios de todos los inputs
    document.querySelectorAll('.gps-edit-input').forEach(input => {
        const prestamoId = input.id.replace('gps-', '');
        const valorNuevo = input.value.trim();
        const prestamo = appState.prestamos.find(p => p.id === prestamoId);
        
        if (!prestamo) return;
        
        // Verificar si el valor cambió
        const valorOriginal = prestamo.ubicacion.lat && prestamo.ubicacion.lng 
            ? `${prestamo.ubicacion.lat},${prestamo.ubicacion.lng}` 
            : '';
        
        if (valorNuevo && valorNuevo !== valorOriginal) {
            const [lat, lng] = valorNuevo.split(',').map(s => parseFloat(s.trim()));
            
            if (!isNaN(lat) && !isNaN(lng)) {
                cambios.push({
                    prestamoId,
                    ubicacion: { lat, lng, tipo: 'coordenadas' }
                });
            }
        }
    });

    // Verificar si hubo cambios de "Sin GPS"
    if (cambios.length === 0 && !appState.huboEditosRuta) {
        alert('No se detectaron cambios en las ubicaciones');
        return;
    }

    const totalCambios = cambios.length + (appState.huboEditosRuta ? 1 : 0);
    
    if (!confirm(`¿Confirmas aplicar los cambios y regenerar la ruta?`)) {
        return;
    }

    try {
        // Aplicar cambios en Firebase
        for (const cambio of cambios) {
            await updateDoc(doc(db, 'prestamos', cambio.prestamoId), {
                ubicacion: cambio.ubicacion
            });
        }

        if (cambios.length > 0) {
            alert(`✅ ${cambios.length} ubicación(es) actualizada(s). Regenerando ruta...`);
        }
        
        // Guardar configuración actual de la ruta
        const configuracionRuta = {
            cobrador: appState.rutaActual.cobrador,
            puntoInicio: appState.rutaActual.puntoInicio,
            minimoVisitas: appState.rutaActual.minimoVisitas,
            fecha: appState.rutaActual.fecha
        };
        
        // Recargar datos
        await cargarDatosFirebase();
        
        // Restaurar configuración y regenerar
        setTimeout(() => {
            // Restaurar valores en el formulario
            document.getElementById('cobradorSelect').value = configuracionRuta.cobrador;
            document.getElementById('puntoInicio').value = `${configuracionRuta.puntoInicio.lat},${configuracionRuta.puntoInicio.lng}`;
            document.getElementById('minimoVisitas').value = configuracionRuta.minimoVisitas;
            document.getElementById('fechaRuta').value = configuracionRuta.fecha;
            
            // Regenerar ruta
            generarRuta();
            
            // Limpiar flag
            appState.huboEditosRuta = false;
        }, 500);

    } catch (error) {
        console.error('Error:', error);
        alert('Error al actualizar las ubicaciones');
    }
}

function mostrarMapaRuta() {
    const mapDiv = document.getElementById('mapaRuta');
    
    if (appState.mapaRuta) {
        appState.mapaRuta.remove();
    }

    const ruta = appState.rutaActual.ruta;
    const puntoInicio = appState.rutaActual.puntoInicio;

    // Filtrar solo visitas con ubicación GPS
    const visitasConGPS = ruta.filter(item => item.tieneUbicacion);

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

    // Marcadores de la ruta (solo con GPS)
    const coordenadas = [[puntoInicio.lat, puntoInicio.lng]];
    
    visitasConGPS.forEach((item, index) => {
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
                tieneUbicacion: item.tieneUbicacion,
                distancia: item.distanciaDesdeAnterior,
                tiempo: item.tiempoEstimado
            })),
            totalVisitas: appState.rutaActual.ruta.length,
            visitasConGPS: appState.rutaActual.totalConUbicacion,
            visitasSinGPS: appState.rutaActual.totalSinUbicacion,
            fechaCreacion: new Date().toISOString(),
            completada: false
        };

        await addDoc(collection(db, 'rutas'), rutaData);
        alert('✅ Ruta guardada exitosamente');
        await cargarRutasGuardadas();
        
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
    const conUbicacion = ruta.ruta.filter(item => item.tieneUbicacion);
    const sinUbicacion = ruta.ruta.filter(item => !item.tieneUbicacion);
    const distanciaTotal = conUbicacion.reduce((sum, item) => sum + item.distanciaDesdeAnterior, 0);
    const tiempoTotal = conUbicacion.reduce((sum, item) => sum + item.tiempoEstimado, 0);
    
    doc.text(`Total Visitas: ${ruta.ruta.length}`, 20, y);
    y += 7;
    doc.text(`  - Con GPS: ${conUbicacion.length}`, 20, y);
    y += 7;
    doc.text(`  - Sin GPS: ${sinUbicacion.length}`, 20, y);
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
        if (y > 265) {
            doc.addPage();
            y = 20;
        }

        if (item.tieneUbicacion) {
            doc.text(`${index + 1}. [GPS] Prestamo: ${item.prestamo.numeroPrestamo}`, 20, y);
            y += 5;
            if (item.prestamo.nombreCliente) {
                doc.text(`   Cliente: ${item.prestamo.nombreCliente}`, 20, y);
                y += 5;
            }
            if (item.prestamo.direccion) {
                const direccion = item.prestamo.direccion.substring(0, 60);
                doc.text(`   Direccion: ${direccion}`, 20, y);
                y += 5;
            }
            doc.text(`   Municipio: ${item.prestamo.municipio}`, 20, y);
            y += 5;
            doc.text(`   Distancia: ${item.distanciaDesdeAnterior.toFixed(2)} km | Tiempo: ${item.tiempoEstimado} min`, 20, y);
            y += 7;
        } else {
            doc.text(`${index + 1}. [SIN GPS] Prestamo: ${item.prestamo.numeroPrestamo}`, 20, y);
            y += 5;
            if (item.prestamo.nombreCliente) {
                doc.text(`   Cliente: ${item.prestamo.nombreCliente}`, 20, y);
                y += 5;
            }
            if (item.prestamo.direccion) {
                const direccion = item.prestamo.direccion.substring(0, 60);
                doc.text(`   Direccion: ${direccion}`, 20, y);
                y += 5;
            }
            doc.text(`   Municipio: ${item.prestamo.municipio}`, 20, y);
            y += 5;
            doc.text(`   (Visitar en ${item.municipioReferencia})`, 20, y);
            y += 7;
        }
    });

    // Capturar mapa
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Mapa de Ruta (Solo visitas con GPS)', 105, 20, { align: 'center' });
    
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
        distanciaDesviacion = calcularDistanciaReal(
            prestamo.ubicacion.lat, prestamo.ubicacion.lng,
            lat, lng,
            prestamo.municipio,
            prestamo.departamento
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

        // Actualizar select de rutas en visitas
        const select = document.getElementById('rutaSelectVisita');
        select.innerHTML = '<option value="">Seleccione una ruta...</option>';
        
        appState.rutasGuardadas.forEach(ruta => {
            const option = document.createElement('option');
            option.value = ruta.id;
            option.textContent = `${ruta.cobrador} - ${ruta.fecha} (${ruta.prestamos.length} visitas)`;
            select.appendChild(option);
        });

        // Actualizar select de rutas para PDF
        const selectPDF = document.getElementById('rutaSelectPDF');
        if (selectPDF) {
            selectPDF.innerHTML = '<option value="">Seleccione una ruta...</option>';
            
            // Agrupar rutas por fecha
            const rutasPorFecha = {};
            appState.rutasGuardadas.forEach(ruta => {
                if (!rutasPorFecha[ruta.fecha]) {
                    rutasPorFecha[ruta.fecha] = [];
                }
                rutasPorFecha[ruta.fecha].push(ruta);
            });

            // Ordenar fechas descendente
            const fechasOrdenadas = Object.keys(rutasPorFecha).sort().reverse();
            
            fechasOrdenadas.forEach(fecha => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = `📅 ${fecha}`;
                
                rutasPorFecha[fecha].forEach(ruta => {
                    const option = document.createElement('option');
                    option.value = ruta.id;
                    option.textContent = `${ruta.cobrador} (${ruta.prestamos.length} visitas)`;
                    optgroup.appendChild(option);
                });
                
                selectPDF.appendChild(optgroup);
            });
        }

        // Actualizar select de préstamos para GPS manual
        const selectPrestamo = document.getElementById('prestamoManual');
        selectPrestamo.innerHTML = '<option value="">Seleccione...</option>';
        
        appState.prestamos.filter(p => !p.visitado).forEach(prestamo => {
            const option = document.createElement('option');
            option.value = prestamo.id;
            const nombre = prestamo.nombreCliente ? ` - ${prestamo.nombreCliente}` : '';
            option.textContent = `${prestamo.numeroPrestamo}${nombre} - ${prestamo.cobrador} - ${prestamo.municipio}`;
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
    if (!ruta) {
        container.innerHTML = '<p style="color: red;">❌ Ruta no encontrada</p>';
        console.error('Ruta no encontrada:', rutaId);
        return;
    }

    console.log('📋 Cargando ruta:', ruta);
    console.log('📦 Total préstamos en ruta:', ruta.prestamos?.length || 0);
    console.log('📦 Total préstamos en memoria:', appState.prestamos.length);

    container.innerHTML = '<h3>Visitas en esta Ruta</h3>';

    if (!ruta.prestamos || ruta.prestamos.length === 0) {
        container.innerHTML += '<p style="color: #856404; padding: 15px; background: #fff3cd; border-radius: 8px;">⚠️ Esta ruta no tiene préstamos asignados.</p>';
        return;
    }

    let visitasMostradas = 0;
    let visitasNoEncontradas = 0;

    for (const item of ruta.prestamos) {
        console.log('🔍 Buscando préstamo ID:', item.prestamoId);
        const prestamo = appState.prestamos.find(p => p.id === item.prestamoId);
        
        if (!prestamo) {
            console.warn('⚠️ Préstamo no encontrado:', item.prestamoId, 'Número:', item.numeroPrestamo);
            visitasNoEncontradas++;
            
            // Mostrar la visita aunque no esté en memoria (usar datos de la ruta guardada)
            const div = document.createElement('div');
            div.className = 'ruta-item';
            div.innerHTML = `
                <h4>📍 Préstamo ${item.numeroPrestamo || 'N/A'}</h4>
                <p><strong>Municipio:</strong> ${item.municipio || 'N/A'}</p>
                <p style="color: #856404;">⚠️ Este préstamo no está en la base de datos actual</p>
                ${item.tieneUbicacion ? `
                    <p><strong>Ubicación planificada:</strong> ${item.ubicacion.lat}, ${item.ubicacion.lng}</p>
                ` : `
                    <p><strong>Ubicación:</strong> Sin GPS previo</p>
                `}
            `;
            container.appendChild(div);
            continue;
        }

        visitasMostradas++;
        console.log('✅ Préstamo encontrado:', prestamo.numeroPrestamo);

        const div = document.createElement('div');
        div.className = `ruta-item ${prestamo.visitado ? 'visitado' : ''}`;
        
        const iconoTipo = prestamo.tipoVisita === 'laboral' ? '💼' : '🏠';
        const labelTipo = prestamo.tipoVisita === 'laboral' ? 'Laboral' : 'Domiciliar';
        const colorBadge = prestamo.tipoVisita === 'laboral' ? '#e3f2fd' : '#fff3e0';
        
        div.innerHTML = `
            <h4>📍 Préstamo ${prestamo.numeroPrestamo} ${iconoTipo}</h4>
            <p><span style="background: ${colorBadge}; padding: 3px 8px; border-radius: 5px; font-size: 12px;">${iconoTipo} ${labelTipo}</span></p>
            ${prestamo.nombreCliente ? `<p><strong>Cliente:</strong> ${prestamo.nombreCliente}</p>` : ''}
            ${prestamo.nombreEmpresa ? `<p><strong>Empresa:</strong> ${prestamo.nombreEmpresa}</p>` : ''}
            ${prestamo.dpi ? `<p><strong>DPI:</strong> ${prestamo.dpi}</p>` : ''}
            ${prestamo.direccion ? `<p><strong>Dirección:</strong> ${prestamo.direccion}</p>` : ''}
            <p><strong>Municipio:</strong> ${prestamo.municipio}</p>
            <p><strong>Estado:</strong> ${prestamo.visitado ? '✅ Visitado' : '⏳ Pendiente'}</p>
            ${item.tieneUbicacion ? `
                <p><strong>Ubicación planificada:</strong> ${item.ubicacion.lat}, ${item.ubicacion.lng}</p>
            ` : `
                <p><strong>Ubicación:</strong> Sin GPS previo</p>
            `}
            ${prestamo.visitado && prestamo.fechaVisita ? `
                <p><strong>Fecha visita:</strong> ${new Date(prestamo.fechaVisita).toLocaleString('es-GT')}</p>
                ${prestamo.ubicacionReal ? `
                    <p><strong>Ubicación real:</strong> ${prestamo.ubicacionReal.lat}, ${prestamo.ubicacionReal.lng}</p>
                ` : ''}
                ${prestamo.distanciaDesviacion > 0 ? `
                    <p><strong>Desviación:</strong> ${prestamo.distanciaDesviacion.toFixed(2)} km (${(prestamo.distanciaDesviacion * 1000).toFixed(0)} metros)</p>
                ` : ''}
            ` : ''}
            ${!prestamo.visitado ? `
                <div class="visita-actions">
                    <button class="btn btn-success btn-marcar-visitado" 
                            data-id="${prestamo.id}" 
                            data-ubicacion-original="${item.ubicacion.lat || ''},${item.ubicacion.lng || ''}"
                            data-numero="${prestamo.numeroPrestamo}">
                        ✅ Marcar como Visitado
                    </button>
                </div>
            ` : ''}
            <div class="visita-actions" style="margin-top: 10px;">
                <button class="btn btn-info btn-ver-historial" 
                        data-numero="${prestamo.numeroPrestamo}"
                        data-tipo="${prestamo.tipoVisita}"
                        style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-size: 14px;">
                    📋 Ver Historial Completo
                </button>
            </div>
        `;
        container.appendChild(div);
    }

    console.log(`📊 Resultado: ${visitasMostradas} visitas mostradas, ${visitasNoEncontradas} no encontradas`);

    if (visitasNoEncontradas > 0) {
        const warning = document.createElement('div');
        warning.style.cssText = 'margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 8px; color: #856404;';
        warning.innerHTML = `⚠️ ${visitasNoEncontradas} préstamo(s) de esta ruta no están en la base de datos actual. Puede que hayan sido eliminados.`;
        container.appendChild(warning);
    }

    // Agregar event listeners a botones de marcar visitado
    document.querySelectorAll('.btn-marcar-visitado').forEach(btn => {
        btn.addEventListener('click', () => {
            mostrarModalVisita(
                btn.dataset.id, 
                btn.dataset.ubicacionOriginal,
                btn.dataset.numero
            );
        });
    });

    // Agregar event listeners a botones de ver historial
    document.querySelectorAll('.btn-ver-historial').forEach(btn => {
        btn.addEventListener('click', () => {
            mostrarHistorialCliente(
                btn.dataset.numero,
                btn.dataset.tipo
            );
        });
    });
}

// ============== MOSTRAR HISTORIAL DE CLIENTE ==============
function mostrarHistorialCliente(numeroPrestamo, tipoVisita) {
    // Buscar la ubicación específica
    const ubicacion = appState.prestamos.find(p => 
        p.numeroPrestamo === numeroPrestamo && 
        p.tipoVisita === tipoVisita
    );

    if (!ubicacion) {
        alert('No se encontró información de este cliente');
        return;
    }

    const historial = ubicacion.historialVisitas || [];
    const iconoTipo = tipoVisita === 'laboral' ? '💼' : '🏠';
    const labelTipo = tipoVisita === 'laboral' ? 'LABORAL' : 'DOMICILIAR';
    const colorBadge = tipoVisita === 'laboral' ? '#2196f3' : '#ff9800';

    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        overflow-y: auto;
    `;

    let historialHTML = '';
    
    if (historial.length === 0) {
        historialHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">📭 No hay visitas registradas aún</p>';
    } else {
        historial.forEach((visita, index) => {
            const fecha = new Date(visita.fecha).toLocaleString('es-GT', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const estadoCliente = visita.localizado ? '✅ Localizado' : '❌ No localizado';
            const lugarVisita = visita.tipoVisita === 'laboral' ? '💼 Trabajo' : '🏠 Casa';
            const colorEstado = visita.localizado ? '#28a745' : '#dc3545';

            historialHTML += `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${colorEstado};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="color: #495057;">Visita #${index + 1}</strong>
                        <span style="font-size: 12px; color: #6c757d;">${fecha}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px;">
                        <div>
                            <span style="color: #6c757d;">Estado:</span>
                            <strong style="color: ${colorEstado};">${estadoCliente}</strong>
                        </div>
                        <div>
                            <span style="color: #6c757d;">Lugar:</span>
                            <strong>${lugarVisita}</strong>
                        </div>
                        <div>
                            <span style="color: #6c757d;">Cobrador:</span>
                            <strong>${visita.cobrador}</strong>
                        </div>
                        <div>
                            <span style="color: #6c757d;">Desviación:</span>
                            <strong>${visita.distanciaDesviacion.toFixed(2)} km</strong>
                        </div>
                    </div>
                    ${visita.ubicacionReal ? `
                        <div style="margin-top: 8px; font-size: 12px; color: #6c757d;">
                            GPS: ${visita.ubicacionReal.lat}, ${visita.ubicacionReal.lng}
                        </div>
                    ` : ''}
                </div>
            `;
        });
    }

    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="color: #667eea; margin: 0;">📋 Historial de Cliente</h3>
                <button id="btnCerrarHistorial" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">&times;</button>
            </div>
            
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 15px; border-radius: 8px; margin-bottom: 20px; color: white;">
                <p style="margin: 5px 0;"><strong>Préstamo:</strong> ${numeroPrestamo}</p>
                ${ubicacion.nombreCliente ? `<p style="margin: 5px 0;"><strong>Cliente:</strong> ${ubicacion.nombreCliente}</p>` : ''}
                ${ubicacion.dpi ? `<p style="margin: 5px 0;"><strong>DPI:</strong> ${ubicacion.dpi}</p>` : ''}
                ${ubicacion.nombreEmpresa ? `<p style="margin: 5px 0;"><strong>Empresa:</strong> ${ubicacion.nombreEmpresa}</p>` : ''}
                <p style="margin: 5px 0;"><strong>Dirección:</strong> ${ubicacion.direccion}</p>
                <div style="margin-top: 10px; padding: 8px; background: ${colorBadge}; border-radius: 5px; display: inline-block;">
                    ${iconoTipo} ${labelTipo}
                </div>
            </div>

            <h4 style="color: #495057; margin-bottom: 15px;">Registro de Visitas (${historial.length})</h4>
            
            ${historialHTML}

            <div style="text-align: center; margin-top: 20px;">
                <button id="btnCerrarHistorial2" style="padding: 12px 30px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    Cerrar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnCerrarHistorial').onclick = () => {
        document.body.removeChild(modal);
    };

    document.getElementById('btnCerrarHistorial2').onclick = () => {
        document.body.removeChild(modal);
    };

    // Cerrar al hacer click fuera del modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// ============== BUSCAR CLIENTE ==============
function buscarCliente() {
    const termino = document.getElementById('inputBuscarCliente').value.trim().toLowerCase();
    const container = document.getElementById('resultadosBusqueda');

    if (termino.length < 3) {
        container.innerHTML = '<p style="color: #6c757d; padding: 15px;">✍️ Escribe al menos 3 caracteres para buscar...</p>';
        return;
    }

    // Buscar en todos los préstamos
    const resultados = appState.prestamos.filter(p => {
        const numeroPrestamo = String(p.numeroPrestamo || '').toLowerCase();
        const nombreCliente = String(p.nombreCliente || '').toLowerCase();
        const dpi = String(p.dpi || '').toLowerCase();
        
        return numeroPrestamo.includes(termino) || 
               nombreCliente.includes(termino) || 
               dpi.includes(termino);
    });

    if (resultados.length === 0) {
        container.innerHTML = '<p style="color: #856404; padding: 15px; background: #fff3cd; border-radius: 8px;">⚠️ No se encontraron clientes con ese criterio de búsqueda.</p>';
        return;
    }

    // Agrupar por número de préstamo Y filtrar duplicados por tipo
    const clientesAgrupados = {};
    resultados.forEach(p => {
        if (!clientesAgrupados[p.numeroPrestamo]) {
            clientesAgrupados[p.numeroPrestamo] = {
                domiciliar: null,
                laboral: null
            };
        }
        
        // Solo guardar la primera ocurrencia de cada tipo
        // Priorizar las que tienen más información (dirección completa)
        if (p.tipoVisita === 'domiciliar') {
            if (!clientesAgrupados[p.numeroPrestamo].domiciliar || 
                (p.direccion && p.direccion.length > (clientesAgrupados[p.numeroPrestamo].domiciliar.direccion || '').length)) {
                clientesAgrupados[p.numeroPrestamo].domiciliar = p;
            }
        } else if (p.tipoVisita === 'laboral') {
            if (!clientesAgrupados[p.numeroPrestamo].laboral || 
                (p.direccion && p.direccion.length > (clientesAgrupados[p.numeroPrestamo].laboral.direccion || '').length)) {
                clientesAgrupados[p.numeroPrestamo].laboral = p;
            }
        }
    });

    // Mostrar resultados
    container.innerHTML = '<h3>Resultados de Búsqueda</h3>';

    Object.keys(clientesAgrupados).forEach(numeroPrestamo => {
        const tipos = clientesAgrupados[numeroPrestamo];
        const ubicaciones = [];
        
        // Agregar solo las ubicaciones que existen
        if (tipos.domiciliar) ubicaciones.push(tipos.domiciliar);
        if (tipos.laboral) ubicaciones.push(tipos.laboral);
        
        if (ubicaciones.length === 0) return;
        
        // Contenedor para las tarjetas del cliente
        const clienteDiv = document.createElement('div');
        clienteDiv.style.cssText = 'margin-bottom: 30px; padding: 15px; background: #f8f9fa; border-radius: 10px;';
        
        // Título del cliente
        const titulo = document.createElement('h4');
        titulo.style.cssText = 'color: #495057; margin-bottom: 15px;';
        titulo.textContent = `Cliente: ${ubicaciones[0].nombreCliente || 'Sin nombre'} - Préstamo ${numeroPrestamo}`;
        clienteDiv.appendChild(titulo);

        // Grid de tarjetas
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;';

        ubicaciones.forEach(ubicacion => {
            const iconoTipo = ubicacion.tipoVisita === 'laboral' ? '💼' : '🏠';
            const labelTipo = ubicacion.tipoVisita === 'laboral' ? 'LABORAL' : 'DOMICILIAR';
            const colorBorde = ubicacion.tipoVisita === 'laboral' ? '#2196f3' : '#ff9800';
            const colorBg = ubicacion.tipoVisita === 'laboral' ? '#e3f2fd' : '#fff3e0';

            const tarjeta = document.createElement('div');
            tarjeta.style.cssText = `
                background: white;
                border-left: 5px solid ${colorBorde};
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;

            const numVisitas = (ubicacion.historialVisitas || []).length;
            const ultimaVisita = ubicacion.visitado ? 
                new Date(ubicacion.fechaVisita).toLocaleDateString('es-GT') : 
                'Sin visitar';
            
            // Validar que la dirección no esté vacía
            const direccionMostrar = ubicacion.direccion && ubicacion.direccion.trim() !== '' ? 
                ubicacion.direccion : 
                '<span style="color: #dc3545;">⚠️ Sin dirección registrada</span>';

            tarjeta.innerHTML = `
                <div style="background: ${colorBg}; padding: 8px; border-radius: 5px; margin-bottom: 10px; display: inline-block;">
                    <strong>${iconoTipo} ${labelTipo}</strong>
                </div>
                ${ubicacion.nombreEmpresa ? `<p><strong>Empresa:</strong> ${ubicacion.nombreEmpresa}</p>` : ''}
                ${ubicacion.dpi ? `<p><strong>DPI:</strong> ${ubicacion.dpi}</p>` : ''}
                <p><strong>Dirección:</strong> ${direccionMostrar}</p>
                <p><strong>Municipio:</strong> ${ubicacion.municipio}, ${ubicacion.departamento}</p>
                <p><strong>Cobrador:</strong> ${ubicacion.cobrador}</p>
                <p><strong>Estado:</strong> ${ubicacion.visitado ? '✅ Visitado' : '⏳ Pendiente'}</p>
                <p><strong>Última visita:</strong> ${ultimaVisita}</p>
                <p><strong>Total visitas:</strong> ${numVisitas}</p>
                <button class="btn btn-info btn-ver-historial-busqueda" 
                        data-numero="${ubicacion.numeroPrestamo}" 
                        data-tipo="${ubicacion.tipoVisita}"
                        style="width: 100%; margin-top: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                    📋 Ver Historial
                </button>
            `;

            grid.appendChild(tarjeta);
        });

        clienteDiv.appendChild(grid);
        container.appendChild(clienteDiv);
    });

    // Agregar event listeners a botones de historial
    document.querySelectorAll('.btn-ver-historial-busqueda').forEach(btn => {
        btn.addEventListener('click', () => {
            mostrarHistorialCliente(btn.dataset.numero, btn.dataset.tipo);
        });
    });
}

function mostrarModalVisita(prestamoId, ubicacionOriginal, numeroPrestamo) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%;">
            <h3 style="color: #667eea; margin-bottom: 20px;">📍 Registrar Visita</h3>
            <p style="margin-bottom: 15px;"><strong>Préstamo:</strong> ${numeroPrestamo}</p>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                    ¿Cliente localizado?
                </label>
                <div style="display: flex; gap: 15px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="localizado" value="si" checked style="margin-right: 5px;">
                        ✅ Sí
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="localizado" value="no" style="margin-right: 5px;">
                        ❌ No
                    </label>
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                    ¿Dónde se visitó?
                </label>
                <div style="display: flex; gap: 15px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="tipoVisita" value="domiciliar" checked style="margin-right: 5px;">
                        🏠 Casa
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="tipoVisita" value="laboral" style="margin-right: 5px;">
                        💼 Trabajo
                    </label>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                    Ubicación GPS de la Visita:
                </label>
                <input type="text" id="modalGPS" 
                       placeholder="14.6349,-90.5069" 
                       style="width: 100%; padding: 12px; border: 2px solid #e9ecef; border-radius: 8px; font-size: 16px;">
                <small style="color: #6c757d; margin-top: 5px; display: block;">
                    Formato: latitud,longitud
                </small>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="btnCancelarModal" 
                        style="padding: 10px 20px; border: 2px solid #dc3545; background: white; color: #dc3545; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    Cancelar
                </button>
                <button id="btnConfirmarVisita" 
                        style="padding: 10px 20px; border: none; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    ✅ Confirmar Visita
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('btnCancelarModal').onclick = () => {
        document.body.removeChild(modal);
    };
    
    document.getElementById('btnConfirmarVisita').onclick = async () => {
        const gpsInput = document.getElementById('modalGPS').value;
        if (!gpsInput) {
            alert('Por favor ingresa la ubicación GPS');
            return;
        }
        
        // Capturar resultado de visita
        const localizado = document.querySelector('input[name="localizado"]:checked').value === 'si';
        const tipoVisitaRealizada = document.querySelector('input[name="tipoVisita"]:checked').value;
        
        document.body.removeChild(modal);
        await marcarComoVisitado(prestamoId, gpsInput, ubicacionOriginal, localizado, tipoVisitaRealizada);
    };
}

async function marcarComoVisitado(prestamoId, gpsStr, ubicacionOriginal, localizado, tipoVisitaRealizada) {
    try {
        const [lat, lng] = gpsStr.split(',').map(s => parseFloat(s.trim()));
        
        if (isNaN(lat) || isNaN(lng)) {
            alert('Formato de GPS inválido. Usa: latitud,longitud');
            return;
        }

        const prestamo = appState.prestamos.find(p => p.id === prestamoId);
        if (!prestamo) return;

        // Calcular desviación si había ubicación original
        let distanciaDesviacion = 0;
        if (ubicacionOriginal && ubicacionOriginal !== ',') {
            const [latOrig, lngOrig] = ubicacionOriginal.split(',').map(s => parseFloat(s.trim()));
            if (!isNaN(latOrig) && !isNaN(lngOrig)) {
                distanciaDesviacion = calcularDistanciaReal(
                    latOrig, lngOrig, lat, lng,
                    prestamo.municipio,
                    prestamo.departamento
                );
            }
        }

        const fechaVisita = new Date().toISOString();
        
        // Crear registro de visita para el historial
        const registroVisita = {
            fecha: fechaVisita,
            localizado: localizado,
            tipoVisita: tipoVisitaRealizada, // domiciliar o laboral
            ubicacionReal: { lat, lng },
            distanciaDesviacion: distanciaDesviacion,
            cobrador: prestamo.cobrador
        };

        // Obtener historial actual o crear array vacío
        const historialActual = prestamo.historialVisitas || [];
        historialActual.push(registroVisita);

        await updateDoc(doc(db, 'prestamos', prestamoId), {
            visitado: true,
            fechaVisita: fechaVisita,
            ubicacionReal: { lat, lng },
            distanciaDesviacion: distanciaDesviacion,
            historialVisitas: historialActual, // Guardar todo el historial
            ultimaVisitaLocalizado: localizado,
            ultimaVisitaTipo: tipoVisitaRealizada
        });

        const estadoCliente = localizado ? 'Localizado' : 'No localizado';
        const lugarVisita = tipoVisitaRealizada === 'domiciliar' ? '🏠 Casa' : '💼 Trabajo';
        
        const mensaje = distanciaDesviacion > 0 
            ? `✅ Visita registrada\n${estadoCliente} - ${lugarVisita}\nDesviación: ${distanciaDesviacion.toFixed(2)} km (${(distanciaDesviacion * 1000).toFixed(0)} metros)`
            : `✅ Visita registrada\n${estadoCliente} - ${lugarVisita}`;

        alert(mensaje);
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

// ============== REPORTES Y ESTADÍSTICAS ==============
function actualizarReportes() {
    const container = document.getElementById('estadisticas');
    
    // Estadísticas generales
    const totalPrestamos = appState.prestamos.filter(p => 
        p.cobrador && p.cobrador.toLowerCase() !== 'sin cobrador'
    ).length;
    const conUbicacion = appState.prestamos.filter(p => 
        p.ubicacion.tipo === 'coordenadas' && 
        p.cobrador && p.cobrador.toLowerCase() !== 'sin cobrador'
    ).length;
    const sinUbicacion = appState.prestamos.filter(p => 
        p.ubicacion.tipo === 'sin_visita' && 
        p.cobrador && p.cobrador.toLowerCase() !== 'sin cobrador'
    ).length;
    const visitados = appState.prestamos.filter(p => p.visitado).length;
    const pendientes = totalPrestamos - visitados;
    
    // Calcular porcentajes
    const porcentajeVisitados = totalPrestamos > 0 ? (visitados / totalPrestamos * 100).toFixed(1) : 0;
    const porcentajeConGPS = totalPrestamos > 0 ? (conUbicacion / totalPrestamos * 100).toFixed(1) : 0;
    
    // Estadísticas por cobrador
    const estatsPorCobrador = appState.cobradores.map(cobrador => {
        const prestamosCobrador = appState.prestamos.filter(p => p.cobrador === cobrador);
        const visitadosCobrador = prestamosCobrador.filter(p => p.visitado).length;
        const conUbicacionCobrador = prestamosCobrador.filter(p => p.ubicacion.tipo === 'coordenadas').length;
        
        return {
            cobrador,
            total: prestamosCobrador.length,
            visitados: visitadosCobrador,
            pendientes: prestamosCobrador.length - visitadosCobrador,
            conGPS: conUbicacionCobrador,
            sinGPS: prestamosCobrador.length - conUbicacionCobrador,
            porcentaje: prestamosCobrador.length > 0 ? (visitadosCobrador / prestamosCobrador.length * 100).toFixed(1) : 0
        };
    });
    
    container.innerHTML = `
        <h2>📊 Estadísticas Generales</h2>
        
        <div class="stats-grid" style="margin-bottom: 30px;">
            <div class="stat-item">
                <div class="number">${totalPrestamos}</div>
                <div class="label">Total Préstamos</div>
            </div>
            <div class="stat-item">
                <div class="number" style="color: #28a745;">${visitados}</div>
                <div class="label">Visitados</div>
            </div>
            <div class="stat-item">
                <div class="number" style="color: #ffc107;">${pendientes}</div>
                <div class="label">Pendientes</div>
            </div>
            <div class="stat-item">
                <div class="number">${porcentajeVisitados}%</div>
                <div class="label">Avance</div>
            </div>
            <div class="stat-item">
                <div class="number">${conUbicacion}</div>
                <div class="label">Con GPS</div>
            </div>
            <div class="stat-item">
                <div class="number">${sinUbicacion}</div>
                <div class="label">Sin GPS</div>
            </div>
        </div>
        
        <h3>👥 Estadísticas por Cobrador</h3>
        <table>
            <thead>
                <tr>
                    <th>Cobrador</th>
                    <th>Total</th>
                    <th>Visitados</th>
                    <th>Pendientes</th>
                    <th>Con GPS</th>
                    <th>Sin GPS</th>
                    <th>Avance %</th>
                </tr>
            </thead>
            <tbody>
                ${estatsPorCobrador.map(stat => `
                    <tr>
                        <td><strong>${stat.cobrador}</strong></td>
                        <td>${stat.total}</td>
                        <td><span class="badge badge-success">${stat.visitados}</span></td>
                        <td><span class="badge badge-warning">${stat.pendientes}</span></td>
                        <td>${stat.conGPS}</td>
                        <td>${stat.sinGPS}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="flex: 1; background: #e9ecef; border-radius: 10px; height: 20px; overflow: hidden;">
                                    <div style="background: linear-gradient(90deg, #28a745, #20c997); height: 100%; width: ${stat.porcentaje}%; transition: width 0.3s;"></div>
                                </div>
                                <span style="font-weight: 600; color: #28a745;">${stat.porcentaje}%</span>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div style="margin-top: 30px;">
            <h3>📍 Detalles de Desviaciones</h3>
            ${generarTablaDesviaciones()}
        </div>
    `;
}

function generarTablaDesviaciones() {
    const visitadosConDesviacion = appState.prestamos.filter(p => 
        p.visitado && p.distanciaDesviacion > 0
    );
    
    if (visitadosConDesviacion.length === 0) {
        return '<p style="color: #6c757d; font-style: italic;">No hay visitas con desviación registrada aún.</p>';
    }
    
    // Ordenar por mayor desviación
    visitadosConDesviacion.sort((a, b) => b.distanciaDesviacion - a.distanciaDesviacion);
    
    return `
        <table>
            <thead>
                <tr>
                    <th>Préstamo</th>
                    <th>Cobrador</th>
                    <th>Municipio</th>
                    <th>Desviación (km)</th>
                    <th>Desviación (m)</th>
                    <th>Fecha Visita</th>
                </tr>
            </thead>
            <tbody>
                ${visitadosConDesviacion.map(p => `
                    <tr>
                        <td><strong>${p.numeroPrestamo}</strong></td>
                        <td>${p.cobrador}</td>
                        <td>${p.municipio}</td>
                        <td>${p.distanciaDesviacion.toFixed(2)} km</td>
                        <td>${(p.distanciaDesviacion * 1000).toFixed(0)} m</td>
                        <td>${new Date(p.fechaVisita).toLocaleDateString('es-GT')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <p style="margin-top: 15px; color: #6c757d;">
            <strong>Promedio de desviación:</strong> 
            ${(visitadosConDesviacion.reduce((sum, p) => sum + p.distanciaDesviacion, 0) / visitadosConDesviacion.length).toFixed(2)} km
        </p>
    `;
}

// ============== GENERAR PDF DE RUTA DEL DÍA ==============
async function generarPDFRutaDia() {
    const rutaId = document.getElementById('rutaSelectPDF').value;
    
    if (!rutaId) {
        alert('Por favor selecciona una ruta');
        return;
    }

    const ruta = appState.rutasGuardadas.find(r => r.id === rutaId);
    if (!ruta) {
        alert('Ruta no encontrada');
        return;
    }

    const { jsPDF } = window.jspdf;
    // Crear PDF en formato horizontal (landscape)
    const doc = new jsPDF('landscape', 'mm', 'letter'); // 279mm x 216mm

    let y = 15;
    const lineHeight = 5;
    const pageHeight = 200;

    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('RUTA DE COBRANZA', 140, y, { align: 'center' });
    y += 10;

    // Información de la ruta
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Cobrador: ${ruta.cobrador}`, 15, y);
    doc.text(`Fecha: ${ruta.fecha}`, 120, y);
    doc.text(`Total de Visitas: ${ruta.prestamos.length}`, 200, y);
    y += 8;

    // Línea separadora
    doc.setDrawColor(102, 126, 234);
    doc.setLineWidth(0.5);
    doc.line(15, y, 265, y);
    y += 6;

    // Encabezados de tabla con posiciones ajustadas para landscape
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('No.', 17, y);
    doc.text('Préstamo', 28, y);
    doc.text('Cliente', 50, y);
    doc.text('Empresa', 85, y);
    doc.text('Dirección', 115, y);
    doc.text('Municipio', 200, y);
    doc.text('Depto', 240, y);
    y += 5;

    // Línea debajo de encabezados
    doc.setLineWidth(0.3);
    doc.line(15, y - 1, 265, y - 1);
    y += 2;

    // Contenido
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);

    for (let i = 0; i < ruta.prestamos.length; i++) {
        const item = ruta.prestamos[i];
        const prestamo = appState.prestamos.find(p => p.id === item.prestamoId);

        const numero = String(i + 1);
        const numeroPrestamo = String(item.numeroPrestamo || prestamo?.numeroPrestamo || 'N/A');
        const nombreCliente = String(prestamo?.nombreCliente || item.nombreCliente || '');
        const nombreEmpresa = String(prestamo?.nombreEmpresa || item.nombreEmpresa || '');
        const direccion = String(prestamo?.direccion || item.direccion || 'N/A');
        const municipio = String(prestamo?.municipio || item.municipio || 'N/A');
        const departamento = String(prestamo?.departamento || item.departamento || 'N/A');

        // Dividir textos en múltiples líneas (wrap text) con anchos específicos
        const nombreLineas = doc.splitTextToSize(nombreCliente || '-', 32); // 32mm de ancho
        const empresaLineas = doc.splitTextToSize(nombreEmpresa || '-', 28); // 28mm de ancho
        const direccionLineas = doc.splitTextToSize(direccion, 82); // 82mm de ancho
        const municipioLineas = doc.splitTextToSize(municipio, 37); // 37mm de ancho
        const departamentoLineas = doc.splitTextToSize(departamento, 22); // 22mm de ancho

        // Calcular altura de la fila basado en la columna con más líneas
        const maxLineas = Math.max(
            nombreLineas.length,
            empresaLineas.length,
            direccionLineas.length,
            municipioLineas.length,
            departamentoLineas.length
        );
        const alturaFila = maxLineas * lineHeight;

        // Verificar si necesitamos nueva página
        if (y + alturaFila > pageHeight) {
            doc.addPage();
            y = 15;
            
            // Repetir encabezados en nueva página
            doc.setFont(undefined, 'bold');
            doc.setFontSize(9);
            doc.text('No.', 17, y);
            doc.text('Préstamo', 28, y);
            doc.text('Cliente', 50, y);
            doc.text('Empresa', 85, y);
            doc.text('Dirección', 115, y);
            doc.text('Municipio', 200, y);
            doc.text('Depto', 240, y);
            y += 5;
            doc.setLineWidth(0.3);
            doc.line(15, y - 1, 265, y - 1);
            y += 2;
            doc.setFont(undefined, 'normal');
            doc.setFontSize(8);
        }

        // Guardar posición Y inicial para esta fila
        const yInicial = y;

        // Imprimir columnas simples (una línea)
        doc.text(numero, 17, y);
        doc.text(numeroPrestamo, 28, y);

        // Imprimir nombre del cliente con múltiples líneas
        let yNombre = y;
        nombreLineas.forEach(linea => {
            doc.text(linea, 50, yNombre);
            yNombre += lineHeight;
        });

        // Imprimir nombre de empresa con múltiples líneas
        let yEmpresa = y;
        empresaLineas.forEach(linea => {
            doc.text(linea, 85, yEmpresa);
            yEmpresa += lineHeight;
        });

        // Imprimir dirección con múltiples líneas
        let yDireccion = y;
        direccionLineas.forEach(linea => {
            doc.text(linea, 115, yDireccion);
            yDireccion += lineHeight;
        });

        // Imprimir municipio con múltiples líneas
        let yMunicipio = y;
        municipioLineas.forEach(linea => {
            doc.text(linea, 200, yMunicipio);
            yMunicipio += lineHeight;
        });

        // Imprimir departamento con múltiples líneas
        let yDepartamento = y;
        departamentoLineas.forEach(linea => {
            doc.text(linea, 240, yDepartamento);
            yDepartamento += lineHeight;
        });

        // Avanzar Y según la altura de la fila
        y += alturaFila;

        // Línea separadora después de cada registro
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.1);
        doc.line(15, y, 265, y);
        y += 1;
    }

    // Pie de página
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(`Página ${i} de ${totalPages}`, 140, 210, { align: 'center' });
        doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 15, 210);
        doc.setTextColor(0);
    }

    // Descargar
    const nombreArchivo = `Ruta_${ruta.cobrador.replace(/ /g, '_')}_${ruta.fecha}.pdf`;
    doc.save(nombreArchivo);

    alert('✅ PDF generado exitosamente');
}

// Exportar funciones globales si es necesario
window.appState = appState;
