import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import { XMLParser } from "fast-xml-parser";

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

async function sincronizarVertedero() {
  try {
    console.log("=== INICIANDO SCRIPT REORDENADO POR PORTADA ===");
    console.log("Obteniendo álbumes actuales de Firestore para caché local...");
    
    const querySnapshot = await getDocs(collection(db, "albums"));
    const cacheDiscosExistentes = new Map();
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const clave = `${simplificarTexto(data.author || '')}_${simplificarTexto(data.title || '')}`;
      cacheDiscosExistentes.set(clave, true);
    });

    console.log(`Caché lista. ${cacheDiscosExistentes.size} álbumes cargados en memoria.`);
    
    // CAMBIO CLAVE: Añadimos orderby=updated para traer lo último que se ve en la portada del blog
    console.log("Conectando con el Feed de Blogger ordenado por actualización...");
    const blogUrl = "https://vertederoderimas.blogspot.com/feeds/posts/default?max-results=50&orderby=updated";
    const response = await fetch(blogUrl);
    const xmlData = await response.text(); 
    
    const parser = new XMLParser({ 
      ignoreAttributes: false, 
      attributeNamePrefix: "",
      textNodeName: "text"
    });
    const jsonObj = parser.parse(xmlData);
    
    const entradas = jsonObj.feed?.entry || [];
    const listaEntradas = Array.isArray(entradas) ? entradas : [entradas];

    if (listaEntradas.length === 0 || !listaEntradas[0]) {
      console.log("No se encontraron entradas en el blog.");
      return;
    }

    let nuevosDiscosContador = 0;

    for (const entrada of listaEntradas) {
      let tituloEntrada = "";
      if (entrada.title) {
        tituloEntrada = typeof entrada.title === 'object' ? (entrada.title.text || entrada.title['#text'] || '') : entrada.title;
      }
      
      if (!tituloEntrada || typeof tituloEntrada !== 'string') continue;

      let autor = "Desconocido";
      let tituloAlbum = "Sin título";
      let year = "2026"; // Año por defecto

      // Regex optimizada para buscar el año (4 dígitos entre paréntesis) al final de la cadena
      const regexConAnio = /^(.*?)\s*-\s*(.*?)\s*\((\d{4})\)\s*$/;
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
        tituloAlbum = tituloEntrada.trim();
      }

      const claveVerificacion = `${simplificarTexto(autor)}_${simplificarTexto(tituloAlbum)}`;

      // Verificar contra la caché de Firestore
      if (cacheDiscosExistentes.has(claveVerificacion)) {
        console.log(`[Ya existe] Saltando: ${autor} - ${tituloAlbum}`);
        continue; 
      }

      const fechaPublicacionRaw = entrada.published || entrada.updated || new Date().toISOString();
      const fechaPublicacion = new Date(fechaPublicacionRaw);
      const mesIndex = String(fechaPublicacion.getMonth() + 1).padStart(2, '0');

      let portada = "https://placehold.co/200x200?text=Sin+Portada";
      let contenido = "";
      if (entrada.content) {
        contenido = typeof entrada.content === 'object' ? (entrada.content.text || entrada.content['#text'] || '') : entrada.content;
      }
      
      const imgRegex = /src=["'](https?:\/\/[^"']+)["']/i;
      const imgMatch = contenido.match(imgRegex);
      if (imgMatch && imgMatch[1]) {
        portada = imgMatch[1];
      }

      const nuevoAlbum = {
        library: "rap",
        author: autor,
        title: tituloAlbum,
        cover: portada,
        link: "", 
        bandcamp: "",
        youtube: "",
        year: year,
        month: mesIndex,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, "albums"), nuevoAlbum);
      console.log(`+ ¡INSERTADO CON ÉXITO!: ${autor} - ${tituloAlbum} (${year})`);
      
      cacheDiscosExistentes.set(claveVerificacion, true);
      nuevosDiscosContador++;
    }

    console.log(`Sincronización terminada. Se han añadido ${nuevosDiscosContador} álbumes nuevos.`);

  } catch (error) {
    console.error("Hubo un error en la sincronización:", error);
  }
}

function simplificarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

sincronizarVertedero();
