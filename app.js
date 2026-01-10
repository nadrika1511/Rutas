// app.js - Sistema de Rutas v2.2 - PARTE 1
// Última actualización: 2025-01-10
import { db, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy } from './firebase-config.js';

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
    document.getElementById('btnVerDisponibilidad').addEventListener('click', verDisponibilidadCobrador);
    document.getElementById('btnGuardarRuta').addEventListener('click', guardarRuta);
    document.getElementById('btnDescargarPDF').addEventListener('click', descargarPDF);
    document.getElementById('btnRegistrarGPS').addEventListener('click', registrarGPSManual);
    document.getElementById('rutaSelectVisita').addEventListener('change', () => cargarVisitasRuta(false));
    
    // Buscador de clientes
    document.getElementById('inputBuscarCliente').addEventListener('input', buscarCliente);
    
    // Botones de gestión de rutas
    document.getElementById('btnVerPendientes').addEventListener('click', () => cargarVisitasRuta(true));
    document.getElementById('btnVerTodos').addEventListener('click', () => cargarVisitasRuta(false));
    document.getElementById('btnEliminarRuta').addEventListener('click', eliminarRutaSeleccionada);
    
    // Event listeners para exportación
    const btnExportarTodo = document.getElementById('btnExportarTodo');
    if (btnExportarTodo) {
        btnExportarTodo.addEventListener('click', exportarAExcel);
    }
    
    const btnExportarVisitados = document.getElementById('btnExportarVisitados');
    if (btnExportarVisitados) {
        btnExportarVisitados.addEventListener('click', exportarVisitados);
    }
    
    const btnExportarPendientes = document.getElementById('btnExportarPendientes');
    if (btnExportarPendientes) {
        btnExportarPendientes.addEventListener('click', exportarPendientes);
    }
    
    // Usar delegación de eventos para botones que pueden no existir inicialmente
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btnGenerarPDFRuta') {
            generarPDFRutaDia();
        }
    });
}

// ============== VER DISPONIBILIDAD DE COBRADOR ==============
function verDisponibilidadCobrador() {
    const cobrador = document.getElementById('cobradorSelect').value;
    const container = document.getElementById('infoDisponibilidad');
    
    if (!cobrador) {
        container.innerHTML = '<p style="color: #dc3545; padding: 15px; background: #f8d7da; border-radius: 8px;">⚠️ Selecciona un cobrador primero</p>';
        return;
    }
    
    const prestamosEnRutas = new Set();
    const rutasDelCobrador = [];
    appState.rutasGuardadas.forEach(ruta => {
        if (ruta.cobrador === cobrador) {
            rutasDelCobrador.push(ruta);
        }
        ruta.prestamos.forEach(item => {
            prestamosEnRutas.add(item.prestamoId);
        });
    });
    
    const totalPrestamosCobrador = appState.prestamos.filter(p => p.cobrador === cobrador).length;
    const visitadosCobrador = appState.prestamos.filter(p => p.cobrador === cobrador && p.visitado).length;
    const enRutasCobrador = appState.prestamos.filter(p => p.cobrador === cobrador && prestamosEnRutas.has(p.id)).length;
    const disponibles = appState.prestamos.filter(p => 
        p.cobrador === cobrador && 
        !p.visitado && 
        !prestamosEnRutas.has(p.id)
    );
    const disponiblesConGPS = disponibles.filter(p => p.ubicacion.tipo === 'coordenadas').length;
    const disponiblesSinGPS = disponibles.filter(p => p.ubicacion.tipo === 'sin_visita').length;
    
    container.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 10px; border-left: 5px solid #17a2b8;">
            <h3 style="color: #17a2b8; margin-top: 0;">📊 Disponibilidad: ${cobrador}</h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
                <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #1976d2;">${totalPrestamosCobrador}</div>
                    <div style="color: #1976d2; font-size: 14px;">Total Clientes</div>
                </div>
                <div style="background: #c8e6c9; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #388e3c;">${visitadosCobrador}</div>
                    <div style="color: #388e3c; font-size: 14px;">✅ Visitados</div>
                </div>
                <div style="background: #fff9c4; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #f57c00;">${enRutasCobrador}</div>
                    <div style="color: #f57c00; font-size: 14px;">📅 En Rutas</div>
                </div>
                <div style="background: #f3e5f5; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #7b1fa2;">${disponibles.length}</div>
                    <div style="color: #7b1fa2; font-size: 14px;">🆓 Disponibles</div>
                </div>
            </div>
            
            ${disponibles.length > 0 ? `
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <h4 style="margin: 0 0 10px 0; color: #2e7d32;">✅ Clientes Disponibles para Nueva Ruta:</h4>
                    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                        <div>
                            <strong>Con GPS:</strong> <span style="color: #2e7d32; font-size: 20px;">${disponiblesConGPS}</span>
                        </div>
                        <div>
                            <strong>Sin GPS:</strong> <span style="color: #f57c00; font-size: 20px;">${disponiblesSinGPS}</span>
                        </div>
                    </div>
                </div>
            ` : `
                <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <p style="margin: 0; color: #c62828;">⚠️ <strong>No hay clientes disponibles para nueva ruta</strong></p>
                    <p style="margin: 5px 0 0 0; color: #c62828; font-size: 14px;">Todos están visitados o ya en rutas guardadas.</p>
                </div>
            `}
            
            ${rutasDelCobrador.length > 0 ? `
                <div style="background: #fff3e0; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #e65100;">📋 Rutas Guardadas de ${cobrador}:</h4>
                    ${rutasDelCobrador.map(ruta => `
                        <div style="padding: 8px; background: white; border-radius: 5px; margin-bottom: 8px;">
                            <strong>📅 ${ruta.fecha}</strong> - ${ruta.prestamos.length} clientes
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function setFechaActual() {
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaRuta').value = hoy;
}

// CONTINÚA EN PARTE 2...
// Copia TODO tu código actual desde importarExcel() hasta 
// justo antes de window.appState = appState;

// ============== EXPORTAR A EXCEL ==============
// COPIAR ESTAS FUNCIONES AL FINAL DE TU app.js
// JUSTO ANTES DE: window.appState = appState;

async function exportarAExcel() {
    try {
        const statusDiv = document.getElementById('exportStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '<div class="info">⏳ Preparando exportación...</div>';
            statusDiv.style.display = 'block';
        }

        if (!appState.prestamos || appState.prestamos.length === 0) {
            alert('⚠️ No hay datos para exportar. Importa datos primero.');
            return;
        }

        console.log(`📊 Exportando ${appState.prestamos.length} préstamos...`);

        const datosExcel = appState.prestamos.map(prestamo => {
            let ubicacionTexto = 'Sin visita';
            if (prestamo.ubicacion && prestamo.ubicacion.tipo === 'coordenadas') {
                ubicacionTexto = `${prestamo.ubicacion.lat},${prestamo.ubicacion.lng}`;
            }

            let ubicacionRealTexto = '';
            if (prestamo.ubicacionReal) {
                ubicacionRealTexto = `${prestamo.ubicacionReal.lat},${prestamo.ubicacionReal.lng}`;
            }

            let fechaVisitaTexto = '';
            if (prestamo.fechaVisita) {
                const fecha = new Date(prestamo.fechaVisita);
                fechaVisitaTexto = fecha.toLocaleString('es-GT');
            }

            const totalVisitas = (prestamo.historialVisitas || []).length;

            let ultimaVisitaResultado = '';
            if (prestamo.historialVisitas && prestamo.historialVisitas.length > 0) {
                const ultima = prestamo.historialVisitas[prestamo.historialVisitas.length - 1];
                ultimaVisitaResultado = ultima.localizado ? 'Localizado' : 'No localizado';
            }

            return {
                'PRESTAMO': prestamo.numeroPrestamo || '',
                'Nombre': prestamo.nombreCliente || '',
                'Nombre de Empresa': prestamo.nombreEmpresa || '',
                'DPI': prestamo.dpi || '',
                'Cobrador': prestamo.cobrador || '',
                'Dirección': prestamo.direccion || '',
                'Municipio': prestamo.municipio || '',
                'Departamento': prestamo.departamento || '',
                'Ubicación': ubicacionTexto,
                'Tipo Visita': prestamo.tipoVisita || 'domiciliar',
                'Visitado': prestamo.visitado ? 'SÍ' : 'NO',
                'Fecha Visita': fechaVisitaTexto,
                'Ubicación Real': ubicacionRealTexto,
                'Desviación (km)': prestamo.distanciaDesviacion ? prestamo.distanciaDesviacion.toFixed(2) : '',
                'Desviación (m)': prestamo.distanciaDesviacion ? (prestamo.distanciaDesviacion * 1000).toFixed(0) : '',
                'Total Visitas': totalVisitas,
                'Última Visita - Resultado': ultimaVisitaResultado,
                'En Cartera pasada': prestamo.enCarteraPasada || '',
                'Fecha Importación': prestamo.fechaImportacion ? new Date(prestamo.fechaImportacion).toLocaleString('es-GT') : ''
            };
        });

        const wb = XLSX.utils.book_new();
        
        const ws = XLSX.utils.json_to_sheet(datosExcel);

        const columnWidths = [
            { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 15 },
            { wch: 20 }, { wch: 40 }, { wch: 20 }, { wch: 15 },
            { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 20 },
            { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
            { wch: 20 }, { wch: 18 }, { wch: 20 }
        ];
        ws['!cols'] = columnWidths;

        XLSX.utils.book_append_sheet(wb, ws, 'Todos los Préstamos');

        const cobradores = [...new Set(appState.prestamos.map(p => p.cobrador))].filter(Boolean);
        
        cobradores.forEach(cobrador => {
            const prestamosCobrador = datosExcel.filter(p => p.Cobrador === cobrador);
            const wsCobrador = XLSX.utils.json_to_sheet(prestamosCobrador);
            wsCobrador['!cols'] = columnWidths;
            
            let nombreHoja = cobrador.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, wsCobrador, nombreHoja);
        });

        const estadisticas = [
            { 'Concepto': 'Total de Préstamos', 'Valor': appState.prestamos.length },
            { 'Concepto': 'Préstamos Visitados', 'Valor': appState.prestamos.filter(p => p.visitado).length },
            { 'Concepto': 'Préstamos Pendientes', 'Valor': appState.prestamos.filter(p => !p.visitado).length },
            { 'Concepto': 'Con Ubicación GPS', 'Valor': appState.prestamos.filter(p => p.ubicacion?.tipo === 'coordenadas').length },
            { 'Concepto': 'Sin Ubicación GPS', 'Valor': appState.prestamos.filter(p => p.ubicacion?.tipo !== 'coordenadas').length },
            { 'Concepto': 'Total Cobradores', 'Valor': cobradores.length },
            { 'Concepto': 'Domiciliares', 'Valor': appState.prestamos.filter(p => p.tipoVisita === 'domiciliar').length },
            { 'Concepto': 'Laborales', 'Valor': appState.prestamos.filter(p => p.tipoVisita === 'laboral').length },
            { 'Concepto': 'Fecha Exportación', 'Valor': new Date().toLocaleString('es-GT') }
        ];
        const wsEstadisticas = XLSX.utils.json_to_sheet(estadisticas);
        wsEstadisticas['!cols'] = [{ wch: 30 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsEstadisticas, 'Estadísticas');

        const nombreArchivo = `Base_Datos_Rutas_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);

        console.log(`✅ Exportación completada: ${nombreArchivo}`);

        if (statusDiv) {
            statusDiv.innerHTML = `
                <div class="success">
                    ✅ Exportación exitosa: ${appState.prestamos.length} préstamos exportados<br>
                    📁 Archivo: ${nombreArchivo}<br>
                    📊 Hojas: Todos los Préstamos + ${cobradores.length} cobradores + Estadísticas
                </div>
            `;
        } else {
            alert(`✅ Exportación exitosa\n\n${appState.prestamos.length} préstamos exportados\nArchivo: ${nombreArchivo}`);
        }

    } catch (error) {
        console.error('Error exportando:', error);
        alert('❌ Error al exportar a Excel: ' + error.message);
    }
}

async function exportarVisitados() {
    try {
        const visitados = appState.prestamos.filter(p => p.visitado);
        
        if (visitados.length === 0) {
            alert('⚠️ No hay préstamos visitados para exportar.');
            return;
        }

        const datosExcel = visitados.map(prestamo => {
            let ubicacionTexto = 'Sin visita';
            if (prestamo.ubicacion && prestamo.ubicacion.tipo === 'coordenadas') {
                ubicacionTexto = `${prestamo.ubicacion.lat},${prestamo.ubicacion.lng}`;
            }

            let ubicacionRealTexto = '';
            if (prestamo.ubicacionReal) {
                ubicacionRealTexto = `${prestamo.ubicacionReal.lat},${prestamo.ubicacionReal.lng}`;
            }

            const fechaVisitaTexto = prestamo.fechaVisita ? 
                new Date(prestamo.fechaVisita).toLocaleString('es-GT') : '';

            const totalVisitas = (prestamo.historialVisitas || []).length;

            return {
                'PRESTAMO': prestamo.numeroPrestamo || '',
                'Nombre': prestamo.nombreCliente || '',
                'Empresa': prestamo.nombreEmpresa || '',
                'Cobrador': prestamo.cobrador || '',
                'Municipio': prestamo.municipio || '',
                'Tipo Visita': prestamo.tipoVisita || 'domiciliar',
                'Fecha Visita': fechaVisitaTexto,
                'Ubicación Original': ubicacionTexto,
                'Ubicación Real': ubicacionRealTexto,
                'Desviación (km)': prestamo.distanciaDesviacion ? prestamo.distanciaDesviacion.toFixed(2) : '',
                'Desviación (m)': prestamo.distanciaDesviacion ? (prestamo.distanciaDesviacion * 1000).toFixed(0) : '',
                'Total Visitas': totalVisitas
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(datosExcel);
        ws['!cols'] = [
            { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, 
            { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 25 }, 
            { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Visitados');

        const nombreArchivo = `Prestamos_Visitados_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);

        alert(`✅ Exportación exitosa\n\n${visitados.length} préstamos visitados exportados\nArchivo: ${nombreArchivo}`);

    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al exportar: ' + error.message);
    }
}

async function exportarPendientes() {
    try {
        const pendientes = appState.prestamos.filter(p => !p.visitado);
        
        if (pendientes.length === 0) {
            alert('⚠️ No hay préstamos pendientes para exportar.');
            return;
        }

        const datosExcel = pendientes.map(prestamo => {
            let ubicacionTexto = 'Sin visita';
            if (prestamo.ubicacion && prestamo.ubicacion.tipo === 'coordenadas') {
                ubicacionTexto = `${prestamo.ubicacion.lat},${prestamo.ubicacion.lng}`;
            }

            return {
                'PRESTAMO': prestamo.numeroPrestamo || '',
                'Nombre': prestamo.nombreCliente || '',
                'Empresa': prestamo.nombreEmpresa || '',
                'DPI': prestamo.dpi || '',
                'Cobrador': prestamo.cobrador || '',
                'Dirección': prestamo.direccion || '',
                'Municipio': prestamo.municipio || '',
                'Departamento': prestamo.departamento || '',
                'Ubicación': ubicacionTexto,
                'Tipo Visita': prestamo.tipoVisita || 'domiciliar'
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(datosExcel);
        ws['!cols'] = [
            { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 15 },
            { wch: 20 }, { wch: 40 }, { wch: 20 }, { wch: 15 },
            { wch: 25 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Pendientes');

        const nombreArchivo = `Prestamos_Pendientes_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);

        alert(`✅ Exportación exitosa\n\n${pendientes.length} préstamos pendientes exportados\nArchivo: ${nombreArchivo}`);

    } catch (error) {
        console.error('Error:', error);
        alert('❌ Error al exportar: ' + error.message);
    }
}

// DESPUÉS DE ESTAS 3 FUNCIONES, CONTINÚA CON:
// window.appState = appState;
