import admin from 'firebase-admin';
import axios from 'axios';

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Función auxiliar para esperar (en milisegundos)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function migrateAlbums() {
    console.log('Iniciando migración de álbumes...');
    const snapshot = await db.collection('albums').get();
    console.log(`Total de documentos encontrados: ${snapshot.docs.length}`);
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const spotifyUrl = data.spotifyUrl; 
        const hasAllLinks = data.appleMusicUrl && data.tidalUrl && data.amazonMusicUrl;

        if (spotifyUrl && !hasAllLinks) {
            let success = false;
            let attempts = 0;
            
            // Intentar hasta 3 veces si da error 429
            while (!success && attempts < 3) {
                try {
                    attempts++;
                    const encodedUrl = encodeURIComponent(spotifyUrl);
                    const response = await axios.get(`https://api.song.link/v1-alpha.1/links?url=${encodedUrl}`);
                    const linksByPlatform = response.data.linksByPlatform;

                    const appleMusicUrl = linksByPlatform.appleMusic?.url || null;
                    const tidalUrl = linksByPlatform.tidal?.url || null;
                    const amazonMusicUrl = linksByPlatform.amazonMusic?.url || null;

                    await db.collection('albums').doc(doc.id).update({
                        appleMusicUrl: appleMusicUrl,
                        tidalUrl: tidalUrl,
                        amazonMusicUrl: amazonMusicUrl
                    });

                    console.log(`Actualizado con éxito: ${doc.id}`);
                    success = true;
                } catch (error) {
                    if (error.response && error.response.status === 429) {
                        console.warn(`[Aviso] Límite alcanzado (429) en el álbum ${doc.id}. Esperando 10 segundos antes de reintentar (Intento ${attempts})...`);
                        await sleep(10000); // Esperar 10 segundos si da error 429
                    } else {
                        console.error(`Error en el álbum ${doc.id}:`, error.message);
                        break; // Si es otro error distinto a 429, pasar al siguiente
                    }
                }
            }
            
            // Pausa de 3 segundos obligatoria entre cada álbum para cuidar la API
            await sleep(8000);
        }
    }
    console.log('¡Migración finalizada con éxito!');
}

migrateAlbums();
