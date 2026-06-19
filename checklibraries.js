import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";

// Tu configuración de Firebase
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

async function corregirBibliotecasVacias() {
  try {
    console.log("=== INICIANDO REVISIÓN DE BIBLIOTECAS ===");
    console.log("Buscando álbumes huérfanos en Firestore...");

    // 1. MINIMIZACIÓN DE LECTURAS: 
    // En lugar de traer todo, usamos 'where' para obtener SOLO los discos donde 'library' no exista, sea null o esté vacía.
    // Traemos toda la colección para evaluar de forma segura en memoria local los estados indefinidos.
    const querySnapshot = await getDocs(collection(db, "albums"));
    
    // Inicializamos el lote (batch) de escritura de Firestore
    const batch = writeBatch(db);
    let contadorHuerfanos = 0;

    querySnapshot.forEach((documento) => {
      const data = documento.data();
      const biblioteca = data.library;

      // Verificamos si NO es ni 'rap' ni 'rnb' (o si viene vacío/indefinido)
      if (!biblioteca || (biblioteca !== "rap" && biblioteca !== "rnb")) {
        const albumRef = doc(db, "albums", documento.id);
        
        // Añadimos la actualización al lote
        batch.update(albumRef, { 
          library: "rap",
          updatedAt: new Date().toISOString() // Mantenemos el rastro de modificación
        });
        
        console.log(`[Detectado] Corrigiendo: ${data.author || 'Desconocido'} - ${data.title || 'Sin título'} (Asignado a 'rap')`);
        contadorHuerfanos++;
      }
    });

    // 2. MINIMIZACIÓN DE ESCRITURAS:
    // Si encontramos álbumes sin biblioteca, los guardamos todos juntos en un solo bloque (batch)
    if (contadorHuerfanos > 0) {
      console.log(`Aplicando cambios en lote para ${contadorHuerfanos} álbumes...`);
      await batch.commit();
      console.log("=== REVISIÓN COMPLETADA CON ÉXITO ===");
    } else {
      console.log("Perfecto. Todos los álbumes de la base de datos ya tienen una biblioteca válida asignada.");
    }

  } catch (error) {
    console.error("Hubo un error al revisar la base de datos:", error);
  }
}

// Ejecutar el script
corregirBibliotecasVacias();
