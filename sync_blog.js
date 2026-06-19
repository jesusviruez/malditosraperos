import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";

// 1. Tu configuración de Firebase (Extraída de tu admin.html)
const firebaseConfig = {
  apiKey: "AIzaSyBXtUHO5_IYEAFk696uBThhd-etduPA0y8",
  authDomain: "malditosraperos-c9198.firebaseapp.com",
  projectId: "malditosraperos-c9198",
  storageBucket: "malditosraperos-c9198.firebasestorage.app",
  messagingSenderId: "78058247623",
  appId: "1:78058247623:web:c05270f82c18f5b5bb35e2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Mapeo de meses en texto a su formato numérico de dos dígitos "MM"
const MESES_MAP = {
  "enero": "01", "febrero": "02", "marzo": "03", "abril": "04", "mayo": "05", "junio": "06",
  "julio": "07", "agosto": "08", "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"
};

async function sincronizarVertedero() {
  try {
    console.log("Obteniendo álbumes actuales de Firestore para caché local...");
    
    // === MINIMIZACIÓN DE CUOTA (PASO 1): Una única lectura para traer todos los discos ===
    const querySnapshot = await getDocs(collection(db, "albums"));
    const cacheDiscosExistentes = new Map();
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Creamos una clave única combinando autor y título simplificados en minúsculas
      const clave = `${simplificarTexto(data.author || '')}_${simplificarTexto(data.title || '')}`;
      cacheDiscosExistentes.set(clave, true);
    });

    console.log(`Caché lista. ${cacheDiscosExistentes.size} álbumes cargados en memoria.`);

    // === PASO 2: Leer las últimas entradas de Vertedero de Rimas usando la API pública de Blogger ===
    console.log("Leyendo las últimas entradas del blog...");
    // Solicitamos las últimas 20 entradas en formato JSON de forma nativa
    const blogUrl = "https://vertederoderimas.blogspot.com/feeds/posts/default?alt=json&max-results=20";
    const response = await fetch(blogUrl);
    const feed = await response.json();
    const entradas = feed.feed.entry || [];

    if (entradas.length === 0) {
      console.log("No se encontraron entradas recientes en el blog.");
      return;
    }

    let nuevosDiscosContador = 0;

    // === PASO 3: Procesar entradas y verificar en la caché ===
    for (const entrada of entradas) {
      const tituloEntrada = entrada.title.$t; // Ej: "Chysteman - Uh (2026)" o "Violadores del Verso - Vivir para contarlo"
      
      // Intentamos extraer Autor, Título del álbum y Año usando expresiones regulares comunes en blogs de rap
      // Formato típico: "Autor - Título (Año)" o "Autor - Título"
      let autor = "Desconocido";
      let tituloAlbum = "Sin título";
      let year = new Date().getFullYear().toString(); // Año actual por defecto

      const regexConAnio = /^(.*?)\s*-\s*([^()]*?)\s*\((\d{4})\)/;
      const regexSimple = /^(.*?)\s*-\s*(.*)/;

      if (regexConAnio.test(tituloEntrada)) {
        const matches = tituloEntrada.match(regexConAnio);
        autor = matches[1].trim();
        tituloAlbum = matches[2].trim();
        year = matches[3].trim();
      } else if (regexSimple.test(tituloEntrada)) {
        const matches = tituloEntrada.match(regexSimple);
        autor = matches[1].trim();
        tituloAlbum = matches[2].trim();
      } else {
        // Si no cumple el formato "Autor - Título", usamos la entrada completa como título
        tituloAlbum = tituloEntrada.trim();
      }

      // Generar clave de verificación para nuestra caché en memoria
      const claveVerificacion = `${simplificarTexto(autor)}_${simplificarTexto(tituloAlbum)}`;

      // === COMPROBACIÓN LOCAL: 0 llamadas extra a Firebase ===
      if (cacheDiscosExistentes.has(claveVerificacion)) {
        // El disco ya existe, pasamos al siguiente sin hacer nada
        continue;
      }

      // Obtener el mes de publicación de la entrada del blog para el campo 'month'
      // La fecha viene en formato ISO: "2026-06-19T08:15:00.000Z"
      const fechaPublicacion = new Date(entrada.published.$t);
      const mesIndex = String(fechaPublicacion.getMonth() + 1).padStart(2, '0'); // "01", "02", etc.

      // Intentar buscar una imagen dentro del contenido de la entrada para la portada
      let portada = "https://placehold.co/200x200?text=Sin+Portada";
      const contenido = entrada.content ? entrada.content.$t : '';
      const imgRegex = /src=["'](https?:\/\/[^"']+)["']/i;
      const imgMatch = contenido.match(imgRegex);
      if (imgMatch && imgMatch[1]) {
        portada = imgMatch[1];
      }

      // El enlace de la entrada sirve como link de referencia alternativa o se deja vacío si no hay Spotify
      const enlaceBlog = entrada.link.find(l => l.rel === 'alternate')?.href || '';

      // Estructuramos el objeto respetando de forma estricta los campos de tu base de datos
      // Nota: Al ser un blog de Rap, se asigna por defecto a la biblioteca "rap"
      const nuevoAlbum = {
        library: "rap",
        author: autor,
        title: tituloAlbum,
        cover: portada,
        link: "", // El feed no nos da el Spotify directo, se puede rellenar a mano después o usar el del blog
        bandcamp: "",
        youtube: "",
        year: year,
        month: mesIndex,
        createdAt: new Date().toISOString(), // Mantiene el orden de "último añadido en la BD" que configuramos
        updatedAt: new Date().toISOString()  //
      };

      // === MINIMIZACIÓN DE CUOTA (PASO 4): Solo escribimos lo estrictamente necesario ===
      await addDoc(collection(db, "albums"), nuevoAlbum);
      console.log(`+ Añadido con éxito: ${autor} - ${tituloAlbum} (${year})`);
      
      // Agregamos a la caché local por si viene duplicado en el mismo feed
      cacheDiscosExistentes.set(claveVerificacion, true);
      nuevosDiscosContador++;
    }

    console.log(`Sincronización terminada. Se han añadido ${nuevosDiscosContador} álbumes nuevos.`);

  } catch (error) {
    console.error("Hubo un error en la sincronización:", error);
  }
}

// Función auxiliar para normalizar textos (evitar fallos por espacios extras, mayúsculas o acentos)
function simplificarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Elimina acentos
    .replace(/[^a-z0-9]/g, "");     // Elimina todo lo que no sea letra o número
}

// Ejecutar el script
sincronizarVertedero();
