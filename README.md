# 🗺️ Sistema de Rutas de Cobranza - Avanta

Sistema web para optimizar rutas de cobradores, basado en ubicaciones GPS y algoritmos de optimización.

## 🎯 Características

### 1. Importación de Datos
- Carga masiva desde Excel
- Extracción automática de coordenadas GPS desde URLs de Google Maps
- Identificación de préstamos sin ubicación previa

### 2. Gestión por Cobrador
- Dashboard individual por cobrador
- Estadísticas de cartera asignada
- Visualización de préstamos con/sin ubicación

### 3. Generador de Rutas Optimizadas
- **Algoritmo Nearest Neighbor**: Optimiza la ruta para minimizar distancias
- **Punto de inicio personalizable**: Ingresas el GPS de inicio
- **Mínimo de visitas**: Configuras cuántas visitas incluir en la ruta
- **Integración inteligente**: Agrupa automáticamente préstamos "sin visita previa" con los del mismo municipio

### 4. Mapas Interactivos
- Visualización con Leaflet/OpenStreetMap
- Marcadores numerados por orden de visita
- Líneas de ruta
- Cálculo de distancias y tiempos

### 5. Control de Visitas
- Marca préstamos como visitados
- Registro manual de ubicación GPS real
- Cálculo de desviación entre ubicación planificada y real
- Exclusión automática de visitados en futuras rutas

### 6. Reportes PDF
- Generación automática de PDF con:
  - Información del cobrador y fecha
  - Lista ordenada de visitas
  - Distancias y tiempos estimados
  - Mapa visual de la ruta
  - Préstamos sin ubicación por municipio

## 🚀 Instalación

### Requisitos
- Navegador web moderno
- Conexión a internet (para mapas y Firebase)

### Pasos

1. **Clonar el repositorio**
```bash
git clone https://github.com/nadrika1511/Rutas.git
cd Rutas
```

2. **Configurar Firebase** (Ya está configurado)
   - El proyecto usa: `rutas-d6214`
   - Las credenciales están en `firebase-config.js`

3. **Abrir la aplicación**
   - Simplemente abre `index.html` en tu navegador
   - O usa un servidor local:
   ```bash
   python -m http.server 8000
   # Luego abre http://localhost:8000
   ```

## 📋 Uso del Sistema

### Paso 1: Importar Datos
1. Ve a la pestaña **"📁 Importar"**
2. Selecciona tu archivo Excel (Rutas.xlsx)
3. Click en **"Cargar Archivo"**
4. Espera la confirmación de importación

### Paso 2: Verificar Cobradores
1. Ve a **"👥 Cobradores"**
2. Revisa las estadísticas de cada cobrador
3. Verifica préstamos con/sin ubicación

### Paso 3: Generar Ruta
1. Ve a **"🚗 Generar Ruta"**
2. Selecciona el cobrador
3. Ingresa el punto de inicio (GPS): `14.6349,-90.5069`
4. Define el mínimo de visitas (ejemplo: 10)
5. Click en **"Generar Ruta Optimizada"**
6. Revisa el mapa y la secuencia generada

### Paso 4: Guardar y Descargar
1. Click en **"💾 Guardar Ruta"** para guardar en Firebase
2. Click en **"📄 Descargar PDF"** para obtener el reporte

### Paso 5: Registrar Visitas
1. Ve a **"✅ Visitas"**
2. Selecciona la ruta correspondiente
3. Para registrar GPS real:
   - Selecciona el préstamo
   - Ingresa las coordenadas reales
   - Click en **"Registrar Ubicación"**
4. El sistema calculará la desviación automáticamente

## 🧮 Algoritmo de Optimización

El sistema usa el algoritmo **Nearest Neighbor (Vecino más Cercano)**:

```
1. Empezar en el punto de inicio
2. De los préstamos disponibles, seleccionar el más cercano
3. Moverse a ese punto
4. Repetir hasta alcanzar el mínimo de visitas
```

### Cálculo de Distancias
- Fórmula de **Haversine** para distancia entre coordenadas GPS
- Precisión: ±10-50 metros
- Variación típica: 5-15% vs ruta real en carro

### Estimación de Tiempos
- Velocidad promedio: 30 km/h (tráfico urbano)
- Fórmula: `Tiempo = Distancia / 30`

## 📊 Estructura de Datos

### Firebase Collections

#### `prestamos`
```javascript
{
  numeroPrestamo: "12345",
  cobrador: "Victor Marroquín",
  municipio: "GUATEMALA",
  departamento: "GUATEMALA",
  ubicacion: {
    lat: 14.6349,
    lng: -90.5069,
    tipo: "coordenadas" // o "sin_visita"
  },
  visitado: false,
  fechaVisita: null,
  ubicacionReal: null,
  distanciaDesviacion: 0,
  fechaImportacion: "2025-12-03T..."
}
```

#### `rutas`
```javascript
{
  cobrador: "Victor Marroquín",
  fecha: "2025-12-03",
  puntoInicio: { lat: 14.6349, lng: -90.5069 },
  prestamos: [
    {
      prestamoId: "abc123",
      numeroPrestamo: "12345",
      municipio: "GUATEMALA",
      distancia: 2.5,
      tiempo: 5,
      sinUbicacionMunicipio: ["def456", "ghi789"]
    }
  ],
  fechaCreacion: "2025-12-03T...",
  completada: false
}
```

## 🔧 Tecnologías

- **HTML5/CSS3**: Interfaz responsive
- **JavaScript (ES6+)**: Lógica del sistema
- **Firebase Firestore**: Base de datos en tiempo real
- **Leaflet.js**: Mapas interactivos
- **XLSX.js**: Lectura de archivos Excel
- **jsPDF**: Generación de reportes PDF
- **html2canvas**: Captura de mapas para PDF

## 📱 Uso en Codespace

Para usar en GitHub Codespace:

1. Abre el repositorio en Codespace
2. El sistema detectará automáticamente los puertos
3. Abre el navegador en el puerto sugerido
4. ¡Listo para usar!

## 🎨 Personalización

### Cambiar Velocidad Promedio
En `app.js`, línea ~370:
```javascript
const velocidadPromedio = 30; // Cambiar según necesidad
```

### Ajustar Colores del Mapa
En `app.js`, función `mostrarMapaRuta()`:
```javascript
L.polyline(coordenadas, { 
    color: '#667eea',  // Cambiar color
    weight: 3           // Cambiar grosor
})
```

## 🐛 Solución de Problemas

### No carga el Excel
- Verifica que tenga las columnas: PRESTAMO, Si fuera, Municipio, Departamento, Ubicación
- Asegúrate que el formato sea .xlsx

### No se genera la ruta
- Verifica que haya préstamos con ubicación GPS
- Confirma que el punto de inicio tenga formato correcto: `lat,lng`

### El mapa no se muestra
- Verifica conexión a internet
- Revisa la consola del navegador (F12)

## 📞 Soporte

Para dudas o mejoras, contacta al equipo de desarrollo.

## 📄 Licencia

Uso interno - Avanta Credits Department

---

**Desarrollado por**: Nestor  
**Fecha**: Diciembre 2025  
**Versión**: 1.0
