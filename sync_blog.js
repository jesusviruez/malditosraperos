import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import * as cheerio from "cheerio";

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
    console.log("=== INICIANDO SCRAPER HTML (FEED INTEGRADO DESACTIVADO) ===");
    console.log("Obteniendo álbumes actuales de Firestore para caché local...");
    
    const querySnapshot = await getDocs(collection(db, "albums"));
    const cacheDiscosExistentes = new Map();
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const clave = `${simplificarTexto(data.author || '')}_${simplificarTexto(data.title || '')}`;
      cacheDiscosExistentes.set(clave, true);
    });

    console.log(`Caché lista. ${cacheDiscosExistentes.size} álbumes cargados en memoria.`);
    console.log("Descargando el contenido HTML de la portada del blog...");

    // Descargamos directamente la página web principal que sí está siempre activa
    const response = await fetch("https://vertederoderimas.blogspot.com/", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    const htmlData = await response.text();

    // Cargamos el HTML en cheerio para poder buscar las entradas
    const $ = cheerio.load(htmlData);
    
    // En las plantillas clásicas de Blogger, cada post está envuelto en la clase '.post'
    const posts = $(".post");
    console.log(`Se han encontrado ${posts.length} posts visibles en la portada web.`);

    if (posts.length === 0) {
      console.log("No se pudieron detectar entradas con la estructura esperada.");
      return;
    }

    let nuevosDiscosContador = 0;

    // Procesamos de abajo hacia arriba (los más viejos de la portada primero) para mantener orden temporal lógico
    for (let i = posts.length - 1; i >= 0; i--) {
      const postElement = $(posts[i]);

      // 1. Obtener el título del post (Suele estar dentro de .post-title o h3)
      let tituloEntrada = postElement.find(".post-title").text().trim() || postElement.find("h3").text().trim();
      
      if (!tituloEntrada) continue;

      let autor = "Desconocido";
      let tituloAlbum = "Sin título";
      let year = "2026"; // Año por defecto

      // Filtramos formatos de texto "Autor - Disco (Año)"
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

      if (cacheDiscosExistentes.has(claveVerificacion)) {
        console.log(`[Ya existe] Saltando: ${autor} - ${tituloAlbum}`);
        continue;
      }

      // 2. Extraer la primera imagen de portada del post
      let portada = "https://placehold.co/200x200?text=Sin+Portada";
      const primeraImg = postElement.find(".post-body img").first();
      if (primeraImg.length && primeraImg.attr("src")) {
        portada = primeraImg.attr("src");
      }

      // 3. Generar mes numérico basándonos en el mes actual del scraping 
      // Ya que el HTML requiere parsear strings complejos de fechas según el idioma, usamos el actual.
      const mesIndex = String(new Date().getMonth() + 1).padStart(2, '0');

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
      console.log(`+ ¡INSERTADO CON ÉXITO DESDE WEB!: ${autor} - ${tituloAlbum} (${year})`);
      
      cacheDiscosExistentes.set(claveVerificacion, true);
      nuevosDiscosContador++;
    }

    console.log(`Sincronización terminada. Se han añadido ${nuevosDiscosContador} álbumes nuevos.`);

  } catch (error) {
    console.error("Hubo un error crítico en el scraper HTML:", error);
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
